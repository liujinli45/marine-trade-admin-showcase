import { Router } from 'express'
import pool from '../db.js'
import { logRouteError } from '../utils/route-logger.js'
import { requireRole } from '../middleware/auth.js'
import { MENU_KEY_SET } from '../utils/menu-keys.js'

const router = Router()
// 白名单与角色默认授权、前端勾选项同源，见 utils/menu-keys.js。
const ALLOWED_MENUS = MENU_KEY_SET

router.get('/my', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT menu_key FROM user_permissions WHERE user_id = ? ORDER BY id',
      [req.user.id],
    )
    res.json({ code: 200, data: rows.map((row) => row.menu_key) })
  } catch (err) {
    logRouteError('permission_load_failed', req, err)
    res.status(500).json({ code: 500, message: 'SERVER_ERROR' })
  }
})

router.use(requireRole('admin'))

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.username, u.name, u.role, u.locale, up.menu_key
      FROM users u LEFT JOIN user_permissions up ON up.user_id = u.id
      ORDER BY u.created_at DESC, up.id
    `)
    const users = new Map()
    for (const row of rows) {
      if (!users.has(row.id))
        users.set(row.id, {
          id: row.id,
          username: row.username,
          name: row.name,
          role: row.role,
          locale: row.locale,
          menus: [],
        })
      if (row.menu_key) users.get(row.id).menus.push(row.menu_key)
    }
    res.json({ code: 200, data: [...users.values()] })
  } catch (err) {
    logRouteError('permission_list_failed', req, err)
    res.status(500).json({ code: 500, message: 'SERVER_ERROR' })
  }
})

router.put('/:userId', async (req, res) => {
  const userId = Number(req.params.userId)
  const menus = Array.isArray(req.body.menus) ? [...new Set(req.body.menus)] : null
  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    !menus ||
    menus.some((menu) => !ALLOWED_MENUS.has(menu))
  ) {
    return res.status(400).json({ code: 400, message: 'PERMISSION_CONFIG_INVALID' })
  }
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [users] = await connection.query('SELECT id FROM users WHERE id = ?', [userId])
    if (!users.length) {
      await connection.rollback()
      return res.status(404).json({ code: 404, message: 'USER_NOT_FOUND' })
    }
    await connection.query('DELETE FROM user_permissions WHERE user_id = ?', [userId])
    for (const menu of menus)
      await connection.query('INSERT INTO user_permissions (user_id, menu_key) VALUES (?, ?)', [
        userId,
        menu,
      ])
    await connection.commit()
    res.json({ code: 200, message: 'PERMISSION_UPDATED' })
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {})
    logRouteError('permission_update_failed', req, err)
    res.status(500).json({ code: 500, message: 'SERVER_ERROR' })
  } finally {
    connection?.release()
  }
})

export default router
