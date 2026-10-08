import crypto from 'node:crypto'

const editFields = ['customer_id', 'factory_id', 'product_name', 'quantity', 'unit_price', 'total_amount', 'ship_date', 'arrival_date', 'transport_mode', 'payment_method', 'exchange_rate', 'notes', 'customer_quote', 'customer_quote_currency', 'estimated_profit', 'price_includes_vat', 'need_customs_declaration', 'deposit_amount', 'factory_payment_amount', 'status', 'new_customer_name', 'new_factory_name']

export function orderEditVersion(order) {
  return crypto.createHash('sha256').update(JSON.stringify(editFields.map(key => order[key] ?? null))).digest('hex')
}

export async function lockFinancialOrder(connection, id) {
  const [[order]] = await connection.query('SELECT * FROM orders WHERE id=? FOR UPDATE', [id])
  if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 })
  if (order.status === 'completed') throw Object.assign(new Error('COMPLETED_ORDER_FINANCIAL_LOCKED'), { status: 409 })
  return order
}

export async function invalidateProfit(connection, id) {
  await connection.query('UPDATE orders SET profit_confirmed=0 WHERE id=?', [id])
}

// The reservation and business writes share a transaction. A lost response can
// be retried after a restart without creating a second business record.
export async function reserveSubmission(connection, req, scope) {
  const key = req.get('Idempotency-Key')
  if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
    throw Object.assign(new Error('SUBMISSION_KEY_REQUIRED'), { status: 400 })
  const hash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex')
  await connection.query('INSERT IGNORE INTO submission_receipts (user_id, scope, request_key, body_hash) VALUES (?,?,?,?)', [req.user.id, scope, key, hash])
  const [[row]] = await connection.query('SELECT body_hash,response_json FROM submission_receipts WHERE user_id=? AND scope=? AND request_key=? FOR UPDATE', [req.user.id, scope, key])
  if (row.body_hash !== hash) throw Object.assign(new Error('SUBMISSION_KEY_REUSED'), { status: 409 })
  return {
    response: row.response_json ? JSON.parse(row.response_json) : null,
    complete: response => connection.query('UPDATE submission_receipts SET response_json=? WHERE user_id=? AND scope=? AND request_key=?', [JSON.stringify(response), req.user.id, scope, key]),
  }
}
