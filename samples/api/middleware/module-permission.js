import pool from '../db.js'

// Module grants are checked on every request so revocation takes effect immediately.
// Admin retains the same unconditional access as the management UI.
export function requireModulePermission(...menus) {
  return async (req, res, next) => {
    if (req.user?.role === 'admin') return next()
    try {
      if (!(await hasModulePermission(pool, req.user, ...menus)))
        return res.status(403).json({ code: 403, message: 'MODULE_PERMISSION_DENIED' })
      next()
    } catch (error) {
      next(error)
    }
  }
}

export async function hasModulePermission(database, user, ...menus) {
  if (user.role === 'admin') return true
  const [rows] = await database.query(
    `SELECT 1 FROM user_permissions WHERE user_id=? AND menu_key IN (${menus.map(() => '?').join(',')}) LIMIT 1`,
    [user.id, ...menus],
  )
  return rows.length > 0
}
