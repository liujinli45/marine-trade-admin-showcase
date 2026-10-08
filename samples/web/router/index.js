import { createRouter, createWebHistory } from 'vue-router'
import { getToken, getUser, setUser, removeToken } from '../utils/auth.js'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { createNavigationGuard } from './guard.js'
import { captureReturnSource } from '../utils/return-navigation.js'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true, menu: 'dashboard' },
  },
  {
    path: '/users',
    name: 'UserManage',
    component: () => import('../views/UserManage.vue'),
    meta: { requiresAuth: true, menu: 'users' },
  },
  {
    path: '/notifications',
    name: 'NotificationCenter',
    redirect: { path: '/profile', query: { tab: 'notifications' } },
    meta: { requiresAuth: true },
  },
  {
    path: '/users/:id',
    name: 'UserDetail',
    component: () => import('../views/UserManage.vue'),
    meta: { requiresAuth: true, menu: 'users', returnFallback: '/users' },
  },
  {
    path: '/salespersons',
    redirect: { path: '/users', query: { role: 'sales' } },
    meta: { requiresAuth: true, menu: 'users' },
  },
  {
    path: '/salespersons/:id',
    redirect: (to) => ({ path: `/users/${to.params.id}`, query: { tab: 'performance' } }),
    meta: { requiresAuth: true, menu: 'users' },
  },
  {
    path: '/customers',
    name: 'CustomerManage',
    component: () => import('../views/CustomerManage.vue'),
    meta: { requiresAuth: true, menu: 'customers' },
  },
  {
    path: '/customers/:id',
    name: 'CustomerDetail',
    component: () => import('../views/CustomerDetail.vue'),
    meta: { requiresAuth: true, menu: 'customers', returnFallback: '/customers' },
  },
  {
    path: '/orders',
    name: 'OrderManage',
    component: () => import('../views/OrderManage.vue'),
    meta: { requiresAuth: true, menu: 'orders' },
  },
  {
    path: '/orders/:id',
    name: 'OrderDetail',
    component: () => import('../views/OrderDetail.vue'),
    meta: { requiresAuth: true, menu: 'orders', returnFallback: '/orders' },
  },
  {
    path: '/quotations/new',
    name: 'QuotationCreate',
    component: () => import('../views/QuotationWorkspace.vue'),
    meta: { requiresAuth: true, menu: 'customers', returnFallback: '/customers' },
  },
  {
    path: '/quotations/:id/edit',
    name: 'QuotationEdit',
    component: () => import('../views/QuotationWorkspace.vue'),
    meta: { requiresAuth: true, menu: 'customers', returnFallback: '/customers' },
  },
  {
    path: '/factories',
    name: 'FactoryManage',
    component: () => import('../views/FactoryManage.vue'),
    meta: { requiresAuth: true, menu: 'factories' },
  },
  {
    path: '/payments',
    redirect: '/',
    meta: { requiresAuth: true },
  },
  {
    path: '/factories/:id',
    name: 'FactoryDetail',
    component: () => import('../views/FactoryDetail.vue'),
    meta: { requiresAuth: true, menu: 'factories', returnFallback: '/factories' },
  },
  {
    path: '/factories/:factoryId/products',
    name: 'FactoryProducts',
    component: () => import('../views/FactoryProducts.vue'),
    meta: { requiresAuth: true, menu: 'factories', returnFallback: '/factories' },
  },
  {
    path: '/factories/:factoryId/products/add',
    name: 'FactoryProductAdd',
    component: () => import('../views/FactoryProductForm.vue'),
    meta: { requiresAuth: true, menu: 'factories', returnFallback: '/factories' },
  },
  {
    path: '/factories/:factoryId/products/:id/edit',
    name: 'FactoryProductEdit',
    component: () => import('../views/FactoryProductForm.vue'),
    meta: { requiresAuth: true, menu: 'factories', returnFallback: '/factories' },
  },
  {
    path: '/stats',
    name: 'Stats',
    component: () => import('../views/Stats.vue'),
    meta: { requiresAuth: true, menu: 'stats' },
  },
  {
    path: '/permissions',
    redirect: '/users',
    meta: { requiresAuth: true, adminOnly: true },
  },
  {
    path: '/audit',
    redirect: '/',
    meta: { requiresAuth: true },
  },
  {
    path: '/quality',
    redirect: '/',
    meta: { requiresAuth: true },
  },
  {
    path: '/observability',
    redirect: '/',
    meta: { requiresAuth: true },
  },
  {
    path: '/site/products',
    name: 'SiteProductManage',
    component: () => import('../views/SiteProductManage.vue'),
    meta: { requiresAuth: true, menu: 'site_products' },
  },
  {
    path: '/site/products/:id',
    name: 'SiteProductDetail',
    component: () => import('../views/SiteProductManage.vue'),
    meta: { requiresAuth: true, menu: 'site_products', returnFallback: '/site/products' },
  },
  {
    path: '/site/categories',
    redirect: { path: '/site/products', query: { panel: 'categories' } },
    meta: { requiresAuth: true, menu: 'site_products' },
  },
  {
    path: '/site/news',
    name: 'SiteNewsManage',
    component: () => import('../views/SiteNewsManage.vue'),
    meta: { requiresAuth: true, menu: 'site_news' },
  },
  {
    path: '/site/news/:id',
    name: 'SiteNewsDetail',
    component: () => import('../views/SiteNewsManage.vue'),
    meta: { requiresAuth: true, menu: 'site_news', returnFallback: '/site/news' },
  },
  {
    path: '/site/company',
    name: 'SiteCompanyManage',
    component: () => import('../views/SiteCompanyManage.vue'),
    meta: { requiresAuth: true, menu: 'site_company' },
  },
  {
    path: '/site/inquiries',
    name: 'SiteInquiryManage',
    component: () => import('../views/SiteInquiryManage.vue'),
    meta: { requiresAuth: true, menu: 'site_inquiries' },
  },
  {
    path: '/site/inquiries/:id',
    name: 'SiteInquiryDetail',
    component: () => import('../views/SiteInquiryManage.vue'),
    meta: { requiresAuth: true, menu: 'site_inquiries', returnFallback: '/site/inquiries' },
  },
  {
    path: '/site/settings',
    name: 'SiteSettingsManage',
    component: () => import('../views/SiteSettingsManage.vue'),
    meta: { requiresAuth: true, menu: 'site_settings' },
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('../views/Profile.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/orders/:orderId/files/:fileId/preview',
    name: 'FilePreview',
    component: () => import('../views/FilePreview.vue'),
    meta: { requiresAuth: true, returnFallback: '/orders' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
    meta: { requiresAuth: false },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to, from) => captureReturnSource(to, from))

router.beforeEach(
  createNavigationGuard({
    getToken,
    getUser,
    setUser,
    removeToken,
    fetchCurrentUser: async (token) => {
      const response = await axios.get('/api/trade/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data.code === 200 ? response.data.data : null
    },
    warn: (message) => ElMessage.warning(message),
  }),
)

export default router
