import { requireModulePermission } from './middleware/module-permission.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import customerRoutes from './routes/customers.js'
import orderRoutes from './routes/orders.js'
import factoryRoutes from './routes/factories.js'
import statsRoutes from './routes/stats.js'
import notificationRoutes, { runNotificationAutomation } from './routes/notifications.js'
import factoryProductRoutes from './routes/factory_products.js'
import permissionRoutes from './routes/permissions.js'
import salespersonRoutes from './routes/salespersons.js'
import orderChangeRequestRoutes from './routes/order_change_requests.js'
import factoryPaymentRoutes from './routes/factory_payments.js'
import quotationRoutes from './routes/quotations.js'
import orderMilestoneRoutes from './routes/order_milestones.js'
import customerContactRoutes from './routes/customer_contacts.js'
import orderCostRoutes from './routes/order_costs.js'
import { authMiddleware, requirePasswordChanged } from './middleware/auth.js'
import { config } from './config.js'
import { logFatalProcessError, logRouteError } from './utils/route-logger.js'
import pool from './db.js'
import { configureHttpServer, requestContext } from './utils/http-runtime.js'
import { publicUploads } from './utils/public-uploads.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = config.port

app.disable('x-powered-by')
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy)
app.use(requestContext({ service: 'trade-api', slowMs: config.slowRequestMs }))
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true)
      return callback(new Error('CORS_ORIGIN_DENIED'))
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))

app.get('/health', async (_req, res) => {
  const timestamp = new Date().toISOString()
  try {
    const started = Date.now()
    await pool.query('SELECT 1')
    const result = {
      status: 'ok',
      service: 'trade-api',
      database: 'ok',
      latencyMs: Date.now() - started,
      timestamp,
    }
    res.json(result)
  } catch {
    const result = {
      status: 'degraded',
      service: 'trade-api',
      database: 'error',
      timestamp,
    }
    res.status(503).json(result)
  }
})

app.use('/uploads', publicUploads({ uploadsRoot: path.join(__dirname, 'uploads'), database: pool }))

// 公开登录路由。后台仅供内部人员使用，输错密码只记录审计，不锁定账号或按频率封禁。
app.use('/api/auth', authRoutes)

const authenticatedApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // A development session can trigger many parallel requests and hot reloads.
  // Keep the stricter production ceiling while avoiding false 429 responses locally.
  limit: process.env.NODE_ENV === 'production' ? 1200 : 10000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { code: 429, message: 'RATE_LIMITED' },
})

// Internal integration used by the website backend. Browsers must never call
// this endpoint directly because it deliberately authenticates service-to-service.
app.post('/api/internal/inquiries/convert', async (req, res) => {
  if (!config.internalApiSecret || req.get('x-internal-api-secret') !== config.internalApiSecret) {
    return res.status(401).json({ code: 401, message: 'INTERNAL_SECRET_INVALID' })
  }

  const { inquiryId, company, name, email, phone, country, productName, createdBy } = req.body || {}
  const normalizedInquiryId = Number(inquiryId)
  const normalizedCreatedBy = Number(createdBy)
  if (
    !Number.isInteger(normalizedInquiryId) ||
    normalizedInquiryId <= 0 ||
    !String(name || '').trim() ||
    !String(email || '').trim()
  ) {
    return res.status(400).json({ code: 400, message: 'INQUIRY_PAYLOAD_INVALID' })
  }
  if (!Number.isInteger(normalizedCreatedBy) || normalizedCreatedBy <= 0) {
    return res.status(400).json({ code: 400, message: 'INQUIRY_ASSIGNEE_INVALID' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [existing] = await connection.query(
      'SELECT id FROM customers WHERE source_inquiry_id = ? LIMIT 1',
      [normalizedInquiryId],
    )
    if (existing.length) {
      await connection.commit()
      return res.json({ code: 200, data: { id: existing[0].id, existed: true } })
    }

    const companyName =
      String(company || '').trim() || `${String(name).trim()} (${String(email).trim()})`
    const notes = [
      `Website inquiry #${normalizedInquiryId}`,
      productName ? `Product: ${productName}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    const [customerResult] = await connection.query(
      `INSERT INTO customers (company_name, contact_name, phone, email, country, category, source, credit_level, notes, tags, customer_type, lead_stage, estimated_value, created_by, source_inquiry_id)
       VALUES (?, ?, ?, ?, ?, 'potential', 'website_inquiry', 'B', ?, '', 'new', 'lead', 0, ?, ?)`,
      [
        companyName,
        String(name).trim(),
        phone || null,
        String(email).trim(),
        country || null,
        notes,
        normalizedCreatedBy,
        normalizedInquiryId,
      ],
    )
    const customerId = customerResult.insertId
    await connection.query(
      'INSERT INTO customer_contacts (customer_id, name, phone, email, is_primary, notes) VALUES (?, ?, ?, ?, 1, ?)',
      [
        customerId,
        String(name).trim(),
        phone || null,
        String(email).trim(),
        `From website inquiry #${normalizedInquiryId}`,
      ],
    )
    await connection.commit()
    return res.json({ code: 200, data: { id: customerId, existed: false } })
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      const [existing] = await pool.query(
        'SELECT id FROM customers WHERE source_inquiry_id = ? LIMIT 1',
        [normalizedInquiryId],
      )
      if (existing.length)
        return res.json({ code: 200, data: { id: existing[0].id, existed: true } })
    }
    logRouteError('inquiry_conversion_failed', req, error)
    return res.status(500).json({ code: 500, message: 'INQUIRY_CONVERT_FAILED' })
  } finally {
    connection.release()
  }
})

