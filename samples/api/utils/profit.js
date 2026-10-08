export function normalizeCostAmount(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('COST_AMOUNT_NOT_POSITIVE')
  const rounded = Math.round(amount * 100) / 100
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > 9999999999.99)
    throw Object.assign(new Error('COST_AMOUNT_OUT_OF_RANGE'), { status: 400 })
  return rounded
}

export function calculateOrderProfit({
  revenue,
  received,
  factoryPaid,
  factoryCommitted,
  otherCosts,
  estimatedProfit,
}) {
  const sales = Math.max(0, Number(revenue) || 0)
  const paid = Math.max(0, Number(received) || 0)
  const factory = Math.max(0, Number(factoryPaid) || 0)
  const extra = Math.max(0, Number(otherCosts) || 0)
  const costs = Math.max(factory, Number(factoryCommitted) || 0) + extra
  const profit = sales - costs
  const estimate = Number(estimatedProfit) || 0
  return {
    revenue: sales,
    received: paid,
    outstanding: Math.max(0, sales - paid),
    factory_paid: factory,
    other_costs: extra,
    total_costs: costs,
    actual_profit: profit,
    margin_rate: sales > 0 ? (profit / sales) * 100 : 0,
    estimated_profit: estimate,
    profit_variance: profit - estimate,
  }
}

export function factoryCostSql(alias = 'o') {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid SQL alias')
  return `GREATEST(COALESCE((SELECT SUM(fp.amount) FROM factory_payments fp WHERE fp.order_id=${alias}.id AND fp.voided_at IS NULL),0),COALESCE(${alias}.factory_payment_amount,0))`
}
