import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import pool from '../db.js'

const JWT_SECRET = config.jwtSecret
const JWT_EXPIRES = config.jwtExpires

export { JWT_SECRET, JWT_EXPIRES }

export async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]

  if (!token) {
    return res.status(401).json({ code: 401, message: 'AUTH_REQUIRED' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const [rows] = await pool.query(
      'SELECT id, role, token_version, must_change_password FROM users WHERE id = ? LIMIT 1',
      [decoded.id],
    )
    if (!rows.length || Number(decoded.tokenVersion || 0) !== Number(rows[0].token_version || 0)) {
      return res.status(401).json({ code: 401, message: 'AUTH_SESSION_REVOKED' })
    }
    req.user = {
      ...decoded,
      role: rows[0].role,
      ownerIds: [Number(rows[0].id)],
      mustChangePassword: Boolean(rows[0].must_change_password),
    }
    if (req.user.role === 'manager') {
      const [team] = await pool.query("SELECT id FROM users WHERE role='sales' AND manager_id=?", [
        rows[0].id,
      ])
      req.user.ownerIds.push(...team.map((member) => Number(member.id)))
    }
    next()
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'AUTH_SESSION_EXPIRED' })
  }
}

export function requirePasswordChanged(req, res, next) {
  if (req.user?.mustChangePassword)
    return res
      .status(403)
      .json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'PASSWORD_CHANGE_REQUIRED' })
  next()
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: 'FORBIDDEN' })
    }
    next()
  }
}
