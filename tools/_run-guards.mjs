// 跑一遍「不依赖真 hub」的那批护栏，汇总成一张表。
//
// 用法：npm run guard            （跑默认那一批）
//       npm run guard -- verify_globe verify_search
//
// 为什么要这个入口：37 个 verify 脚本原来只能一个一个手动敲，CI 里一个都没跑过
// （`.github/workflows/ci.yml` 的 `grep -rn verify_` 为空）。有了这个入口，
// 本地与 CI 用同一条命令、同一批脚本，`npm run guard` 通过才叫验过。
//
// 依赖真 hub（本地 upstream）的那几个不在这里：verify_detail_preload、
// verify_live_default、verify_live_globe_toggle —— 它们要连上游，留给本机手动跑。
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'

/** 默认批：不连上游、不需要真 hub 的那批（按依赖由轻到重排）。 */
const DEFAULT = [
  'verify_card_form',
  'verify_card_styles',
  'verify_public_remark',
  'verify_touch_targets',
  'verify_mobile_targets',
  'verify_keyboard_and_motion',
  'verify_region_coverage',
  'verify_tokens_and_a11y',
  'verify_card_style_menu',
  'verify_many_nodes',
  'verify_appearance',
  'verify_detail_charts',
  'verify_offline_last',
  'verify_offline_time',
  'verify_summary',
  'verify_search',
  'verify_card_expiry_fit',
  'verify_card_netrow_fit',
  'verify_latency_min_span',
  'verify_latency_row_fit',
  'verify_peek_retired',
  'verify_compact_notes',
  'verify_footer_credit',
  'verify_icons',
  'verify_title',
  'verify_visibility',
  'verify_farm_entry',
  'verify_hub141',
  'verify_region_names',
  'verify_globe',
  'verify_globe_colors',
  'verify_globe_land',
  'verify_globe_layout',
  'verify_globe_scale',
  'verify_globe_spin',
]

/** 把 `--shard N/M` 从参数里摘出来（它两边都可能有：`npm run guard -- --shard 1/2` 或
 *  `npm run guard -- verify_x --shard 1/2`），剩下的才是脚本名。 */
const rawArgs = process.argv.slice(2)
let shardArg = process.env.GUARD_SHARD || ''
const only = []
let listOnly = false
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--shard') {
    shardArg = rawArgs[i + 1] ?? ''
    i++
    continue
  }
  if (rawArgs[i].startsWith('--shard=')) {
    shardArg = rawArgs[i].slice('--shard='.length)
    continue
  }
  if (rawArgs[i] === '--list') {
    listOnly = true
    continue
  }
  only.push(rawArgs[i])
}

const base = only.length ? only.map((n) => n.replace(/\.mjs$/, '')) : DEFAULT
let names = base

// 分片按「清单里的位置」取模，不按名字哈希 —— 片子之间耗时大致均衡，也不会因为改名而整片漂移。
// CI 用 matrix 并行两片：既保持 `npm run guard` 这份清单是唯一真相源，又不用把 35 支串着跑。
if (shardArg) {
  const m = /^(\d+)\/(\d+)$/.exec(String(shardArg).trim())
  if (!m) {
    console.error(`✗ --shard 要写成 N/M（例如 --shard 1/2），收到「${shardArg}」`)
    process.exit(2)
  }
  const idx = Number(m[1]) - 1
  const total = Number(m[2])
  if (!(idx >= 0 && idx < total) || total < 1) {
    console.error(`✗ --shard ${shardArg}：序号要在 1..${total} 之间`)
    process.exit(2)
  }
  names = base.filter((_, i) => i % total === idx)
  console.log(`分片 ${idx + 1}/${total}：${names.length} 支（共 ${base.length} 支）`)
}

const avail = new Set(
  readdirSync('tools').filter((f) => f.startsWith('verify_') && f.endsWith('.mjs')).map((f) => f.slice(0, -4)),
)
const missing = names.filter((n) => !avail.has(n))
if (missing.length) {
  console.error(`✗ 没有这些护栏脚本：${missing.join('、')}`)
  console.error(`  可用的：${[...avail].sort().join('、')}`)
  process.exit(2)
}

if (!existsSync('dist/index.html') && !listOnly) {
  console.error('✗ 没有 dist/index.html —— 先 `npm run build`')
  process.exit(2)
}

// `--list`：只把要跑的清单打出来，不跑（核验分片用，`--list --shard 1/2`）。
if (listOnly) {
  names.forEach((n) => console.log(n))
  process.exit(0)
}

/** 跑一个脚本，把输出收进缓冲区（只在失败时吐出来，成功的只留一行）。 */
function run(name) {
  return new Promise((resolve) => {
    const file = `tools/${name}.mjs`
    const child = spawn(process.execPath, [file], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    const timer = setTimeout(() => {
      // 单脚本超过 5 分钟按失败算（正常最慢的一个约 90s）
      child.kill()
      resolve({ name, code: 124, out: out + '\n（超时 5 分钟，已杀掉）' })
    }, 300_000)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve({ name, code: code ?? 1, out })
    })
  })
}

const started = Date.now()
const rows = []
for (const name of names) {
  process.stdout.write(`… ${name}`)
  const t0 = Date.now()
  const r = await run(name)
  const ms = Date.now() - t0
  rows.push({ ...r, ms })
  const pass = (r.out.match(/^PASS/gm) || []).length
  const fail = (r.out.match(/^FAIL/gm) || []).length
  process.stdout.write(`\r${r.code === 0 ? '✓' : '✗'} ${name.padEnd(28)} ${String(ms).padStart(6)}ms  PASS ${pass}${fail ? `  FAIL ${fail}` : ''}\n`)
  if (r.code !== 0) {
    console.error(`\n--- ${name} 的输出（末尾 40 行）---`)
    console.error(r.out.trimEnd().split('\n').slice(-40).join('\n'))
    console.error('---\n')
  }
}

const bad = rows.filter((r) => r.code !== 0)
const totalPass = rows.reduce((n, r) => n + (r.out.match(/^PASS/gm) || []).length, 0)
const totalFail = rows.reduce((n, r) => n + (r.out.match(/^FAIL/gm) || []).length, 0)
console.log(`\n${bad.length ? '✗' : '✓'} 护栏 ${rows.length} 个：${rows.length - bad.length} 绿 / ${bad.length} 红；断言 PASS ${totalPass} / FAIL ${totalFail}；用时 ${((Date.now() - started) / 1000).toFixed(1)}s`)
if (bad.length) {
  console.error(`红的：${bad.map((r) => r.name).join('、')}`)
  process.exit(1)
}
