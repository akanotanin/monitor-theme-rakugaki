// 「经典 / 延迟」两档右上角那枚 ⓘ 悬浮层 —— 退役之后的护栏（2026-10-14 站长定的）。
//
// 用法：node tools/verify_peek_retired.mjs [端口]
//   自带静态伺服（本机 dist + 桩 /api，未知路径回落入口 HTML），并数
//   /api/nodes/<id>/metrics 的请求数——「一个 ping 都不发」这类判据全靠它。
//
// 背景：那枚控件 2026-10-03 加、10-14 撤（「把经典形态和延迟形态的悬浮层去掉」）。
// 它原来装的四样现在各有归宿：在线时间 / 计费 / 到期 = 整页详情的信息项（后两个 10-14 新加），
// 备注 = 整页详情那一块（经典/延迟卡面从此不摊备注）。这份护栏钉三件事：
//   ① **不再回来**：经典 / 延迟（以及其余各档）卡片上不许再出现任何悬浮层元素——
//      控件、浮层、三网延迟块、备注面板、备注按钮，一个都不许有；
//   ② 列表页一个 ping 请求都不发（原来只有点开经典档浮层才取数，现在连入口都没了）；
//   ③ **信息归位**：详情页信息项里有「计费」「到期」（口径与「详细」档第二行一致）、
//      「在线时间」仍在；延迟 / 详细两档的**卡面**三网延迟照旧（点一行直达 ?tab=latency）。
//
// 桩数据：节点 ¥12.50 / 月付、到期剩余 95 天；四条线路 42/88/130/210ms。
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.argv[2] || 5591)
const CDP_PORT = PORT + 4200

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
}

/* ------------------------------------------------------------------ 桩数据 */
const GB = 1024 ** 3
const TB = 1024 ** 4
const node = (id, name) => ({
  id, name, sort: id, public: true, online: true, country: 'JP', group: '',
  last_seen: Math.floor(Date.now() / 1000) - 5,
  metrics: {
    uptime: 400000, cpu: 12.5, load: [0.1, 0.2, 0.3], mem_total: 2 * GB, mem_used: 1 * GB,
    swap_total: 0, swap_used: 0, disk_total: 40 * GB, disk_used: 10 * GB,
    net_rx: 512 * 1024, net_tx: 128 * 1024, total_rx: 1 * TB, total_tx: 256 * GB,
    month_rx: 8 * GB, month_tx: 4 * GB, tcp: 10, udp: 2, procs: 100,
  },
  os: 'Debian 12', kernel: '6.1.0', arch: 'x86_64', virt: 'kvm', cpu_name: 'Xeon',
  cpu_cores: 2, mem_total: 2 * GB, swap_total: 0, disk_total: 40 * GB,
  agent_version: '1.3.0', price: 12.5, currency: 'CNY', billing_cycle: 'monthly',
  expires_at: '2027-01-01', expires_in: 95, traffic_limit: 1 * TB, traffic_mode: 'sum',
  traffic_reset_day: 1, total_rx: 1 * TB, total_tx: 256 * GB,
  month_rx: 8 * GB, month_tx: 4 * GB, month_start: '2026-09-01', day_rx: 1 * GB, day_tx: GB / 2,
  public_remark: '',
})
const NODES = { nodes: [node(1, '节点一'), node(2, '节点二'), node(3, '节点三')] }

// 最后一点正好是 base：卡面显示「最新一个非空样本」，断言才写得成固定数字。
const pingPoints = (taskId, base) => Array.from({ length: 12 }, (_, i) => ({
  task_id: taskId, ts: Math.floor(Date.now() / 1000) - (12 - i) * 300,
  latency: i === 11 ? base : Math.round(base + Math.sin(i) * 2), band: [base - 10, base + 10], loss: 0,
}))
const PING = {
  ping: [...pingPoints(11, 42), ...pingPoints(12, 88), ...pingPoints(13, 130), ...pingPoints(14, 210)],
  probes: { 11: '北京电信', 12: '北京联通', 13: '北京移动', 14: '上海电信' },
  loss: { 11: 0, 12: 1.2, 13: 0, 14: 3.4 },
}

