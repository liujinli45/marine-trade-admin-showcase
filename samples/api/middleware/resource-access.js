import pool from '../db.js'
import { canAccessOwner } from '../utils/owner-scope.js'

// 资源不存在与「存在但不属于当前业务员」故意返回同一个码：
// 404 是隐藏存在性，不能因为文案不同让人推断出「这条记录其实存在」。
// 文案由前端按 apiError.RESOURCE_NOT_FOUND 渲染（见 system-messages.js）。
//
// 字面量内联而不是抽常量：契约门禁（test/response-code-contract.test.js）
// 只认「message 后紧跟引号字面量」，写成「message 后跟常量名」会从它眼皮底下溜过去。

export function ownsResource(user, resource) {
  if (!user || !resource) return false
  return canAccessOwner(user, resource.created_by)
}

export function createResourceAccessGuard({
  table,
  parameter,
  activeCondition = '',
  query = pool.query.bind(pool),
}) {
  return async function resourceAccessGuard(req, res, next) {
    const id = Number(req.params[parameter])
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ code: 404, message: 'RESOURCE_NOT_FOUND' })
    }
    try {
      const [rows] = await query(
        `SELECT id, created_by FROM \`${table}\` WHERE id = ?${activeCondition} LIMIT 1`,
        [id],
      )
      if (!ownsResource(req.user, rows[0])) {
        return res.status(404).json({ code: 404, message: 'RESOURCE_NOT_FOUND' })
      }
      req.accessResource = rows[0]
      next()
    } catch (error) {
      next(error)
    }
  }
}

export const requireCustomerAccess = createResourceAccessGuard({
  table: 'customers',
  parameter: 'id',
  activeCondition: ' AND archived_at IS NULL',
})
export const requireOrderAccess = createResourceAccessGuard({ table: 'orders', parameter: 'id' })
export const requireOrderParamAccess = createResourceAccessGuard({
  table: 'orders',
  parameter: 'orderId',
})
export const requireFactoryAccess = createResourceAccessGuard({
  table: 'factories',
  parameter: 'id',
})
export const requireFactoryParamAccess = createResourceAccessGuard({
  table: 'factories',
  parameter: 'factoryId',
})
export const requireQuotationAccess = createResourceAccessGuard({
  table: 'quotations',
  parameter: 'id',
})
