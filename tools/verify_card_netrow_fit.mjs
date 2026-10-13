// 逐宽度钉住节点卡「网速+流量」行的两个边界，以及读数层的容器查询档位：
//   ① 单行：除 640px 那一档的最极端读数（双向都 ≥999 KB/s，夹具节点 WorstKB 专门造出来）外，
//      任何真实宽度下这一行都不许折行——2026-10-14 站长截图「同屏有的卡折有的不折」的护栏；
//   ② 字号档：窄卡（内容盒 ≤288px）读数层 11px、宽卡 12px——容器查询的生效边界；
//   ③ 不截断：卡内 .truncate 元素（读数脚注等）scrollWidth 不许超过 clientWidth。
// 用法：cd <repo> && node tools/verify_card_netrow_fit.mjs
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 5507
const CDP_PORT = PORT + 4000
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' }
const GB = 1024 ** 3, KB = 1024

const metrics = (o) => ({ uptime: 400000, cpu: 5, load: [0.1, 0.2, 0.3], mem_total: 960 * 1024 ** 2, mem_used: 400 * 1024 ** 2, swap_total: 0, swap_used: 0, disk_total: 40 * GB, disk_used: 10 * GB, net_rx: 0, net_tx: 0, total_rx: 0, total_tx: 0, month_rx: 0, month_tx: 0, tcp: 10, udp: 2, procs: 100, ...o })
const node = (id, name, o) => ({ id, name, sort: id, public: true, online: true, country: 'JP', group: '', last_seen: Math.floor(Date.now() / 1000) - 5, metrics: metrics({}), os: 'Debian 12', kernel: '6.1.0', arch: 'x86_64', virt: 'kvm', cpu_name: 'EPYC', cpu_cores: 1, mem_total: 960 * 1024 ** 2, swap_total: 0, disk_total: 40 * GB, agent_version: '1.4.0', price: 0, currency: 'CNY', billing_cycle: 'monthly', expires_at: null, expires_in: null, traffic_limit: 250 * GB, traffic_mode: 'sum', traffic_reset_day: 1, total_rx: 0, total_tx: 0, month_rx: 0, month_tx: 0, month_start: '', day_rx: 0, day_tx: 0, ...o })

// 实拍里那四张卡（单行 / 折行各两张，都是手写数字换代后 12px 下「内容宽度正好卡在可用宽两侧」
// 的形状）。WorstKB 是故意造的极端形状。
const NODES = { nodes: [
  node(1, 'Alpha San Jose', { metrics: metrics({ net_rx: 16 * KB, net_tx: 544, cpu: 1.0 }), total_rx: 37.4 * GB, total_tx: 2.5 * GB, day_rx: 6.06 * GB, disk_used: 1.97 * GB, mem_used: 404.56 * 1024 ** 2 }),
  node(2, 'Bravo Tokyo', { metrics: metrics({ net_rx: 1229, net_tx: 660, cpu: 0.0 }), total_rx: 4.74 * GB, total_tx: 2.43 * GB, day_rx: 1012 * 1024 ** 2, disk_used: 2.62 * GB, mem_used: 309.67 * 1024 ** 2 }),
  node(3, 'Gamma San Jose', { metrics: metrics({ net_rx: 12 * KB, net_tx: 11 * KB, cpu: 0.0 }), total_rx: 40.2 * GB, total_tx: 39.0 * GB, day_rx: 77.44 * GB, disk_used: 1.42 * GB, mem_used: 443.68 * 1024 ** 2 }),
  node(4, 'Delta Frankfurt', { metrics: metrics({ net_rx: 16 * KB, net_tx: 1126, cpu: 1.0 }), total_rx: 42.9 * GB, total_tx: 7.33 * GB, day_rx: 19.99 * GB, disk_used: 4.02 * GB, mem_used: 551.22 * 1024 ** 2 }),
  node(5, 'WorstKB', { metrics: metrics({ net_rx: 1023.9 * KB, net_tx: 1023.9 * KB, cpu: 12.5 }), total_rx: 999.9 * GB, total_tx: 999.9 * GB }),
] }

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const json = (b) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(b)) }
  if (path.startsWith('/api/')) {
    if (path === '/api/me') return json({ authed: false, github: false, public_page: true, site: `http://127.0.0.1:${PORT}`, site_name: '量测' })
    if (path === '/api/nodes') return json(NODES)
    if (path.endsWith('/config')) return json({ listTop: 'summary', cardStyle: 'latency', remarkPlacement: 'peek', historyDays: 1 })
    if (/^\/api\/nodes\/\d+\/metrics/.test(path)) return json({ ping: [], probes: {}, loss: {} })
    return json({})
  }
  const file = path === '/' ? '/index.html' : path
  const full = join('dist', normalize(file).replace(/^(\.\.[/\\])+/, ''))
  if (!existsSync(full) || statSync(full).isDirectory()) {
    res.writeHead(200, { 'Content-Type': TYPES['.html'] })
    return res.end(readFileSync('dist/index.html'))
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(full)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  res.end(readFileSync(full))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p)) || 'chrome'
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server', `--user-data-dir=${process.env.LOCALAPPDATA || '/tmp'}/Temp/verify${CDP_PORT}`, 'about:blank'], { stdio: 'ignore' })

