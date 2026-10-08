import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_LINE_ALLOWLIST,
  HAN,
  createScanner,
  normalize,
  summarizeFindings,
} from './hardcoded-chinese.mjs'

// 这个门禁是项目里改动最频繁的一处（Task #14 加 locale-triplet、Task #15 修跨行 console、
// Task #18 修行号豁免腐烂 / bilingual 误豁免 / i18n 整行跳过）。此前它没有单测，
// 唯一保护是 output/ 里的一次性反向验证脚本 —— 那不在 `npm test` 里。
//
// 每个豁免类别都配「该豁免」和「不该豁免」两面用例：只断言正面命中，
// 门禁把真漏译一起豁免掉也测不出来。

const scan = (content, { relative = 'apps/trade-web/src/Probe.vue', lineAllowlist } = {}) => {
  const scanner = createScanner(lineAllowlist ? { lineAllowlist } : {})
  const { findings, totalLines } = scanner.scanSource(relative, content)
  return { findings, totalLines, scanner }
}

const kinds = (findings) => findings.map((item) => item.kind)

test('命中硬编码中文并按行定位', () => {
  const { findings, totalLines } = scan(
    ["const ok = 'Product'", "const bad = '订单已创建'"].join('\n'),
  )
  assert.equal(totalLines, 2)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].kind, 'hardcoded')
  assert.equal(findings[0].line, 2)
  assert.equal(findings[0].text, '订单已创建')
})

test('单个汉字不算中文文案（避免把符号 / 变量名碎片当文案）', () => {
  const { findings } = scan("const a = '中'")
  assert.deepEqual(findings, [])
  assert.ok(HAN.test('中文'))
})

test('i18n 调用的 key 参数被剥掉，但同一行旁边的硬编码中文仍会被抓出来', () => {
  // Task #18 修掉的真实假阴性：旧逻辑「这行有 $t( 就整行跳过」，
  // 于是 i18n 调用后半段的中文一起被洗白。
  const mixed =
    "<strong>{{ $t('customer.contacts') }}</strong><small>{{ contacts.length }} 位联系人</small>"
  const mixedResult = scan(mixed)
  assert.deepEqual(kinds(mixedResult.findings), ['hardcoded'])
  assert.equal(mixedResult.findings[0].text, '位联系人')

  // 纯 i18n 调用（key 里带中文）不应被算作硬编码文案
  const pureI18n = scan("const label = $t('客户名称')")
  assert.deepEqual(pureI18n.findings, [])
})

test('双语单据被豁免，但「汉字 + 闭合标签」不再被误豁免', () => {
  // 该豁免：斜杠两侧有空白才是双语分隔符
  const bilingual = scan('  <span>报价至 / QUOTED TO</span>')
  assert.deepEqual(kinds(bilingual.findings), ['bilingual'])

  // 不该豁免：`</h1>` 的斜杠不是分隔符，这里是真漏译
  const closingTag = scan('<h1>批量归档</h1>')
  assert.deepEqual(kinds(closingTag.findings), ['hardcoded'])
})

test('locale-label / data-value / sql-comment 各自只在正确形状下豁免', () => {
  assert.deepEqual(kinds(scan("  zh: '简体中文',").findings), ['locale-label'])
  assert.deepEqual(kinds(scan('  const label = "简体中文"').findings), ['hardcoded'])

  assert.deepEqual(kinds(scan('  `${value = "已发货"}`').findings), ['data-value'])
  assert.deepEqual(kinds(scan("  const status = '已发货'").findings), ['hardcoded'])

  assert.deepEqual(kinds(scan("  `amount` DECIMAL COMMENT '金额',").findings), ['sql-comment'])
  assert.deepEqual(kinds(scan("  const amount = '金额'").findings), ['hardcoded'])
})

test('console 日志单行与跨行都被豁免', () => {
  assert.deepEqual(kinds(scan("console.log('服务已启动')").findings), ['runtime-log'])

  const multiLine = ['console.warn(', "  '数据库连接失败' +", "  '，请检查配置',", ')'].join('\n')
  const { findings } = scan(multiLine)
  assert.deepEqual(kinds(findings), ['runtime-log', 'runtime-log'])
})

test('跨行 console 调用结束后不会继续吞并后续行', () => {
  const source = ['console.log(', "  '启动中',", ')', "const leak = '这条应该被抓到'"].join('\n')
  const { findings } = scan(source)
  assert.deepEqual(kinds(findings), ['runtime-log', 'hardcoded'])
  assert.equal(findings[1].line, 4)
})

