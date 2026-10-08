import { translateApiPayload } from './api-message.js'
import router from '../router/index.js'
import { getToken, removeToken } from './auth.js'
import i18n from '../i18n/index.js'

export async function authenticatedFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    Authorization: `Bearer ${getToken() || ''}`,
    ...options.headers,
  }

  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
      signal: controller.signal,
    })
    if (response.status === 401) {
      removeToken()
      void router.push('/login')
    }
    return response
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(i18n.global.t('api.timeout'))
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

export { translateApiMessage } from './api-message.js'

export async function requestJson(url, options = {}) {
  const response = await authenticatedFetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(translateApiPayload(data, i18n.global.t('api.requestFailed')))
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export async function downloadAuthenticatedFile(url, filename, expectedContentType = '') {
  const response = await authenticatedFetch(url, {}, 30000)
  const contentType = response.headers.get('content-type') || ''
  if (!response.ok || (expectedContentType && !contentType.includes(expectedContentType))) {
    const data = await response.json().catch(() => ({}))
    throw new Error(translateApiPayload(data, i18n.global.t('api.downloadFailed')))
  }

  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    anchor.click()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
