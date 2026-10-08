const IMAGE_PATH_PATTERN =
  /^\/uploads\/(?:quotations|orders|order-products|products)\/[a-zA-Z0-9._/-]+$/

export const quotationCurrencies = ['CNY', 'USD', 'EUR', 'RUB', 'GBP']

export function defaultQuotationCurrency(order) {
  if (order) return 'CNY'
  return 'USD'
}

export function normalizeQuotationTerms(source = {}) {
  const currency = String(source.currency || '')
    .trim()
    .toUpperCase()
  if (!quotationCurrencies.includes(currency))
    throw Object.assign(new Error('QUOTATION_CURRENCY_INVALID'), { status: 400 })
  return {
    currency,
    valid_until: source.valid_until ? String(source.valid_until).slice(0, 10) : null,
    incoterm: text(source.incoterm, 50),
    payment_terms: text(source.payment_terms, 200),
    notes: text(source.notes, 5000),
  }
}

export function quotationVersionTerms(version) {
  try {
    const terms =
      typeof version?.terms_data === 'string' ? JSON.parse(version.terms_data) : version?.terms_data
    return terms && typeof terms === 'object' ? normalizeQuotationTerms(terms) : null
  } catch {
    return null
  }
}

function text(value, maxLength) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength)
}

export function money(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0
}

export function percentage(value) {
  return Math.min(100, money(value))
}

export function normalizeQuotationItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) return null
  if (
    items.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        !text(item.product || item.name, 200) ||
        !['number', 'string'].includes(typeof item.quantity) ||
        String(item.quantity).trim() === '' ||
        !['number', 'string'].includes(typeof item.unitPrice) ||
        String(item.unitPrice).trim() === '' ||
        !Number.isFinite(Number(item.quantity)) ||
        Number(item.quantity) <= 0 ||
        !Number.isFinite(Number(item.unitPrice)) ||
        Number(item.unitPrice) < 0 ||
        (Number(item.unitPrice) > 0 && money(item.unitPrice) === 0) ||
        !Number.isFinite(money(item.quantity)) ||
        money(item.quantity) <= 0 ||
        !Number.isFinite(money(item.unitPrice)),
    )
  )
    return null
  const normalized = items.map((item) => {
    const product = text(item.product || item.name, 200)
    const specification = text(item.specification || item.description, 500)
    const image = text(item.image, 500)
    return {
      product,
      model: text(item.model, 100),
      specification,
      description: text(item.description || item.specification, 1000),
      image: IMAGE_PATH_PATTERN.test(image) ? image : '',
      quantity: money(item.quantity),
      unit: text(item.unit, 30) || 'pc',
      unitPrice: money(item.unitPrice),
    }
  })

  const subtotal = normalized.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  return Number.isFinite(subtotal) && subtotal <= 9999999999.99 ? normalized : null
}

export function normalizeQuotationDocument(document = {}, defaults = {}) {
  const source = { ...defaults, ...document }
  return {
    companyName: text(source.companyName, 200),
    companyNameEn: text(source.companyNameEn, 200),
    companyAddress: text(source.companyAddress, 1000),
    companyAddressEn: text(source.companyAddressEn, 1000),
    companyPhone: text(source.companyPhone, 100),
    companyEmail: text(source.companyEmail, 200),
    companyLogo: /^\/uploads\/[a-zA-Z0-9._/-]+$/.test(text(source.companyLogo, 500))
      ? text(source.companyLogo, 500)
      : '',
    customerName: text(source.customerName, 200),
    customerAddress: text(source.customerAddress, 1000),
    contactName: text(source.contactName, 100),
    contactPhone: text(source.contactPhone, 100),
    contactEmail: text(source.contactEmail, 200),
    salesperson: text(source.salesperson, 100),
    quoteDate: /^\d{4}-\d{2}-\d{2}$/.test(String(source.quoteDate || ''))
      ? String(source.quoteDate)
      : '',
    validityText: text(source.validityText, 100),
  }
}

function quotationAmount(value, code, maximum = 9999999999.99) {
  const input = value == null || value === '' ? 0 : value
  const amount = Number(input)
  if (
    !['number', 'string'].includes(typeof input) ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > maximum
  )
    throw Object.assign(new Error(code), { status: 400 })
  const rounded = money(amount)
  if (!Number.isFinite(rounded) || rounded > maximum)
    throw Object.assign(new Error(code), { status: 400 })
  return rounded
}

export function calculateQuotationTotals(items, freightValue, discountValue, taxRateValue) {
  const subtotal = quotationAmount(
    items.reduce((sum, item) => sum + money(item.quantity) * money(item.unitPrice), 0),
    'QUOTATION_TOTAL_OUT_OF_RANGE',
  )
  const freight = quotationAmount(freightValue, 'QUOTATION_FREIGHT_INVALID')
  const discount = quotationAmount(discountValue, 'QUOTATION_DISCOUNT_INVALID')
  const taxRate = quotationAmount(taxRateValue, 'QUOTATION_TAX_RATE_INVALID', 100)
  const taxableCents =
    Math.round(subtotal * 100) + Math.round(freight * 100) - Math.round(discount * 100)
  if (taxableCents < 0)
    throw Object.assign(new Error('QUOTATION_DISCOUNT_INVALID'), { status: 400 })
  const taxCents = Math.round((taxableCents * taxRate) / 100)
  const totalAmount = quotationAmount(
    (taxableCents + taxCents) / 100,
    'QUOTATION_TOTAL_OUT_OF_RANGE',
  )
  return { subtotal, freight, discount, taxRate, taxAmount: taxCents / 100, totalAmount }
}
