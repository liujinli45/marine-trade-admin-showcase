// 后台菜单键的单一来源。
//
// 同一个集合过去散在四处，彼此不一致（这是权限相关 bug 的根源）：
//   1. routes/permissions.js 的 ALLOWED_MENUS —— PUT /permissions/:id 的白名单
//   2. init.js 的 defaultMenus/managerMenus/salesMenus —— permissions 表的角色默认授权
//   3. utils/permission-defaults.js 的 websiteDefaults —— 新用户的官网模块补授
//   4. apps/trade-web：UserManage.vue 的勾选项与角色预设、AppLayout.vue 的侧边栏、router 的 meta.menu
// 现在 1~3 统一到这里，4 由 apps/trade-api/test/menu-key-contract.test.js 与这里比对。
//
// 历史漂移（已修）：
//   * `permissions` 曾是 admin 的默认菜单键，但前端既没有这个菜单也没有路由
//     （router 里 `/permissions` 只是 redirect → /users），白名单里也没有它 —— 死键，已移除。
//     存量库里若已有该行，init.js 的清理语句会删掉。
//   * manager 的角色默认：后端给 `salespersons`，前端预设却给 `users`，
//     于是「用预设按钮保存一次」会把授权换成另一种。以**更窄**的 `salespersons` 为准
//     （权限不得放宽），前端预设已对齐。
//
// 关于 `salespersons`：它是 `users` 的轻量子集 —— 只开放业务员视图，不开放账号管理。
// 前端 store 的 hasMenu('users') 与 router guard 都把它当 users 的别名处理，
// 所以授权它不会让侧边栏少一项、也不会绕开路由守卫。

export const MENU_KEYS = [
  'dashboard',
  'customers',
  'orders',
  'factories',
  'stats',
  'users',
  'salespersons',
  'site_products',
  'site_news',
  'site_inquiries',
  'site_company',
  'site_settings',
]

export const MENU_KEY_SET = new Set(MENU_KEYS)

// 每种角色的默认授权 = permissions 表的角色行；新用户创建时按此表 INSERT IGNORE。
export const ROLE_DEFAULT_MENUS = {
  admin: [...MENU_KEYS],
  manager: [
    'dashboard',
    'customers',
    'orders',
    'factories',
    'stats',
    'salespersons',
    'site_products',
    'site_news',
    'site_inquiries',
    'site_company',
  ],
  sales: ['dashboard', 'customers', 'orders', 'factories', 'stats', 'site_inquiries'],
}

export const ROLE_KEYS = Object.keys(ROLE_DEFAULT_MENUS)
