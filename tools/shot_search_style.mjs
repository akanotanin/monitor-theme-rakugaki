// 顶栏搜索那一格的**样子**：一张对照图工具（改版前后/明暗/收起长开/窄屏各拍一张）。
//
// 用法：node tools/shot_search_style.mjs [输出目录=shots/search-style2] [DPR=3]
//   先 `npm run build` —— 它伺服的是 dist/。
//
// 为什么另起一个：tools/verify_search.mjs 也存图，但它的 clip 走「元素 rect + scale」，
// 而 CDP 的 clip.scale 与 deviceScaleFactor 是**相乘**的（DPR 2 + scale 2 = 4×，图比视口
// 大四倍、内容只落在左上角一块），量像素时坐标对不上。这里只做一件事：整屏截图（不给 clip，
// 几何完全可预测），再用 PIL 那边按 `CSS 坐标 × DPR` 去裁。
//
// 机位：亮色收起 / 亮色长开 / 亮色长开+有词（× 出现）/ 暗色长开 / 窄屏那一行 / 窄屏收起。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import os from 'node:os'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = process.argv[2] || 'shots/search-style2'
const DPR = Number(process.argv[3] || 3)
const PORT = Number(process.env.SS_PORT || 5411)
// 端口随机：固定端口上一次崩了没 kill 时，新 Chrome 会连到旧实例（或直接起不来）。
const CDP = 9590 + Math.floor(Math.random() * 30)
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
// SS_URL 指到别处（本机隧道 → 真站）就不起本地伺服、也不再打桩：拍的就是那一站。
const LIVE = process.env.SS_URL || ''
const BASE = LIVE || `http://127.0.0.1:${PORT}`
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' }

// 三台就够：这一格只看样子，不看筛出几台。
const NODES = { nodes: ['东京一号', '法兰克福一号', '圣何塞一号'].map((name, i) => ({
  id: i + 1, name, group: ['东京', '法兰克福', '圣何塞'][i], country: ['JP', 'DE', 'US'][i], os: 'Debian GNU/Linux 12 (bookworm)',
  online: true, public: true, sort: i + 1, cpu_name: 'AMD EPYC Processor', cpu_cores: 2, mem_total: 2071396352, disk_total: 20963000320,
  traffic_limit: 536870912000, traffic_mode: 'sum', billing_cycle: 'yearly', currency: 'CNY', price: 349, expires_at: '2027-07-21',
  metrics: { cpu: 7, load: [0.1, 0.2, 0.3], mem_used: 431800320, mem_total: 2071396352, swap_used: 0, swap_total: 0, disk_used: 1524510720, disk_total: 20963000320, net_rx: 867, net_tx: 465, procs: 75, tcp: 16, udp: 3, uptime: 318521 },
})) }
const CONFIG = { cardStyle: 'plain', listTop: 'both' }

const server = createServer((req, res) => {
  const path = new URL(req.url, BASE).pathname
  if (path.startsWith('/api/')) {
    const body = path === '/api/me' ? { authed: false, github: false, public_page: true, site: BASE, site_name: '探针' }
      : path === '/api/nodes' ? NODES
        : path.endsWith('/config') ? CONFIG
          : path.includes('/metrics') ? { metrics: [], probes: [], loss: {} } : {}
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify(body))
  }
  const file = join('dist', normalize(path === '/' ? '/index.html' : path).replace(/^(\\.\\.[/\\\\])+/, ''))
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(200, { 'Content-Type': TYPES['.html'] })
    return res.end(readFileSync('dist/index.html'))
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  res.end(readFileSync(file))
})
if (!LIVE) await new Promise((r) => server.listen(PORT, '127.0.0.1', r))
mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--no-default-browser-check',
  // profile 目录落系统临时目录：TMPDIR 在 cmd/PowerShell 里通常没设，回落到 '.' 会在仓库根
  // 建一个 ss-chrome-* 目录（.gitignore 只忽略 /shots/ 与 /dist/）。
  `--user-data-dir=${(process.env.TEMP || process.env.TMPDIR || os.tmpdir())}/ss-chrome-${CDP}-${Date.now()}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
let wsUrl = ''
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250)
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ''
  } catch { /* 还没起来 */ }
}
if (!wsUrl) throw new Error('Chrome 没起来')
const ws = new WebSocket(wsUrl)
await new Promise((r) => { ws.onopen = r })
const pending = new Map()
let id = 0
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value
await send('Runtime.enable')
await send('Page.enable')

const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'))
  console.log(`  已拍 ${join(OUT, `${name}.png`)}`)
}
const settle = async () => {
  for (let i = 0; i < 40; i++) { await sleep(250); if (await js(`document.fonts.status === 'loaded' && !!document.querySelector('header .search-field')`)) break }
  await sleep(700)
}
const goto = async ({ w, h, dark, mobile }) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: DPR, mobile: !!mobile })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] })
  await send('Page.navigate', { url: `${BASE}/` })
  await settle()
}
// 点顶栏那枚搜索（收起态＝输入框本体），让它长开。
const openSearch = async () => {
  const p = JSON.parse(await js(`(() => { const r = document.querySelector('.search-field-wide .search-input').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }) })()`))
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await sleep(500)
}
const type_ = async (text) => {
  await send('Input.insertText', { text })
  await sleep(400)
}
const moveAway = async (w, h) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(w - 4), y: h - 4 }) }

// 字体是不是同一套：输入框（表单元素）不继承 body 的字体时会退成系统无衬线，
// 那一眼就能看出「系统输入框套了个手绘壳」。
await goto({ w: 1440, h: 900, dark: false })
console.log('  字体：' + await js(`(() => { const i = document.querySelector('.search-field-wide .search-input'); return JSON.stringify({ input: getComputedStyle(i).fontFamily.slice(0, 60), body: getComputedStyle(document.body).fontFamily.slice(0, 60), same: getComputedStyle(i).fontFamily === getComputedStyle(document.body).fontFamily }) })()`))

// ① 亮色：收起 → 长开 → 有词
await goto({ w: 1440, h: 900, dark: false })
await moveAway(1440, 900)
await shot('light-closed')
await openSearch()
await moveAway(1440, 900)
await shot('light-open')
await openSearch()
await type_('东京')
await shot('light-typed')
// ② 暗色：长开 + 有词（收起时是空的，也一样）
await goto({ w: 1440, h: 900, dark: true })
await openSearch()
await moveAway(1440, 900)
await shot('dark-open')
await shot('dark-open-2')
// ③ 窄屏：收起 → 点开那一行
await goto({ w: 390, h: 844, dark: false, mobile: true })
await moveAway(390, 844)
await shot('mobile-closed')
await openSearch()
await shot('mobile-open')
// ④ 悬停（与旁边那几枚图标按钮同一套手势：垫一层暖纸底）
await goto({ w: 1440, h: 900, dark: false })
const p = JSON.parse(await js(`(() => { const r = document.querySelector('.search-field-wide .search-input').getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }) })()`))
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
await sleep(400)
await shot('light-hover')

ws.close()
chrome.kill()
server.close()
console.log(`完成（DPR ${DPR}）：${OUT}`)
