// Keep an uncertain submission's key until its outcome is known. Successful
// submissions are removed so an intentional second record gets a new key.
const keys = new Map()
export async function prepareSubmission(config, identity) {
  if (
    config.method !== 'post' ||
    !/^\/(orders|order-change-requests|factory-payments|orders\/\d+\/costs|quotations|quotations\/\d+\/versions)$/.test(
      config.url,
    )
  )
    return
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([identity, config.url, config.data])),
  )
  const signature =
    'submission:' +
    Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (!keys.has(signature)) {
    let saved
    try {
      saved = sessionStorage.getItem(signature)
    } catch {
      /* Storage may be unavailable. */
    }
    keys.set(signature, saved || crypto.randomUUID())
    try {
      sessionStorage.setItem(signature, keys.get(signature))
    } catch {
      /* In-memory retries remain protected. */
    }
  }
  config.headers['Idempotency-Key'] = keys.get(signature)
  config.submissionSignature = signature
}
export function finishSubmission(config) {
  if (config?.submissionSignature) {
    keys.delete(config.submissionSignature)
    try {
      sessionStorage.removeItem(config.submissionSignature)
    } catch {
      /* Storage may be unavailable. */
    }
  }
}
