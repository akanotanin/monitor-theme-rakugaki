// 地区归属的护栏：城市线索**不许把节点钉到别的国家去**。
//
// 2026-11-23 真机量出来的三条（都是分组缩写 / 机器名前缀同时是机场码）：
//   { country: 'SG', group: 'SEA', name: 'sg-01' } → 'SG · Seattle'（落点 -122.3, 47.6）
//   { country: 'CA', group: 'CAN', name: 'ca-01' } → 'CA · Guangzhou'（落点 113.3, 23.1）
//   { country: 'DE', name: 'SG-01' }              → 'DE · Singapore'（落点 103.8, 1.35）
// 后果不只是针落错位置：同一个国家会裂成两行地区（`SG · Seattle` 与 `SG · Singapore`），
// 地球上也变成两枚相距半个地球的针。
//
// 判据（见 globe.ts 的 cityHint）：命中的那一段是**纯字母码**时，节点国家码必须在该城市的
// cc 表里；中文写法与城市全名是强线索，不校验。
//
// 用法：cd <repo> && node tools/verify_region_coverage.mjs
import { regionOf, regionRows, globeNodes, cityHint } from '../src/lib/globe.ts'

let failed = 0
const rows = []
const check = (ok, what, got) => {
  rows.push({ ok, what })
  if (!ok) { failed++; console.error(`FAIL ${what}${got === undefined ? '' : `（${got}）`}`) }
  else console.log(`PASS ${what}${got === undefined ? '' : `（${got}）`}`)
}

/** 最小可用节点（只填 regionOf 会读的字段）。 */
const mk = (over) => ({
  id: 1, name: '', group: '', country: '', online: true, sort: 1, public: true,
  last_seen: 0, last_seen_ago: 0, metrics: null, os: '', kernel: '', arch: '', virt: '',
  cpu_name: '', cpu_cores: 0, mem_total: 0, swap_total: 0, disk_total: 0, agent_version: '',
  price: 0, currency: '', billing_cycle: '', expires_at: '', expires_in: 0,
  traffic_limit: 0, traffic_mode: '', traffic_reset_day: 0,
  total_rx: 0, total_tx: 0, month_rx: 0, month_tx: 0, month_start: '', day_rx: 0, day_tx: 0,
  public_remark: '', ...over,
})

// ---------- ① 三字码不跨国家 ----------
check(regionOf(mk({ country: 'SG', group: 'SEA', name: 'sg-01' }))?.city === 'Singapore',
  'SG + group=SEA：不被认成 Seattle', regionOf(mk({ country: 'SG', group: 'SEA', name: 'sg-01' }))?.key)
check(regionOf(mk({ country: 'CA', group: 'CAN', name: 'ca-01' }))?.city === '',
  'CA + group=CAN：不被认成 Guangzhou（无线索，走国家级）', regionOf(mk({ country: 'CA', group: 'CAN', name: 'ca-01' }))?.key)
check(regionOf(mk({ country: 'DE', name: 'SG-01' }))?.city === '',
  'DE + 名字里的 SG：不被认成 Singapore', regionOf(mk({ country: 'DE', name: 'SG-01' }))?.key)
check(regionOf(mk({ country: 'JP', group: 'SJC', name: 'jp-01' }))?.city === '',
  'JP + group=SJC：不被认成 San Jose', regionOf(mk({ country: 'JP', group: 'SJC', name: 'jp-01' }))?.key)

// ---------- ② 同国三字码照旧生效 ----------
check(regionOf(mk({ country: 'US', group: 'LAX', name: 'us-01' }))?.city === 'Los Angeles',
  'US + LAX：同国机场码照旧生效', regionOf(mk({ country: 'US', group: 'LAX', name: 'us-01' }))?.key)
check(regionOf(mk({ country: 'JP', group: 'TYO', name: 'jp-01' }))?.city === 'Tokyo',
  'JP + TYO：同国三字码照旧生效', regionOf(mk({ country: 'JP', group: 'TYO', name: 'jp-01' }))?.key)

// ---------- ③ 强线索不校验国家 ----------
check(cityHint(mk({ country: 'SG', name: '东京 01' }))?.name === 'Tokyo',
  '中文写法是强线索：SG 的机器写「东京」也认东京', cityHint(mk({ country: 'SG', name: '东京 01' }))?.name)
check(cityHint(mk({ country: 'DE', name: 'Seattle' }))?.name === 'Seattle',
  '城市全名是强线索：DE 的机器写 Seattle 也认西雅图', cityHint(mk({ country: 'DE', name: 'Seattle' }))?.name)

// ---------- ④ 没有国家码时不再整台丢弃 ----------
check(regionOf(mk({ country: '', name: 'Tokyo-01' }))?.key === 'JP · Tokyo',
  '缺国家码但认得出城市：上地球（用城市归属国补 key）', regionOf(mk({ country: '', name: 'Tokyo-01' }))?.key)
check(regionOf(mk({ country: ' ', name: '香港 01' }))?.key === 'HK · Hong Kong',
  '国家码是空白字符时同上', regionOf(mk({ country: ' ', name: '香港 01' }))?.key)
check(regionOf(mk({ country: '', name: '无名机器' })) === null,
  '缺国家码又认不出城市：仍然不上地球')

// ---------- ⑤ 同一国家的两行不许裂开（这是原来的真实后果） ----------
{
  const fleet = [
    mk({ id: 1, country: 'SG', group: 'SEA', name: 'sg-01' }),
    mk({ id: 2, country: 'SG', group: 'SG', name: 'sg-02' }),
  ]
  const rs = regionRows(fleet)
  check(rs.length === 1 && rs[0].region.key === 'SG · Singapore' && rs[0].count === 2,
    '两台 SG 的机器只出一行地区（不再裂成 Seattle + Singapore）', rs.map((r) => `${r.region.key} n=${r.count}`).join(' / '))
  const gs = globeNodes(fleet)
  const lon = gs.map((g) => g.ll[0])
  check(gs.length === 2 && lon.every((x) => x > 90 && x < 120),
    '两枚针都落在东经 90–120（不再有一枚漂到 -122）', lon.map((x) => x.toFixed(2)).join(', '))
}

console.log(`\n结果: PASS ${rows.filter((r) => r.ok).length} / FAIL ${failed}`)
process.exit(failed ? 1 : 0)
