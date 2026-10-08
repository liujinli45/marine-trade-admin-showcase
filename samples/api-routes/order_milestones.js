import { Router } from 'express'
import pool from '../db.js'
import { requireRole } from '../middleware/auth.js'
import { requireOrderParamAccess } from '../middleware/resource-access.js'
import { sendNotification } from './notifications.js'
import { logRouteError } from '../utils/route-logger.js'

const router = Router({ mergeParams: true })
const types = new Set([
  'purchase',
  'production',
  'inspection',
  'shipment',
  'arrival',
  'customs',
  'custom',
])
const dateOnly = (value) =>
  value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value || '').slice(0, 10)

function validPlannedDate(value) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function logMilestoneFailure(event, req, error) {
  logRouteError(event, req, error)
}

async function notifyOrderOwner(orderId, actorId, type, params) {
  try {
    const [[order]] = await pool.query('SELECT id, order_no, created_by FROM orders WHERE id=?', [
      orderId,
    ])
    if (order?.created_by && Number(order.created_by) !== Number(actorId)) {
      await sendNotification(
        order.created_by,
        type,
        `notificationMessage.titles.${type}`,
        JSON.stringify({ orderNo: order.order_no, ...params }),
        order.id,
      )
    }
  } catch (error) {
    logRouteError('milestone_notification_delivery_failed', undefined, error)
  }
}

router.use(requireOrderParamAccess)

router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.*, u.name AS creator_name,
      CASE WHEN m.completed_at IS NOT NULL THEN 'completed' WHEN m.planned_date < CURDATE() THEN 'delayed' ELSE 'pending' END AS effective_status
      FROM order_milestones m LEFT JOIN users u ON u.id=m.created_by WHERE m.order_id=? ORDER BY m.planned_date, m.id`,
      [req.params.orderId],
    )
    res.json({ code: 200, data: rows })
  } catch (error) {
    logMilestoneFailure('milestone_load_failed', req, error)
    res.status(500).json({ code: 500, message: 'MILESTONE_LOAD_FAILED' })
  }
})

router.post('/', async (req, res) => {
  const type = types.has(req.body?.milestone_type) ? req.body.milestone_type : 'custom'
  const title = String(req.body?.title || '')
      .trim()
      .slice(0, 200),
    planned = String(req.body?.planned_date || '')
  if (!title || !validPlannedDate(planned))
    return res.status(400).json({ code: 400, message: 'MILESTONE_TITLE_DATE_REQUIRED' })
  try {
    const [result] = await pool.query(
      'INSERT INTO order_milestones (order_id, milestone_type, title, planned_date, notes, created_by) VALUES (?,?,?,?,?,?)',
      [
        req.params.orderId,
        type,
        title,
        planned,
        String(req.body?.notes || '').slice(0, 1000),
        req.user.id,
      ],
    )
    await notifyOrderOwner(req.params.orderId, req.user.id, 'order_milestone_created', {
      title,
      date: planned,
    })
    res.json({ code: 200, data: { id: result.insertId } })
  } catch (error) {
    logMilestoneFailure('milestone_create_failed', req, error)
    res.status(500).json({ code: 500, message: 'MILESTONE_CREATE_FAILED' })
  }
})

router.put('/:id/complete', async (req, res) => {
  const completed = req.body?.completed
  if (typeof completed !== 'boolean')
    return res.status(400).json({ code: 400, message: 'MILESTONE_COMPLETION_REQUIRED' })
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [[milestone]] = await connection.query(
      'SELECT title, completed_at FROM order_milestones WHERE id=? AND order_id=? FOR UPDATE',
      [req.params.id, req.params.orderId],
    )
    if (!milestone) {
      await connection.rollback()
      return res.status(404).json({ code: 404, message: 'MILESTONE_NOT_FOUND' })
    }
    const changed = Boolean(milestone.completed_at) !== completed
    if (changed)
      await connection.query(
        'UPDATE order_milestones SET completed_at=IF(?, NOW(), NULL) WHERE id=? AND order_id=?',
        [completed, req.params.id, req.params.orderId],
      )
    await connection.commit()
    connection.release()
    connection = null
    if (changed)
      await notifyOrderOwner(
        req.params.orderId,
        req.user.id,
        completed ? 'order_milestone_completed' : 'order_milestone_reopened',
        { title: milestone.title },
      )
    res.json({ code: 200 })
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {})
    logMilestoneFailure('milestone_toggle_failed', req, error)
    res.status(500).json({ code: 500, message: 'MILESTONE_UPDATE_FAILED' })
  } finally {
    connection?.release()
  }
})

router.put('/:id', async (req, res) => {
  const type = types.has(req.body?.milestone_type) ? req.body.milestone_type : 'custom'
  const title = String(req.body?.title || '')
    .trim()
    .slice(0, 200)
  const planned = String(req.body?.planned_date || '')
  const reason = String(req.body?.reschedule_reason || '')
    .trim()
    .slice(0, 500)
  if (!title || !validPlannedDate(planned))
    return res.status(400).json({ code: 400, message: 'MILESTONE_TITLE_DATE_REQUIRED' })
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [rows] = await connection.query(
      'SELECT planned_date FROM order_milestones WHERE id=? AND order_id=? FOR UPDATE',
      [req.params.id, req.params.orderId],
    )
    if (!rows.length) {
      await connection.rollback()
      return res.status(404).json({ code: 404, message: 'MILESTONE_NOT_FOUND' })
    }
    const previous = dateOnly(rows[0].planned_date)
    if (previous !== planned && !reason) {
      await connection.rollback()
      return res.status(400).json({ code: 400, message: 'MILESTONE_RESCHEDULE_REASON_REQUIRED' })
    }
    await connection.query(
      `UPDATE order_milestones SET milestone_type=?,title=?,planned_date=?,notes=?,
      original_planned_date=IF(?<>?,COALESCE(original_planned_date,?),original_planned_date),
      reschedule_reason=IF(?<>?, ?,reschedule_reason),rescheduled_at=IF(?<>?,NOW(),rescheduled_at),rescheduled_by=IF(?<>?, ?,rescheduled_by)
      WHERE id=? AND order_id=?`,
      [
        type,
        title,
        planned,
        String(req.body?.notes || '').slice(0, 1000),
        previous,
        planned,
        previous,
        previous,
        planned,
        reason,
        previous,
        planned,
        previous,
        planned,
        req.user.id,
        req.params.id,
        req.params.orderId,
      ],
    )
    await connection.commit()
    res.json({ code: 200, message: 'MILESTONE_UPDATED' })
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {})
    logMilestoneFailure('milestone_update_failed', req, error)
    res.status(500).json({ code: 500, message: 'MILESTONE_UPDATE_FAILED' })
  } finally {
    connection?.release()
  }
})

router.delete('/:id', requireRole('admin', 'manager'), async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM order_milestones WHERE id=? AND order_id=?', [
      req.params.id,
      req.params.orderId,
    ])
    if (!result.affectedRows)
      return res.status(404).json({ code: 404, message: 'MILESTONE_NOT_FOUND' })
    res.json({ code: 200 })
  } catch (error) {
    logMilestoneFailure('milestone_delete_failed', req, error)
    res.status(500).json({ code: 500, message: 'MILESTONE_DELETE_FAILED' })
  }
})

export default router
