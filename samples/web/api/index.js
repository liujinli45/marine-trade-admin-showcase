import { translateApiPayload } from '../utils/api-message.js'
import axios from 'axios'
import { prepareSubmission, finishSubmission } from './submission-keys.js'
import { getToken, removeToken } from '../utils/auth.js'
import { ElMessage } from 'element-plus'
import router from '../router/index.js'
import { createUnauthorizedHandler } from './session-expiry.js'
import i18n from '../i18n/index.js'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/trade',
  timeout: 10000,
})

const handleUnauthorized = createUnauthorizedHandler({
  clearSession: removeToken,
  navigate: (path) => router.push(path),
  notify: (message) => ElMessage.error(message),
})

api.interceptors.request.use(async (config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  await prepareSubmission(config, token)
  return config
})

api.interceptors.response.use(
  (response) => {
    finishSubmission(response.config)
    const { data } = response
    if (data?.message) data.message = translateApiPayload(data)
    if (data.code === 401 && response.config.silentError) {
      return Promise.reject(data)
    }
    if (data.code === 401) {
      handleUnauthorized(data.message || i18n.global.t('api.sessionExpired'))
      return Promise.reject(data)
    }
    return data
  },
  async (error) => {
    let payload = error.response?.data || error
    if (payload instanceof Blob && payload.type.includes('json')) {
      try {
        payload = JSON.parse(await payload.text())
      } catch {
        // Retain the normal status fallback when a download error is not valid JSON.
      }
    }
    const translated = translateApiPayload(payload)
    if (translated) payload.message = translated
    if (error.config?.silentError) return Promise.reject(payload)
    if (error.response) {
      const status = error.response.status
      if (status === 401) {
        handleUnauthorized(i18n.global.t('api.sessionExpiredRelogin'))
      } else if (status === 403) {
        ElMessage.error(payload.message || i18n.global.t('api.forbidden'))
      } else if (status === 404) {
        ElMessage.error(i18n.global.t('api.notFound'))
      } else if (status === 429) {
        ElMessage.error(error.response.data?.message || i18n.global.t('api.rateLimited'))
      } else if (status >= 500) {
        ElMessage.error(i18n.global.t('api.serverError'))
      } else {
        ElMessage.error(payload.message || i18n.global.t('api.requestFailed'))
      }
    } else if (error.code === 'ECONNABORTED') {
      ElMessage.error(i18n.global.t('api.timeout'))
    } else {
      ElMessage.error(i18n.global.t('api.networkError'))
    }
    return Promise.reject(payload)
  },
)

export default api
