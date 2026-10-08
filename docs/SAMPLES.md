# 代码样本索引

> **这些是节选，不是可运行工程。** 文件按原样摘录，`import` 路径仍指向原 monorepo 的目录结构，
> 缺少的兄弟模块没有包含在本仓库中。目的是展示写法与设计，而不是提供一个能跑起来的项目。

## API 装配层

| 文件 | 展示什么 |
| --- | --- |
| `api/app.js` | 中间件顺序、认证只挂一次、模块权限与路由注册同处、JSON 404、错误码映射、优雅退出 |
| `api/config.js` | 环境变量收敛与默认值、CORS 白名单、探针与上传等配置项的集中校验 |

## API 中间件

| 文件 | 展示什么 |
| --- | --- |
| `api/middleware/auth.js` | JWT + **每次请求回库比对 `token_version`**（改密即失效）；经理团队名单实时装载；强制改密拦截 |
| `api/middleware/module-permission.js` | 模块级授权，每请求查库，撤销即时生效；admin 短路 |
| `api/middleware/resource-access.js` | 资源访问守卫；**「不存在」与「无权限」返回同一个码**，避免通过差异推断记录是否存在 |

## API 业务规则（纯函数为主）

| 文件 | 展示什么 |
| --- | --- |
| `api/utils/owner-scope.js` | 团队数据范围编译进 SQL；列名白名单校验；不接受请求体/令牌里的团队声明 |
| `api/utils/menu-keys.js` | 菜单键单一来源，文件头完整记录了「同一集合散落四处 → 权限静默吊销」的历史与修法 |
| `api/utils/pagination.js` | 12 行解决全部分页边界：默认值、上限、非法输入回退、offset 溢出 |
| `api/utils/receipts.js` | 收款口径：标记与收付款记录取最大值而非相加；财务锁与角色越权改价的拒绝规则 |
| `api/utils/order-safety.js` | 编辑版本指纹（SHA-256）、`FOR UPDATE` 行锁、利润确认失效、**幂等预占与业务写入同事务** |
| `api/utils/quotation.js` | 报价币种白名单、条款归一化、图片路径白名单、合计计算 —— 与前端共用同一份纯函数 |
| `api/utils/profit.js` | 成本金额的拒绝式校验（不是静默归零）、订单利润口径 |
| `api/utils/upload-security.js` | 用 `file-type` 读真实字节判定类型 + `sharp` 限制像素与尺寸后转 webp，不信任扩展名 |

## 完整路由模块

| 文件 | 展示什么 |
| --- | --- |
| `api-routes/order_milestones.js` | 222 行的完整模块：行锁、状态幂等、真实日历日期校验、通知、错误码、参数注入防护 |
| `api-routes/permissions.js` | 权限读写接口；白名单与角色默认授权同源 |

## 前端

| 文件 | 展示什么 |
| --- | --- |
| `web/router/guard.js` | 路由守卫：登录态、adminOnly、`meta.menu` 校验（含 `salespersons` 作为 `users` 别名的处理） |
| `web/router/index.js` | 路由表与 `meta`（`requiresAuth` / `adminOnly` / `menu`）的集中声明 |
| `web/api/index.js` | axios 实例：统一错误码翻译、401 会话过期处理、自动附带幂等键 |
| `web/api/submission-keys.js` | **提交签名 = SHA-256(身份 + 路径 + 载荷)**；成功才轮换；`sessionStorage` 与内存双保险 |
| `web/utils/http.js` | 带超时的裸 fetch 封装（文件上传等场景），同样走错误码翻译与 401 处理 |
| `web/utils/quotation-builder.js` | 前端**直接复用 API 的报价纯函数**，消除预览与落库不一致 |
| `web/components/OrderMilestonePanel.vue` | 单文件组件的完整写法：时间线、逾期高亮、改期原因必填、三语文案 |

## 工程质量

| 文件 | 展示什么 |
| --- | --- |
| `quality/coverage-policy.mjs` | 覆盖率**分区阈值**：纯逻辑层 / HTTP 编排层 / 前端 / 脚本 / 全盘，并解释取值原则（实测 −2 个百分点） |
| `quality/coverage-policy.test.mjs` | 用测试钉住不变量：纯逻辑层阈值必须高于 HTTP 编排层，空分区直接报错 |
| `quality/secret-scan.mjs` | 密钥门禁：禁止入库的路径模式（`.env` / 私钥 / 备份目录）+ 常见令牌指纹 |
| `quality/secret-scan.test.mjs` | 门禁自身的测试（含绕过尝试用例） |
| `quality/scan-hardcoded-chinese.mjs` | 硬编码文案扫描：区分「漏译」与「有意保留」，支持基线 |
| `quality/hardcoded-chinese.test.mjs` | 扫描器单测，覆盖路径归一化、注释排除、边界输入 |