let config = {}
let pingHits = []

/* ------------------------------------------------------------------ 伺服 */
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  if (path === '/__stats' || path === '/__reset') {
    if (path === '/__reset') pingHits = []
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify({ pingHits }))
  }
  if (path.startsWith('/api/')) {
    let body = {}
    if (path === '/api/me') body = { authed: false, github: false, history_days: 30, public_page: true, site: `http://127.0.0.1:${PORT}`, site_name: '退役护栏' }
    else if (path === '/api/nodes') body = NODES
    else if (path.endsWith('/config')) body = config
    else if (path === '/api/version') body = { version: '1.3.0' }
    else if (/^\/api\/nodes\/\d+\/metrics/.test(path)) {
      pingHits.push(path)
      body = url.searchParams.get('series') === 'ping'
        ? PING
        : { ts: [], cpu: [], mem_used: [], disk_used: [], net_rx: [], net_tx: [] }
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify(body))
  }
  const file = path === '/' ? '/index.html' : path
  const full = join('dist', normalize(file).replace(/^(\.[/\\])+/, ''))
  if (!existsSync(full) || statSync(full).isDirectory()) {
    res.writeHead(200, { 'Content-Type': TYPES['.html'] })
    return res.end(readFileSync('dist/index.html'))
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(full)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  res.end(readFileSync(full))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

/* ------------------------------------------------------------------ 浏览器 */
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => existsSync(p)) || 'chrome'
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--no-proxy-server',
  `--user-data-dir=${join(tmpdir(), `peekret${CDP_PORT}`)}`, '--no-sandbox', 'about:blank',
], { stdio: 'ignore' })

let id = 0
const pending = new Map()
const problems = []
let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch { /* 等 Chrome 起来 */ }
  if (!wsUrl) await sleep(250)
}
if (!wsUrl) throw new Error('Chrome 没起来')
const ws = new WebSocket(wsUrl)
await new Promise((r) => { ws.onopen = r })
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Runtime.exceptionThrown') problems.push(`[exception] ${m.params.exceptionDetails.text}`)
}
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
await send('Runtime.enable')
await send('Page.enable')

/* ------------------------------------------------------------------ 探针 */
// 悬浮层元素清单：那枚 ⓘ（[data-note-popover]）、它的浮层（[data-note-panel]）、
// 经典档浮层里的三网延迟块（[data-peek-latency]）、详细档的备注面板（[data-remark-panel]）、
// 以及任何 aria-label 里写着「备注 / 在线时间 / 价格 / 到期」的按钮——全部按结构取，不认类名。
const CARD = `JSON.stringify((() => {
  const cards = [...document.querySelectorAll('[data-slot="card"]')];
  const card = cards.find((c) => /CPU/.test(c.innerText));
  const empty = { card: false, n: cards.length, popover: false, panel: false, peek: false, remarkPanel: false, noteBtns: [], latency: false, latencyRows: 0, cardH: 0, overflowX: false, vw: innerWidth };
  if (!card) return empty;
  return {
    card: true, n: cards.length,
    popover: !!card.querySelector('[data-note-popover]'),
    panel: !!card.querySelector('[data-note-panel]'),
    peek: !!card.querySelector('[data-peek-latency]'),
    remarkPanel: !!card.querySelector('[data-remark-panel]'),
    noteBtns: [...card.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || '').filter((l) => /备注|在线时间|价格|到期/.test(l)),
    latency: !!card.querySelector('[data-latency]'),
    latencyRows: card.querySelectorAll('[data-latency] [data-probe-name]').length,
    cardH: Math.round(card.getBoundingClientRect().height),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    vw: window.innerWidth,
  };
})())`

