import assert from 'node:assert/strict'
import test from 'node:test'
import {
  aggregateMetrics,
  coverageThresholds,
  findCoverageFailures,
  formatCoverageFailure,
  splitSuiteReport,
  suitePartitions,
} from './coverage-policy.mjs'

const metrics = (total, covered) => ({
  lines: { total, covered },
  statements: { total, covered },
  functions: { total, covered },
  branches: { total, covered },
})

test('accepts coverage at or above every configured floor', () => {
  const summary = {
    web: { lines: 75, branches: 71 },
    total: { lines: 89 },
  }
  const thresholds = {
    web: { lines: 75, branches: 70 },
    total: { lines: 88 },
  }

  assert.deepEqual(findCoverageFailures(summary, thresholds), [])
})

test('reports regressions and missing metrics with actionable labels', () => {
  const failures = findCoverageFailures(
    { web: { lines: 74.99 } },
    { web: { lines: 75, branches: 70 } },
  )

  assert.deepEqual(failures, [
    { suite: 'web', metric: 'lines', actual: 74.99, minimum: 75 },
    { suite: 'web', metric: 'branches', actual: undefined, minimum: 70 },
  ])
  assert.equal(formatCoverageFailure(failures[0]), 'web.lines: 74.99% < 75%')
  assert.equal(formatCoverageFailure(failures[1]), 'web.branches: missing < 70%')
})

test('aggregates by covered/total rather than averaging percentages', () => {
  // 两个文件分别 50% 与 100%，简单平均是 75%，按行加权才是 54.55%。
  const result = aggregateMetrics([metrics(100, 50), metrics(10, 10)])

  assert.equal(result.lines, 54.55)
  assert.equal(result.branches, 54.55)
})

test('splits the api suite into core and http by path', () => {
  const report = {
    'C:\\repo\\apps\\trade-api\\utils\\order.js': metrics(100, 100),
    'C:\\repo\\apps\\trade-api\\middleware\\auth.js': metrics(50, 40),
    'C:\\repo\\apps\\trade-api\\config.js': metrics(10, 10),
    'C:\\repo\\apps\\trade-api\\routes\\orders.js': metrics(1000, 100),
    'C:\\repo\\apps\\trade-api\\app.js': metrics(300, 100),
    total: metrics(1460, 350),
  }

  const split = splitSuiteReport(report, suitePartitions.api, { suite: 'api' })

  assert.deepEqual(Object.keys(split).sort(), ['api_core', 'api_http'])
  assert.equal(split.api_core.lines, 93.75)
  assert.equal(split.api_http.lines, 15.38)
})

test('api partition predicates are mutually exclusive and complete', () => {
  const samples = [
    '/repo/apps/trade-api/routes/orders.js',
    '/repo/apps/trade-api/routes/nested/deep.js',
    '/repo/apps/trade-api/app.js',
    '/repo/apps/trade-api/utils/x.js',
    '/repo/apps/trade-api/middleware/auth.js',
    '/repo/apps/trade-api/config.js',
    '/repo/apps/trade-api/db.js',
  ]

  for (const file of samples) {
    assert.equal(suitePartitions.api.filter((partition) => partition.test(file)).length, 1, file)
  }
})

test('funnels unexpected trade-api paths into api_core', () => {
  // api_core 是 catch-all：trade-api 下除 routes/ 与 app.js 之外的任何新目录
  // 都落进核心逻辑分区，不会静默漏出分母。
  const report = {
    'C:\\repo\\apps\\trade-api\\lib\\brand-new.js': metrics(10, 5),
    'C:\\repo\\apps\\trade-api\\routes\\orders.js': metrics(10, 5),
    total: metrics(20, 10),
  }

  const split = splitSuiteReport(report, suitePartitions.api, { suite: 'api' })

  assert.equal(split.api_core.lines, 50)
  assert.equal(split.api_http.lines, 50)
})

test('throws when a source file belongs to no partition', () => {
  const partitions = [{ id: 'only-src', test: (file) => file.includes('/src/') }]
  const report = { '/repo/elsewhere/x.js': metrics(1, 1), total: metrics(1, 1) }

  assert.throws(
    () => splitSuiteReport(report, partitions, { suite: 'demo' }),
    /matched 0 partitions/,
  )
})

test('rejects an empty partition instead of scoring it 100%', () => {
  // routes/ 一个文件都没进报告，说明统计面异常；按 100% 通过等于门禁放水。
  const report = {
    'C:\\repo\\apps\\trade-api\\utils\\order.js': metrics(10, 5),
    total: metrics(10, 5),
  }

  assert.throws(
    () => splitSuiteReport(report, suitePartitions.api, { suite: 'api' }),
    /partition api_http in api is empty/,
  )
})

test('throws when a source file matches more than one partition', () => {
  const partitions = [
    { id: 'first', test: () => true },
    { id: 'second', test: () => true },
  ]

  assert.throws(
    () =>
      splitSuiteReport({ 'x.js': metrics(1, 1), total: metrics(1, 1) }, partitions, { suite: 'x' }),
    /matched 2 partitions/,
  )
})

test('gates the http layer separately from core logic', () => {
  assert.ok(coverageThresholds.api_core)
  assert.ok(coverageThresholds.api_http)
  // 整包 api 阈值必须不存在：c8 只统计被加载的文件，整包数字会随加载面漂移。
  assert.equal(coverageThresholds.api, undefined)
  assert.ok(coverageThresholds.api_core.lines > coverageThresholds.api_http.lines)
})

test('flags a core regression that the whole-package number would hide', () => {
  // 核心逻辑掉到 85%、HTTP 层照旧：整包加权后仍有 ~62%，
  // 单看整包看不出来，分区门禁必须拦住。
  const summary = { api_core: { lines: 85 }, api_http: { lines: 30 } }
  const failures = findCoverageFailures(summary, {
    api_core: { lines: 90 },
    api_http: { lines: 25 },
  })

  assert.deepEqual(failures, [{ suite: 'api_core', metric: 'lines', actual: 85, minimum: 90 }])
})
