export function pagination(query) {
  const requestedSize = Number(query.pageSize)
  const pageSize =
    Number.isSafeInteger(requestedSize) && requestedSize > 0 ? Math.min(100, requestedSize) : 20
  const requestedPage = Number(query.page)
  const page =
    Number.isSafeInteger(requestedPage) &&
    requestedPage > 0 &&
    Number.isSafeInteger((requestedPage - 1) * pageSize)
      ? requestedPage
      : 1
  return { page, pageSize, offset: (page - 1) * pageSize }
}