// 需要认证的路由 - authMiddleware 统一在 /api 层挂载一次，
// 各子路由无需重复鉴权（避免每请求两次 JWT 校验与两次查库）。
app.use('/api', authenticatedApiLimiter, authMiddleware, requirePasswordChanged)
app.use('/api/users', userRoutes)
app.use('/api/customers', requireModulePermission('customers'), customerRoutes)
app.use('/api/customers/:id/contacts', requireModulePermission('customers'), customerContactRoutes)
app.use('/api/orders/:orderId/milestones', requireModulePermission('orders'), orderMilestoneRoutes)
app.use('/api/orders/:orderId/costs', requireModulePermission('orders'), orderCostRoutes)
app.use('/api/orders', requireModulePermission('orders'), orderRoutes)
app.use(
  '/api/factories/:factoryId/products',
  requireModulePermission('factories'),
  factoryProductRoutes,
)
app.use('/api/factories', requireModulePermission('factories'), factoryRoutes)
app.use('/api/factory-payments', requireModulePermission('orders'), factoryPaymentRoutes)
app.use('/api/stats', requireModulePermission('stats'), statsRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/permissions', permissionRoutes)
app.use('/api/salespersons', requireModulePermission('salespersons', 'users'), salespersonRoutes)
app.use('/api/order-change-requests', requireModulePermission('orders'), orderChangeRequestRoutes)
app.use('/api/quotations', requireModulePermission('customers'), quotationRoutes)

// 未匹配任何 /api 路由时回 JSON，而不是 Express 默认的 HTML 404。
// 前端 axios 拦截器按 JSON 读 message；拿到 HTML 会把整段标签当成错误信息渲染。
app.use('/api', (_req, res) => res.status(404).json({ code: 404, message: 'API_ROUTE_NOT_FOUND' }))

// 全局错误处理中间件
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 413, message: 'REQUEST_TOO_LARGE' })
  }
  if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({ code: 413, message: 'UPLOAD_TOO_LARGE' })
  }
  if (err.message === 'CORS_ORIGIN_DENIED') {
    return res.status(403).json({ code: 403, message: 'ORIGIN_FORBIDDEN' })
  }
  logRouteError('unhandled_error', req, err)
  res.status(500).json({ code: 500, message: 'SERVER_ERROR' })
})

let notificationAutomationTimer
let notificationAutomationWarmup

export function startTradeAutomation() {
  if (!config.notificationAutomationEnabled || notificationAutomationTimer) return () => {}
  const automateNotifications = async () => {
    try {
      const result = await runNotificationAutomation()
      if (!result.skipped)
        console.log(
          JSON.stringify({
            event: 'notification_automation',
            service: 'trade-api',
            users: result.users,
          }),
        )
    } catch (error) {
      logRouteError('notification_automation_failed', undefined, error)
    }
  }
  notificationAutomationTimer = setInterval(
    automateNotifications,
    config.notificationAutomationIntervalMs,
  )
  notificationAutomationTimer.unref()
  notificationAutomationWarmup = setTimeout(automateNotifications, 5_000)
  notificationAutomationWarmup.unref()
  return () => {
    if (notificationAutomationTimer) clearInterval(notificationAutomationTimer)
    if (notificationAutomationWarmup) clearTimeout(notificationAutomationWarmup)
    notificationAutomationTimer = undefined
    notificationAutomationWarmup = undefined
  }
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isDirectExecution) {
  const server = configureHttpServer(
    app.listen(PORT, () => console.log(`服务器运行在 http://localhost:${PORT}`)),
  )
  const stopTradeAutomation = startTradeAutomation()
  let shuttingDown = false
  async function shutdown(signal, exitCode = 0) {
    if (shuttingDown) return
    shuttingDown = true
    stopTradeAutomation()
    console.log(JSON.stringify({ event: 'shutdown', service: 'trade-api', signal, exitCode }))
    server.close(async () => {
      await pool.end().catch(() => {})
      process.exit(exitCode)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'))
  process.once('SIGINT', () => shutdown('SIGINT'))

  // 生产环境由 apps/gateway/server.js 托管进程（那里已有 fatal_process_error 处理）。
  // 这一段只覆盖 `node apps/trade-api/app.js` 直跑：未捕获异常要留下结构化记录，
  // 否则容器里只剩一段没有 service / requestId 的裸堆栈，无法与请求日志关联。
  process.once('uncaughtException', (error) => {
    logFatalProcessError('uncaughtException', error)
    shutdown('uncaughtException', 1)
  })
  process.once('unhandledRejection', (reason) => {
    logFatalProcessError('unhandledRejection', reason)
    shutdown('unhandledRejection', 1)
  })
}

export default app