const DETAIL = `JSON.stringify((() => {
  const dts = [...document.querySelectorAll('dt')];
  const val = (label) => { const dt = dts.find((d) => d.textContent.trim() === label); const dd = dt ? dt.parentElement.querySelector('dd') : null; return dd ? dd.textContent.trim() : null };
  return {
    labels: dts.map((d) => d.textContent.trim()),
    billing: val('计费'), expiry: val('到期'), online: val('在线时间'),
    peek: !!document.querySelector('[data-peek-latency]'),
    popover: !!document.querySelector('[data-note-popover]'),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
})())`

const hits = async () => (await (await fetch(`http://127.0.0.1:${PORT}/__stats`)).json()).pingHits.length

async function render(cfg, { width = 1440, height = 1200, path = '/' } = {}) {
  config = cfg
  await fetch(`http://127.0.0.1:${PORT}/__reset`)
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${path}?m=${encodeURIComponent(JSON.stringify(cfg))}` })
  for (let i = 0; i < 60; i++) {
    await sleep(250)
    const raw = await evalJS(path === '/'
      ? `document.querySelectorAll('[data-slot="card"], table tbody tr[role=button]').length`
      : `document.querySelectorAll('dd').length`)
    if (raw > 0) break
  }
  await sleep(700)
}

const results = []
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`) }
const LAYERS = (c) => JSON.stringify({ popover: c.popover, panel: c.panel, peek: c.peek, remarkPanel: c.remarkPanel, noteBtns: c.noteBtns })
const NO_LAYERS = (c) => !c.popover && !c.panel && !c.peek && !c.remarkPanel && c.noteBtns.length === 0

/* ───────────────── ① 经典档：悬浮层退役后一个元素都不剩，也不取数 ───────────────── */
console.log('\n── 经典档：ⓘ 悬浮层已退役（2026-10-14）──')
await render({ cardStyle: 'classic' })
const classic = JSON.parse(await evalJS(CARD))
check('经典：卡片上没有 ⓘ、浮层、延迟块、备注面板与备注按钮（五样全无）', NO_LAYERS(classic), LAYERS(classic))
check('经典：卡片上也没有 [data-latency]（那本来就是延迟档的卡面块）', !classic.latency, JSON.stringify({ latency: classic.latency }))
check('经典：页面加载后一个 ping 请求都不发', (await hits()) === 0, `实测 ${await hits()} 次`)
await sleep(1300)
check('经典：静置 1.3 秒仍没有 ping 请求（没有偷偷轮询）', (await hits()) === 0, `实测 ${await hits()} 次`)

/* ───────────────── ② 延迟档：悬浮层同样退役，卡面三网延迟照旧、行可点 ───────────────── */
console.log('\n── 延迟档：悬浮层退役，卡面三网延迟与「点行直达」照旧 ──')
await render({ cardStyle: 'latency' })
const latency = JSON.parse(await evalJS(CARD))
check('延迟：卡片上没有 ⓘ、浮层、延迟块、备注面板与备注按钮（五样全无）', NO_LAYERS(latency), LAYERS(latency))
check('延迟：卡面三网延迟照旧（三条线路）', latency.latency && latency.latencyRows === 3, JSON.stringify({ block: latency.latency, rows: latency.latencyRows }))
check('延迟：三张卡各取一条 ping（3 次；不是 0 也不是更多）', (await hits()) === 3, `实测 ${await hits()} 次`)
{
  const jumped = await evalJS(`(async () => {
    const row = document.querySelector('[data-latency] [data-probe-name]')
    const line = row ? row.parentElement : null
    if (!line) return 'no-line'
    line.click()
    await new Promise((r) => setTimeout(r, 800))
    return location.pathname + location.search
  })()`)
  check('★ 点卡面一条延迟行：跳详情页且 URL 带 ?tab=latency（不是默认的「资源」）',
    String(jumped) === '/node/1?tab=latency', String(jumped))
  const landed = JSON.parse(String(await evalJS(`(async () => {
    let btn = null
    for (let i = 0; i < 30; i++) {
      const btns = [...document.querySelectorAll('main button')]
      btn = btns.find((b) => b.textContent.trim() === '网络延迟')
      if (btn) break
      await new Promise((r) => setTimeout(r, 100))
    }
    const res = [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === '资源')
    return JSON.stringify({ net: btn ? btn.className : null, res: res ? res.className : null })
  })()`)))
  check('★ 落点就是「网络延迟」页签（高亮在它身上、资源那个没有）',
    !!landed.net && /sk-chip-on/.test(String(landed.net)) && !!landed.res && !/sk-chip-on/.test(String(landed.res)),
    JSON.stringify(landed))
}