let id = 0
const pending = new Map()
let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch { /* 等 Chrome */ }
  if (!wsUrl) await sleep(250)
}
if (!wsUrl) throw new Error('Chrome 没起来')
const ws = new WebSocket(wsUrl)
await new Promise((r) => { ws.onopen = r })
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Runtime.enable')
await send('Page.enable')

const PROBE = `JSON.stringify((() => {
  const cards = [...document.querySelectorAll('[data-slot="card"]')].filter(c => c.querySelector('[data-net="row"]'))
  if (!cards.length) return { err: 'no node cards' }
  const out = cards.map(c => {
    const r = c.querySelector('[data-net="row"]')
    const [s1, s2] = r.children
    const clipped = [...c.querySelectorAll('.truncate')].map(e => ({ t: (e.innerText || '').trim().slice(0, 24), clip: e.scrollWidth - e.clientWidth })).filter(x => x.clip > 0)
    return {
      name: (c.querySelector('h3')?.innerText || '').trim().split(' ')[0],
      wrapped: Math.abs(s1.getBoundingClientRect().top - s2.getBoundingClientRect().top) > 2,
      rowClip: (s1.scrollWidth - s1.clientWidth) + (s2.scrollWidth - s2.clientWidth),
      fs: getComputedStyle(r).fontSize, clipped,
    }
  })
  return { cards: out, fontsReady: document.fonts.status, body: document.body.innerText.slice(0, 80) }
})())`

const WIDTHS = [390, 640, 674, 768, 1024, 1440]
// 每档的期望：row 字号；以及是否允许 WorstKB 折行（仅最窄两列档）
const EXPECT = { 390: { fs: '12px', allowWorstWrap: false }, 640: { fs: '11px', allowWorstWrap: true }, 674: { fs: '11px', allowWorstWrap: false }, 768: { fs: '12px', allowWorstWrap: false }, 1024: { fs: '11px', allowWorstWrap: false }, 1440: { fs: '11px', allowWorstWrap: false } }

const results = []
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`) }

for (const w of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 1100, deviceScaleFactor: 1, mobile: w < 600 })
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/?w=${w}&t=${Date.now()}` })
  let dom = null
  for (let i = 0; i < 60; i++) {
    await sleep(150)
    const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: true })
    const raw = r.result?.result?.value
    if (raw) { dom = JSON.parse(raw); if (!dom.err && dom.cards?.length && dom.fontsReady === 'loaded') break }
  }
  if (!dom || dom.err) { check(`w=${w}：页面渲染出节点卡`, false, dom?.err ?? '超时'); continue }
  const exp = EXPECT[w]

  const badWrap = dom.cards.filter(c => c.wrapped && !(exp.allowWorstWrap && c.name === 'WorstKB'))
  check(`w=${w}：网速行全部单行（${dom.cards.length} 张卡）`, badWrap.length === 0,
    badWrap.length ? JSON.stringify(badWrap.map(c => c.name)) : `fs=${dom.cards[0].fs}`)

  const wrongFs = dom.cards.filter(c => c.fs !== exp.fs)
  check(`w=${w}：读数层字号 = ${exp.fs}（容器查询档位）`, wrongFs.length === 0,
    wrongFs.length ? JSON.stringify(wrongFs.map(c => `${c.name}:${c.fs}`)) : `${dom.cards[0].fs} ×${dom.cards.length}`)

  const rowClip = dom.cards.filter(c => c.rowClip > 0)
  check(`w=${w}：网速行两段都没被截断`, rowClip.length === 0, rowClip.length ? JSON.stringify(rowClip.map(c => `${c.name}:${c.rowClip}`)) : '零截断')

  // 640 档的脚注正好贴在格宽上（115/115），±1px 的取整不当作缺陷；>1px 才算。
  const badClip = dom.cards.flatMap(c => c.clipped.filter(x => x.clip > 1).map(x => `${c.name}:“${x.t}”✂${x.clip}`))
  check(`w=${w}：卡内读数/脚注无实质截断（≤1px 取整豁免）`, badClip.length === 0,
    badClip.length ? JSON.stringify(badClip) : '零截断')
}

const fails = results.filter((r) => !r.ok).length
console.log(`\n=== ${results.length - fails} PASS / ${fails} FAIL ===`)

ws.close()
chrome.kill()
server.close()
process.exit(fails ? 1 : 0)
