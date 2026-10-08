// ownerIds is loaded from the database by authMiddleware on every request.
// Never accept a team list from request bodies or signed, potentially stale JWTs.
export function ownerIds(user) {
  const ids = user?.role === 'manager' ? user.ownerIds : []
  return [...new Set([Number(user?.id), ...(Array.isArray(ids) ? ids.map(Number) : [])])].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  )
}

export function canAccessOwner(user, createdBy) {
  if (!user) return false
  if (user.role === 'admin') return true
  return ownerIds(user).includes(Number(createdBy))
}

export function ownerScopeSql(user, column = 'created_by') {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(column))
    throw new Error('INVALID_OWNER_COLUMN')
  if (user.role === 'admin') return ''
  return user.role === 'manager' ? ` AND ${column} IN (?)` : ` AND ${column} = ?`
}

export function ownerScopeParams(user) {
  if (user.role === 'admin') return []
  return user.role === 'manager' ? [ownerIds(user)] : [user.id]
}