/* ───────────────── ③ 详细档：本来就没有那枚控件，卡面延迟照旧 ───────────────── */
console.log('\n── 详细档：无 ⓘ（原样），卡面三网延迟照旧 ──')
await render({ cardStyle: 'detailed' })
const detailed = JSON.parse(await evalJS(CARD))
check('详细：卡片上没有 ⓘ / 浮层 / 延迟块（备注那套挂的是 [data-remark]，不算）',
  !detailed.popover && !detailed.panel && !detailed.peek, LAYERS(detailed))
check('详细：卡面三网延迟照旧（三条）+ 三张卡 3 次请求', detailed.latency && detailed.latencyRows === 3 && (await hits()) === 3,
  JSON.stringify({ rows: detailed.latencyRows, hits: await hits() }))

/* ───────────────── ④ 简约 / 紧凑：全程无悬浮层元素、零请求 ───────────────── */
console.log('\n── 简约 / 紧凑：全程零请求 ──')
for (const style of ['plain', 'compact']) {
  await render({ cardStyle: style })
  const before = await hits()
  await sleep(800)
  const after = await hits()
  const got = JSON.parse(await evalJS(CARD))
  check(`${style}：没有悬浮层元素、也不发 ping 请求`, before === 0 && after === 0 && (style === 'compact' || NO_LAYERS(got)),
    JSON.stringify({ hits: `${before} → ${after}`, layers: got.card ? LAYERS(got) : 'n/a' }))
}

/* ───────────────── ⑤ 信息归位：详情页的「计费 / 到期 / 在线时间」 ───────────────── */
console.log('\n── 详情页：计费 / 到期 / 在线时间 三个信息项 ──')
await render({ cardStyle: 'plain' }, { path: '/node/1' })
const detail = JSON.parse(await evalJS(DETAIL))
check('详情页：「计费」= ¥12.50 / 月付（与「详细」档第二行同一口径）', detail.billing === '¥12.50 / 月付', String(detail.billing))
check('详情页：「到期」= 剩余 95 天', detail.expiry === '剩余 95 天', String(detail.expiry))
check('详情页：「在线时间」仍在（值非空）', !!detail.online && detail.online.length > 0, String(detail.online))
check('详情页：没有任何 [data-peek-latency] 残留', !detail.peek && !detail.popover, JSON.stringify({ peek: detail.peek, popover: detail.popover }))
check('详情页：没有横向溢出', detail.overflowX === false, String(detail.overflowX))
console.log(`  （信息项清单：${detail.labels.join(' / ')}）`)

/* ───────────────── ⑥ 手机 390：经典档不冒悬浮层、不溢出 ───────────────── */
console.log('\n── 手机 390（触屏机位）──')
await render({ cardStyle: 'classic' }, { width: 390, height: 844 })
const mob = JSON.parse(await evalJS(CARD))
check('手机：经典卡片上依然一个悬浮层元素都没有', NO_LAYERS(mob), LAYERS(mob))
check('手机：页面没有横向溢出', mob.overflowX === false, String(mob.overflowX))

/* ───────────────── 收尾 ───────────────── */
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} PASS / ${failed.length} FAIL`)
if (problems.length) console.log(`控制台异常 ${problems.length} 条：\n  ${problems.slice(0, 5).join('\n  ')}`)
else console.log('全程没有控制台异常')
ws.close()
chrome.kill()
server.close()
process.exit(failed.length || problems.length ? 1 : 0)