test('locale-table 无论整表压一行还是多行展开都被豁免', () => {
  const inline = scan("const t = { zh: { 名称: '产品' }, en: { name: 'Product' } }")
  assert.deepEqual(kinds(inline.findings), ['locale-table'])

  const multiLine = ['const t = {', '  zh: {', "    名称: '产品',", '  },', '}'].join('\n')
  const { findings } = scan(multiLine)
  assert.deepEqual(kinds(findings), ['locale-table'])

  // 表外的一行中文不应被表的作用域误伤
  const outside = [
    'const t = {',
    '  zh: {',
    "    名称: '产品',",
    '  },',
    '}',
    "const leak = '表外中文'",
  ].join('\n')
  assert.deepEqual(kinds(scan(outside).findings), ['locale-table', 'hardcoded'])
})

test('中 / 英 / 俄三语并列的常量表被豁免', () => {
  const { findings } = scan("const status = ['已发货', 'Shipped', 'Отправлено']")
  assert.deepEqual(kinds(findings), ['locale-triplet'])

  // 只有中英、没有西里尔 → 不算三语并列
  const bilingualOnly = scan("const status = ['已发货', 'Shipped']")
  assert.deepEqual(kinds(bilingualOnly.findings), ['hardcoded'])
})

test('注释里的中文不算漏译', () => {
  assert.deepEqual(scan('// 这是行注释里的中文').findings, [])
  assert.deepEqual(scan('/* 这是块注释里的中文 */').findings, [])
  assert.deepEqual(scan('<!-- 这是 HTML 注释里的中文 -->').findings, [])
  // 注释被剥掉后行号仍然准确
  const { findings } = scan(['// 第一行注释', "const bad = '真漏译'"].join('\n'))
  assert.equal(findings[0].line, 2)
})

test('逐行豁免按内容锚定，且从不命中的条目会被点名', () => {
  const source = '<h1>报价单</h1>'
  const hit = scan(source, {
    relative: 'x.vue',
    lineAllowlist: [{ file: 'x.vue', match: /<h1>报价单<\/h1>/, reason: '单据主标题' }],
  })
  assert.deepEqual(kinds(hit.findings), ['allowlisted'])
  assert.deepEqual(hit.scanner.unusedAllowlist(), [])

  // 锚点写错 → 中文回到待处理，同时该条目被报告为「从未命中」
  const miss = scan(source, {
    relative: 'x.vue',
    lineAllowlist: [{ file: 'x.vue', match: /<h1>这段代码里不存在<\/h1>/, reason: '锚点写错' }],
  })
  assert.deepEqual(kinds(miss.findings), ['hardcoded'])
  assert.equal(miss.scanner.unusedAllowlist().length, 1)
})

test('豁免命中计数不跨扫描实例共享', () => {
  const lineAllowlist = [{ file: 'x.vue', match: /<h1>报价单<\/h1>/, reason: '单据主标题' }]
  const first = createScanner({ lineAllowlist })
  first.scanSource('x.vue', '<h1>报价单</h1>')
  assert.deepEqual(first.unusedAllowlist(), [])

  // 新实例尚未扫过任何文件 → 条目还没命中
  const second = createScanner({ lineAllowlist })
  assert.equal(second.unusedAllowlist().length, 1)
})

test('默认豁免表锚点仍能命中（防止有人改源码后锚点静默腐烂）', () => {
  assert.ok(DEFAULT_LINE_ALLOWLIST.length >= 1)

  const init = scan("  name: '系统管理员',", { relative: 'apps/trade-api/init.js' })
  assert.deepEqual(kinds(init.findings), ['allowlisted'])
  assert.deepEqual(init.scanner.unusedAllowlist(), [])
})

test('汇总：基线只约束新增，存量允许保留', () => {
  const findings = [
    { file: 'a.js', line: 1, kind: 'hardcoded' },
    { file: 'a.js', line: 2, kind: 'hardcoded' },
    { file: 'b.js', line: 1, kind: 'hardcoded' },
    { file: 'a.js', line: 9, kind: 'sql-comment' },
  ]

  const atBaseline = summarizeFindings(findings, { 'a.js': 2, 'b.js': 1 })
  assert.equal(atBaseline.pending.length, 3)
  assert.equal(atBaseline.suppressed.length, 1)
  assert.deepEqual(atBaseline.overBaseline, [])

  const over = summarizeFindings(findings, { 'a.js': 1 })
  assert.deepEqual(over.overBaseline, [
    { file: 'a.js', count: 2, allowed: 1 },
    { file: 'b.js', count: 1, allowed: 0 },
  ])

  const empty = summarizeFindings(findings, {})
  assert.deepEqual(
    empty.overBaseline.map((item) => item.file),
    ['a.js', 'b.js'],
  )
})

test('normalize 把 Windows 分隔符统一成正斜杠', () => {
  assert.equal(normalize('apps\\trade-api\\routes\\auth.js'), 'apps/trade-api/routes/auth.js')
  assert.equal(normalize('apps/trade-api/routes/auth.js'), 'apps/trade-api/routes/auth.js')
})
