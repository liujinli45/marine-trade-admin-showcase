// Confirmation flags and legacy receipts describe the same money; never add them.
export function receivedAmount(order, recorded = 0) {
  const confirmed = order.final_payment_received
    ? Number(order.total_amount)
    : order.deposit_received
      ? Number(order.deposit_amount)
      : 0
  return Math.max(0, Number(recorded) || 0, confirmed || 0)
}

export function recordedReceiptsSql(alias = 'o') {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid SQL alias')
  return `COALESCE((SELECT SUM(rp.amount) FROM payment_records rp WHERE rp.order_id=${alias}.id AND rp.voided_at IS NULL),0)`
}

export function receivedSql(alias = 'o') {
  return `GREATEST(${recordedReceiptsSql(alias)}, CASE WHEN ${alias}.final_payment_received=1 THEN ${alias}.total_amount WHEN ${alias}.deposit_received=1 THEN ${alias}.deposit_amount ELSE 0 END)`
}

export function receiptStatusSql(alias = 'o') {
  const received = receivedSql(alias)
  return `CASE WHEN ${received}<=0 THEN 'unpaid' WHEN ${received}>=${alias}.total_amount THEN 'paid' ELSE 'partial' END`
}

export function orderFinancialChanged(existing, update) {
  const fields = { customer_id: 'customerId', factory_id: 'factoryId', quantity: 'quantity', unit_price: 'unitPrice', total_amount: 'totalAmount', deposit_amount: 'depositAmount', factory_payment_amount: 'factoryPaymentAmount', customer_quote: 'customerQuote', estimated_profit: 'estimatedProfit', exchange_rate: 'exchangeRate', price_includes_vat: 'priceIncludesVat', need_customs_declaration: 'needCustomsDeclaration' }
  return Object.entries(fields).some(([key, field]) => Number(existing[key] || 0) !== Number(update[field] || 0)) || String(existing.customer_quote_currency || '') !== String(update.customerQuoteCurrency ?? existing.customer_quote_currency ?? '')
}

export function assertOrderFinancialEdit(existing, update, user) {
  if (existing.status === 'completed' && orderFinancialChanged(existing, update)) throw new Error('COMPLETED_ORDER_FINANCIAL_LOCKED')
  const changed = Number(existing.total_amount) !== update.totalAmount
  if (update.depositAmount > update.totalAmount) throw new Error('DEPOSIT_EXCEEDS_TOTAL')
  if (existing.deposit_received && Number(existing.deposit_amount) !== update.depositAmount) {
    throw new Error('CONFIRMED_DEPOSIT_LOCKED')
  }
  if (changed && (existing.final_payment_received || existing.status === 'completed')) {
    throw new Error('SETTLED_ORDER_AMOUNT_LOCKED')
  }
  if (update.totalAmount < Number(existing.received_amount || 0))
    throw new Error('TOTAL_BELOW_RECEIVED')
  if (user.role === 'sales' && !['pending', 'returned'].includes(existing.status)) {
    const fields = {
      quantity: 'quantity',
      unit_price: 'unitPrice',
      customer_quote: 'customerQuote',
      factory_payment_amount: 'factoryPaymentAmount',
      estimated_profit: 'estimatedProfit',
    }
    if (
      String(existing.customer_quote_currency || '') !==
        String(update.customerQuoteCurrency ?? existing.customer_quote_currency ?? '') ||
      Object.entries(fields).some(
        ([key, normalized]) => Number(existing[key]) !== Number(update[normalized]),
      )
    ) {
      throw new Error('ORDER_CHANGE_APPROVAL_REQUIRED')
    }
  }
}
