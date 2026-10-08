const forbiddenDirectories = new Set(['.runtime', 'backups', 'release-artifacts'])
const sensitiveExtensions = new Set(['.key', '.pem', '.p12', '.pfx'])

export function isForbiddenTrackedPath(file) {
  const normalized = file.replaceAll('\\', '/').toLowerCase()
  const parts = normalized.split('/')
  const name = parts.at(-1) || ''

  if (parts.some((part) => forbiddenDirectories.has(part))) return true
  if ((name === '.env' || name.startsWith('.env.')) && !name.endsWith('.example')) return true
  return [...sensitiveExtensions].some((extension) => name.endsWith(extension))
}

const secretPatterns = [
  { label: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    label: 'GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  { label: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'OpenAI API key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
]

export function findSecretMatches(contents) {
  return secretPatterns.filter(({ pattern }) => pattern.test(contents)).map(({ label }) => label)
}
