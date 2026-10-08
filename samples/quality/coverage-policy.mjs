const METRICS = ['lines', 'statements', 'functions', 'branches']

// 覆盖率门禁阈值，按「代码性质」分区，而不是给 api 一个整包数字。
//
// 原因：c8 只统计「测试运行过程中被加载过的文件」。apps/trade-api 的 routes/*.js
// （HTTP 编排层，约 6100 行）与 app.js 只有在有测试 import app.js 时才进入分母，
// 因此历史上的「api 90%」实际只在 utils / middleware 上成立；一旦路由进入统计，
// api 立刻掉到 40% 量级。那是口径暴露，不是质量退化。
//
// 分区与标准：
//   api_core  纯逻辑（utils / middleware / config / db）—— 单测可直接覆盖，维持 90%
//   api_http  HTTP 编排（app.js / routes/*）—— 路由 handler 的行为由 CI 的
//             docker-acceptance（Playwright e2e + smoke）兜底，这里单独设防回退下限，
//             随补测试逐步抬高（见仓库内覆盖率审计报告）
//   total     仅表示「全盘不退化」的加权平均兜底，不代表任何单模块标准
// 阈值取值原则：比当前实测低 1.5~2 个百分点（防小幅回退），而不是贴着实测值。
// 实测基准（2026-09-15，含新增的路由集成测试）：
//   api_core 97.28 / api_http 94.86（lines）· 88.23（branches）· 89.66（functions）
//   api_http 随「路由集成测试」逐批抬高：Batch 1 salespersons/permissions、
//   Batch 2 factories/users/customer_contacts、Batch 3 order_costs/order_milestones、
//   Batch 4 customers、Batch 5 quotations/stats、Batch 6 auth/factory_products/factory_payments、
//   Batch 7 orders（1655 行，最大的一条），
//   lines 29.88 -> 35.90 -> 41.21 -> 52.04 -> 65.09 -> 74.39 -> 94.86，阈值同步跟涨（每批取「实测 - 2」左右）。
//   routes/* 至此全部覆盖；api_http 还剩 app.js（302 行，41%）——它是应用装配层，
//   实际行为由 CI 的 docker-acceptance（Playwright e2e + smoke）兜底。
export const coverageThresholds = {
  site: { lines: 95, branches: 80 },
  // 核心逻辑（utils / middleware / config / db）是纯函数，本来就该比编排层严。
  // 实测（Batch 7）97.28 / 83.62 / 98.36，按「实测 - 2」取整；
  // 必须始终高于 api_http（coverage-policy.test.mjs 钉住了这个不变量）。
  api_core: { lines: 95, branches: 82, functions: 96 },
  // HTTP 编排层的防回退下限；补测试后应逐步上调。
  api_http: { lines: 92, branches: 86, functions: 87 },
  web: { lines: 82, statements: 80, branches: 77, functions: 60 },
  scripts: { lines: 90, branches: 75 },
  // 全量加权平均的兜底，不代表任何单模块标准。
  // 实测（Batch 7）95.13 / 94.67 / 84.82 / 84.17，按「实测 - 2」收紧。
  total: { lines: 93, statements: 92, branches: 82, functions: 82 },
}

// 需要拆分的 suite：谓词接收归一化（/ 分隔）后的文件路径。
export const suitePartitions = {
  api: [
    {
      id: 'api_core',
      test: (file) =>
        /\/apps\/trade-api\//.test(file) && !/\/apps\/trade-api\/(?:routes\/|app\.js$)/.test(file),
    },
    {
      id: 'api_http',
      test: (file) => /\/apps\/trade-api\/(?:routes\/|app\.js$)/.test(file),
    },
  ],
}

export function aggregateMetrics(entries) {
  const totals = Object.fromEntries(METRICS.map((metric) => [metric, { total: 0, covered: 0 }]))
  for (const entry of entries)
    for (const metric of METRICS) {
      totals[metric].total += entry[metric].total
      totals[metric].covered += entry[metric].covered
    }
  return Object.fromEntries(
    METRICS.map((metric) => [
      metric,
      totals[metric].total === 0
        ? 100
        : Number(((totals[metric].covered / totals[metric].total) * 100).toFixed(2)),
    ]),
  )
}

// 把单个 suite 的 c8 报告拆成分区指标。
// 未匹配任何分区、或同时匹配多个分区的文件都会抛错 —— 覆盖率门禁「少算等于放水」，
// 将来新增目录（例如 apps/trade-api/lib/）必须显式落进某个分区，不能静默漏掉。
export function splitSuiteReport(report, partitions, { suite = 'unknown' } = {}) {
  const buckets = Object.fromEntries(partitions.map(({ id }) => [id, []]))
  for (const [rawPath, metrics] of Object.entries(report)) {
    if (rawPath === 'total') continue
    const file = rawPath.replace(/\\/g, '/')
    const matched = partitions.filter((partition) => partition.test(file))
    if (matched.length !== 1) {
      throw new Error(
        `Coverage partition mismatch in ${suite}: ${file} matched ${matched.length} partitions`,
      )
    }
    buckets[matched[0].id].push(metrics)
  }
  return Object.fromEntries(
    Object.entries(buckets).map(([id, entries]) => {
      // 空分区几乎总是「报告不完整」而不是「代码全删了」。若不拦，它会按 100% 通过。
      if (entries.length === 0) {
        throw new Error(`Coverage partition ${id} in ${suite} is empty — report looks incomplete`)
      }
      return [id, aggregateMetrics(entries)]
    }),
  )
}

export function findCoverageFailures(summary, thresholds = coverageThresholds) {
  const failures = []
  for (const [suite, requiredMetrics] of Object.entries(thresholds)) {
    for (const [metric, minimum] of Object.entries(requiredMetrics)) {
      const actual = summary[suite]?.[metric]
      if (!Number.isFinite(actual) || actual < minimum) {
        failures.push({ suite, metric, actual, minimum })
      }
    }
  }
  return failures
}

export function formatCoverageFailure({ suite, metric, actual, minimum }) {
  return `${suite}.${metric}: ${Number.isFinite(actual) ? `${actual}%` : 'missing'} < ${minimum}%`
}
