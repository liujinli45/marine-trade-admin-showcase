#!/usr/bin/env node
// 扫描前后端源码中绕过 i18n 的硬编码中文文本，输出漏译风险清单。
//
// 目标不是「消灭所有中文字面量」，而是找出真正会漏给用户的界面文案。因此脚本会把
// 已知合理的中文出现归类为非缺陷并附带理由，只把剩余部分当作待处理项。
//
// 判定逻辑在 scripts/lib/hardcoded-chinese.mjs（可被 scripts/lib/hardcoded-chinese.test.mjs
// 直接单测）；本文件只负责遍历文件、读基线、格式化输出、决定退出码。
//
// 用法：
//   node scripts/scan-hardcoded-chinese.mjs              # 人类可读报告
//   node scripts/scan-hardcoded-chinese.mjs --json             # 机器可读
//   node scripts/scan-hardcoded-chinese.mjs --strict           # 超出基线即退出码 1
//   node scripts/scan-hardcoded-chinese.mjs --update-baseline  # 收紧基线到当前结果
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  TARGETS,
  SKIPPED_DIRS,
  buildBaselineFile,
  createScanner,
  normalize,
  summarizeFindings,
} from './lib/hardcoded-chinese.mjs'

const root = process.cwd()

// 服务端响应文案（res.json({ message: '...' })）基数大、改造成本高，一次性清零不现实。
// 所以 trade-api 走「只降不升」的基线闸门：scripts/i18n-baseline.json 记录每个文件当前
// 已知的数量，新增任何一条都会让门禁失败；清理掉一部分后运行 --update-baseline 收紧基线。
// 这样门禁既不因为是历史遗留就永久放行，也不会一上来就几百条全红。
const baselinePath = path.join(root, 'scripts', 'i18n-baseline.json')

async function loadBaseline() {
  try {
    const parsed = JSON.parse(await readFile(baselinePath, 'utf8'))
    return parsed?.files && typeof parsed.files === 'object' ? parsed.files : {}
  } catch {
    return {}
  }
}

const scanner = createScanner()
const findings = []
let totalLines = 0

async function walk(directory, exts) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath, exts)
    } else if (entry.isFile() && exts.has(path.extname(entry.name))) {
      const relative = normalize(path.relative(root, fullPath))
      const content = await readFile(fullPath, 'utf8')
      const result = scanner.scanSource(relative, content)
      findings.push(...result.findings)
      totalLines += result.totalLines
    }
  }
}

const baseline = await loadBaseline()

for (const target of TARGETS) {
  await walk(path.join(root, target.dir), new Set(target.exts))
}

const { pending, suppressed, perFile, overBaseline } = summarizeFindings(findings, baseline)
const unusedAllowlist = scanner.unusedAllowlist()
const asJson = process.argv.includes('--json')

if (asJson) {
  console.log(JSON.stringify({ pending, suppressed, overBaseline, totalLines }, null, 2))
  process.exit(0)
}

if (process.argv.includes('--update-baseline')) {
  const files = buildBaselineFile(perFile)
  await writeFile(
    baselinePath,
    JSON.stringify(
      {
        note: '由 scripts/scan-hardcoded-chinese.mjs --update-baseline 生成。只降不升：清理存量后重新运行以收紧基线；新增硬编码中文会让 --strict 门禁失败。',
        files,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )
  console.log(`基线已更新：scripts/i18n-baseline.json（${Object.keys(files).length} 个文件，共 ${pending.length} 处）`)
  process.exit(0)
}

console.log(`扫描完成：${totalLines} 行源码，${TARGETS.map((t) => t.dir).join(' / ')}`)

const suppressedByReason = new Map()
for (const item of suppressed) {
  const key = `${item.kind}：${item.reason}`
  suppressedByReason.set(key, (suppressedByReason.get(key) ?? 0) + 1)
}
console.log(`已豁免（确认合理）：${suppressed.length} 处`)
for (const [key, count] of suppressedByReason) {
  console.log(`  - ${key}（${count} 处）`)
}

console.log(`\n待处理疑似漏译：${pending.length} 处`)
if (pending.length) {
  const byFile = new Map()
  for (const item of pending) {
    if (!byFile.has(item.file)) byFile.set(item.file, [])
    byFile.get(item.file).push(item)
  }
  for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const allowed = baseline[file] ?? 0
    const tag = items.length > allowed ? '超出基线' : '基线内存量'
    console.log(`\n${file} (${items.length}) [${tag}]`)
    const limit = items.length > allowed ? items.length : Math.min(items.length, 3)
    for (const item of items.slice(0, limit)) {
      console.log(`  :${item.line}  ${item.text}`)
    }
    if (items.length > limit) console.log(`  ... 其余 ${items.length - limit} 处略`)
  }
}

console.log(`\n基线检查：${overBaseline.length} 个文件超出基线`)
for (const { file, count, allowed } of overBaseline) {
  console.log(`  - ${file}：当前 ${count} 处 > 基线 ${allowed} 处`)
}

// 豁免条目按内容锚定后，还要确认它们真的命中了：一条从不命中的豁免要么锚点写错，
// 要么那段代码已经清干净、条目该删了。两种情况都不该让门禁继续绿着。
if (unusedAllowlist.length) {
  console.log(`\n未命中的豁免条目：${unusedAllowlist.length} 条`)
  for (const item of unusedAllowlist) console.log(`  - ${item}`)
}

if (
  process.argv.includes('--strict') &&
  (overBaseline.length > 0 || unusedAllowlist.length > 0)
)
  process.exit(1)
