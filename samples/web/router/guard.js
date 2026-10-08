import i18n from '../i18n/index.js'

export function createNavigationGuard({
  getToken,
  getUser,
  setUser,
  removeToken,
  fetchCurrentUser,
  warn,
}) {
  const t = (key) => i18n.global.t(key)
  return async (to, _from, next) => {
    const token = getToken()

    if (to.meta.requiresAuth && !token) {
      next('/login')
      return
    }
    if (to.path === '/login' && token) {
      next('/')
      return
    }
    if (to.meta.adminOnly && getUser()?.role !== 'admin') {
      warn(t('api.adminOnly'))
      next('/')
      return
    }
    if (to.meta.menu) {
      let user = getUser()
      if (!user?.menus) {
        try {
          user = await fetchCurrentUser(token)
          if (user) setUser(user)
        } catch (error) {
          if (error.response?.status === 401) {
            removeToken()
            next('/login')
            return
          }
        }
      }
      const allowed =
        user?.menus?.includes(to.meta.menu) ||
        (to.meta.menu === 'users' && user?.menus?.includes('salespersons'))
      if (!allowed) {
        warn(t('api.noPermission'))
        next('/')
        return
      }
    }
    next()
  }
}
