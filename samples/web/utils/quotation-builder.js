// Pure quotation rules are shared with the API; this module has no server dependencies.
import {
  calculateQuotationTotals,
  defaultQuotationCurrency,
  normalizeQuotationItems,
  quotationCurrencies,
  quotationVersionTerms,
} from '../../../trade-api/utils/quotation.js'
import i18n from '../i18n/index.js'

export function isoDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function emptyQuotationItem(overrides = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    image: '',
    product: '',
    model: '',
    specification: '',
    description: '',
    quantity: 1,
    unit: 'pc',
    unitPrice: 0,
    ...overrides,
  }
}

export function factoryProductToQuotationItem(product = {}, currency = 'CNY') {
  const moq = Number(product.moq)
  const salesPrice = Number(product.sales_price)
  return emptyQuotationItem({
    image: String(product.image || ''),
    product: String(product.name || ''),
    model: String(product.product_code || ''),
    specification: String(product.specification || ''),
    description: String(product.specification || ''),
    quantity: Number.isFinite(moq) && moq > 0 ? moq : 1,
    unit: 'pc',
    unitPrice:
      currency === 'CNY' && Number.isFinite(salesPrice) && salesPrice >= 0 ? salesPrice : null,
  })
}

export const quotationTotals = calculateQuotationTotals

export function quotationPreview(form) {
  if ('currency' in form && !quotationCurrencies.includes(form.currency))
    return { totals: null, error: 'QUOTATION_CURRENCY_INVALID' }
  const items = normalizeQuotationItems(form.items)
  if (!items) return { totals: null, error: 'QUOTATION_ITEM_REQUIRED' }
  try {
    return {
      totals: quotationTotals(items, form.freight, form.discount, form.tax_rate),
      error: null,
    }
  } catch (error) {
    return { totals: null, error: error.message }
  }
}

function parseJson(value, fallback) {
  if (!value) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function contextToQuotation(context) {
  const contact = context.customer?.primaryContact || {}
  const order = context.order
  const quoteDate = isoDate()
  const validUntil = new Date(`${quoteDate}T00:00:00+08:00`)
  validUntil.setDate(validUntil.getDate() + 30)
  return {
    currency: defaultQuotationCurrency(order),
    valid_until: isoDate(validUntil),
    incoterm: 'FOB Shanghai',
    payment_terms: '30% deposit, balance before shipment',
    notes: `${i18n.global.t('quotationBuilder.deliveryLabel')}：${i18n.global.t('quotationBuilder.deliveryDefault')}\n${i18n.global.t('quotationBuilder.packagingLabel')}：${i18n.global.t('quotationBuilder.packagingDefault')}`,
    freight: 0,
    discount: 0,
    tax_rate: 0,
    document: {
      companyName: context.company?.name || '',
      companyNameEn: context.company?.nameEn || '',
      companyAddress: context.company?.address || '',
      companyAddressEn: context.company?.addressEn || '',
      companyPhone: context.salesperson?.phone || context.company?.phone || '',
      companyEmail: context.salesperson?.email || context.company?.email || '',
      companyLogo: context.company?.logo || '',
      customerName: context.customer?.company_name || '',
      customerAddress: context.customer?.address || '',
      contactName: contact.name || context.customer?.contact_name || '',
      contactPhone: contact.phone || context.customer?.phone || '',
      contactEmail: contact.email || context.customer?.email || '',
      salesperson: context.salesperson?.name || '',
      quoteDate,
      validityText: '30 days',
    },
    items: [
      emptyQuotationItem(
        order
          ? {
              product: order.product_name || '',
              image: order.image || '',
              quantity: Number(order.quantity) || 1,
              unitPrice: Number(order.unit_price) || 0,
            }
          : {},
      ),
    ],
  }
}

export function versionToQuotation(_quote, version, fallback) {
  const items = parseJson(version?.items, []).map((item) => emptyQuotationItem(item))
  const document = parseJson(version?.document_data, null)
  const terms = quotationVersionTerms(version)
  return {
    ...fallback,
    currency: terms?.currency || '',
    valid_until: terms?.valid_until || '',
    incoterm: terms?.incoterm || '',
    payment_terms: terms?.payment_terms || '',
    notes: terms?.notes || '',
    terms_missing: !terms,
    freight: Number(version?.freight) || 0,
    discount: Number(version?.discount) || 0,
    tax_rate: Number(version?.tax_rate) || 0,
    document: document ? { ...fallback.document, ...document } : fallback.document,
    items: items.length ? items : fallback.items,
  }
}

export function changeQuotationCurrency(form, currency) {
  if (form.currency === currency) return
  form.currency = currency
  form.items.forEach((item) => {
    item.unitPrice = null
  })
  form.freight = 0
  form.discount = 0
}

export function quotationPayload(form, customerId, orderId) {
  return {
    customer_id: Number(customerId),
    order_id: orderId ? Number(orderId) : null,
    currency: form.currency,
    valid_until: form.valid_until || null,
    incoterm: form.incoterm,
    payment_terms: form.payment_terms,
    notes: form.notes,
    freight: form.freight ?? 0,
    discount: form.discount ?? 0,
    tax_rate: form.tax_rate ?? 0,
    document: { ...form.document },
    items: form.items.map(({ id: _id, ...item }) => ({ ...item })),
  }
}
