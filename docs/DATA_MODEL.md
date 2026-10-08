# 数据模型概览

25 张表，19 次顺序编号的迁移。迁移只进不退（forward-only），并在独立数据库上验证「旧表结构 → 迁移 → 重跑」。

## 1. 分区

### 主数据

| 表 | 说明 |
| --- | --- |
| `customers` | 客户档案：公司、联系人、国别、分类、来源、信用等级、阶段、预估金额、归属业务员 |
| `customer_contacts` | 客户联系人（多联系人，标记主联系人） |
| `customer_followups` | 跟进记录 |
| `factories` | 工厂档案 |
| `factory_products` | 工厂产品库（含图片、规格） |

### 交易链路

| 表 | 说明 |
| --- | --- |
| `quotations` | 报价主表：客户、币种、金额、状态、当前版本、条款 |
| `quotation_versions` | 报价版本（版本号 + 快照），并发控制与历史追溯 |
| `orders` | 订单主表：数量、单价、总额、定金、工厂付款、客户报价、预估利润、状态、财务锁标记 |
| `order_costs` | 订单成本明细 |
| `order_milestones` | 履约节点（计划/实际时间、完成状态） |
| `order_trade_documents` | 贸易单证（商业发票、装箱单等） |
| `order_change_requests` | 订单变更申请与审批（含申请原值，用于冲突检测） |
| `order_status_history` | 订单状态流转历史 |
| `order_files` / `order_product_images` | 订单附件与产品图片索引 |

### 资金

| 表 | 说明 |
| --- | --- |
| `payment_records` | 收付款记录（支持作废 `voided_at`，不作物理删除） |
| `factory_payments` | 工厂付款 |

### 组织与权限

| 表 | 说明 |
| --- | --- |
| `users` | 账号：角色、上级（经理）、工作语言、`token_version`、首次改密标记 |
| `permissions` / `user_permissions` | 菜单权限定义与用户授权 |
| `notifications` | 通知与已读状态 |

### 工程质量与审计

| 表 | 说明 |
| --- | --- |
| `audit_logs` | 审计日志（含请求上下文） |
| `submission_receipts` | 提交回执：幂等键与业务结果的绑定 |
| `data_quality_issues` | 数据质量问题清单 |
| `schema_migrations` | 迁移执行记录 |

## 2. 关系（简化）

```
users ──manager_id──► users
  │                     │
  │ created_by          │ assigned_to_id
  ▼                     ▼
customers ─────────► orders ◄───────── factories
   │  │                 │ │ │ │            │
   │  │                 │ │ │ └─ order_files│
   │  │                 │ │ └─── order_milestones
   │  │                 │ └───── order_costs
   │  │                 └─────── order_status_history
   │  └─ customer_contacts / customer_followups
   │
   └─ quotations ── quotation_versions
                       │
                       └─（接受后写入订单，绑定 accepted_version_no）

orders ── payment_records / factory_payments
```

## 3. 几个刻意的设计选择

- **业务归属用 `created_by` / `assigned_to_id`**，而不是单独建归属表：
  团队数据范围直接在业务查询上过滤，避免多一次 join 且语义清晰。
- **作废而非删除**：收付款、变更申请等资金相关记录以状态/时间戳标记作废，
  保留可追溯性（幂等与对账都依赖它）。
- **报价版本独立成表**：报价的条款与金额一旦发出就不允许原地篡改，
  新版本是一条新记录；订单接受报价时记录 `accepted_version_no`，形成可核对的快照链。
- **幂等回执独立成表**（`submission_receipts`）：把幂等键与「业务结果」在同一事务里落库，
  重试请求可以返回**首次的真实结果**，而不是简单报「重复提交」。
- **索引按查询模式补**：分页列表、按客户/工厂聚合、按时间范围统计各有专用索引，
  并有独立的迁移记录（`long_term_query_indexes`、`customer_pagination_index` 等）。
