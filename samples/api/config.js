import 'dotenv/config'

// 未显式设置 NODE_ENV 时按 development 处理，但通过启动警告暴露弱默认凭据，
// 避免生产部署漏配 NODE_ENV 时静默使用内置默认密钥。
const nodeEnv = process.env.NODE_ENV || 'development'

function integerFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) ? value : fallback
}

const gatewayPort = Number.parseInt(process.env.GATEWAY_PORT || '', 10)
const developmentCorsOrigins = [
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  ...(Number.isInteger(gatewayPort) && gatewayPort > 0
    ? [`http://127.0.0.1:${gatewayPort}`, `http://localhost:${gatewayPort}`]
    : []),
]

export const config = {
  port: integerFromEnv('PORT', 3000),
  corsOrigins: (process.env.CORS_ORIGIN || developmentCorsOrigins.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  trustProxy: integerFromEnv('TRUST_PROXY_HOPS', 0),
  slowRequestMs: Math.max(100, integerFromEnv('SLOW_REQUEST_MS', 1000)),
  logStack:
    process.env.LOG_STACK === '1' ||
    (!Object.hasOwn(process.env, 'LOG_STACK') && nodeEnv !== 'production'),
  notificationAutomationEnabled: process.env.NOTIFICATION_AUTOMATION_ENABLED !== 'false',
  notificationAutomationIntervalMs: Math.max(
    60_000,
    integerFromEnv('NOTIFICATION_AUTOMATION_INTERVAL_MS', 300_000),
  ),
  jwtSecret: process.env.JWT_SECRET || 'trade-order-secret-key-2024',
  jwtExpires: process.env.JWT_EXPIRES || '24h',
  initialAdminPassword:
    process.env.INITIAL_ADMIN_PASSWORD || (nodeEnv === 'production' ? '' : 'admin123'),
  internalApiSecret: process.env.INTERNAL_API_SECRET || 'local-platform-internal-api-secret-2026',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: integerFromEnv('DB_PORT', 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    // Every module shares one schema. PLATFORM_DB_NAME is the only supported
    // database-name override so a deployment cannot silently split its data.
    name: process.env.PLATFORM_DB_NAME || 'marine_site',
    connectionLimit: Math.max(2, integerFromEnv('DB_CONNECTION_LIMIT', 10)),
  },
}

if (nodeEnv === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production')
}

if (nodeEnv === 'production' && !process.env.INTERNAL_API_SECRET) {
  throw new Error('INTERNAL_API_SECRET must be set in production')
}

// 内置默认密钥仅限本地开发：任何使用默认值的启动都会打印警告，
// 便于发现生产环境漏配 NODE_ENV 或密钥的情况。
if (!process.env.JWT_SECRET || !process.env.INTERNAL_API_SECRET) {
  const parts = []
  if (!process.env.JWT_SECRET) parts.push('JWT_SECRET')
  if (!process.env.INTERNAL_API_SECRET) parts.push('INTERNAL_API_SECRET')
  console.warn(
    `[config] 正在使用内置默认 ${parts.join(' / ')}，仅限本地开发。` +
      '生产部署必须设置 NODE_ENV=production 并提供独立的 JWT_SECRET 与 INTERNAL_API_SECRET。',
  )
}
