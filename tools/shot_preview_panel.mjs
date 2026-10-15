// 拍面板缩略图 preview.png（面板「主题」页卡片上那张，也是发布包里的同图）：中性夹具 + 当前默认档，
// 固定 1440×810 @2x（16:9，面板里 object-cover object-top，缩到约 300px 宽）。
//
// 用法：node tools/shot_preview_panel.mjs [输出路径=preview.png]
//
// 为什么要有这一份：
//   1. 公开图**不能带真实机器名/金额** —— 一律用仓库自带的 tools/globe-nodes-fixture.json
//      那套中性演示数据（Demo Node <城市>），与六档/地球/手机那几张同源。
//   2. 构图沿用上一版：地球 + 地区列表 + 卡片网格（listTop 钉 'none'，不加概览/分组行）——
//      缩略图那么小，顶上加两行只会把卡片挤掉；「卡片形态跟着默认档走」= latency。
//   3. 与 shot_preview_styles.mjs 同款最小 WebSocket 握手（不推数据）：否则页面顶部会挂
//      「实时连接中断」的提示条，同一份代码早晚两张图一张干净一张带条。
//   4. 固定机位、固定 DPR：换图不该改观感；预览图是 16:9 裁切（第二行卡片被裁是既定构图，
//      别按「完整内容」去调高度）。
//   5. ★地球是自转的：两次拍摄只在球体区域有约 0.1% 的相位差异，其余逐像素一致——属正常；
//      重拍后肉眼过一遍（球面相位不用追平上一版）。
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = process.argv[2] || 'preview.png'
const NODES_PATH = 'tools/globe-nodes-fixture.json'
const PORT = 5216
const W = 1440, H = 810, DPR = 2
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
const NODES = JSON.parse(readFileSync(NODES_PATH, 'utf8'))
/** 站点配置由伺服自己回答（不碰站长存在 hub 里的那份）：默认档 latency + 只留地球那一块。 */
let CONFIG = { listTop: 'none', globeOn: true, cardStyle: 'latency', remarkPlacement: 'both', pingLines: '', themeMode: 'system' }
let configHits = 0

/**
 * 三网延迟的桩数据：**必须给**，否则「延迟」档的卡片会少掉下面那三行（卡片矮一截，
 * 与旧图一比就是「这一档怎么变短了」）。三条线路、60 个点、60 秒一步，数值是中性演示值。
 */
const pingPayload = (id) => {
  const now = Math.floor(Date.now() / 1000)
  const ping = []
  for (const [task, base] of [[1, 62], [2, 92], [3, 121]]) {
    for (let i = 59; i >= 0; i--) {
      const jitter = ((i * 7 + task * 13 + id * 5) % 17) - 8
      ping.push({ ts: now - i * 60, task_id: task, latency: Math.max(8, base + jitter) })
    }
  }
  return { metrics: [], ping, step: 60, probes: { 1: '电信', 2: '联通', 3: '移动' }, loss: {} }
}

const server = createServer((req, res) => {
  const path = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname
  if (path === '/api/ws' && (req.headers.upgrade || '').toLowerCase() === 'websocket') {
    const key = req.headers['sec-websocket-key'] || ''
    const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')
    res.writeHead(101, { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Accept': accept })
    const keep = setInterval(() => res.socket.write(Buffer.from([0x89, 0x00])), 5000)
    req.socket.on('close', () => clearInterval(keep))
    return
  }
  if (path.startsWith('/api/')) {
    if (path.includes('/config')) configHits += 1
    const body = path === '/api/me'
      ? { authed: false, github: false, public_page: true, site: `http://127.0.0.1:${PORT}`, site_name: 'Monitor', history_days: 30 }
      : path === '/api/nodes' ? NODES
        : path.includes('/config') ? CONFIG
          : path.includes('/metrics') ? pingPayload(Number((path.match(/nodes\/(\d+)/) || [])[1] || 1))
            : { nodes: [] }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(body))
  }
  const file = join('dist', normalize(path === '/' ? '/index.html' : path).replace(/^(\.[/\\])+/, ''))
  if (!existsSync(file)) { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(readFileSync('dist/index.html')) }
  res.writeHead(200, { 'Content-Type': TYPES[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, r))

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => existsSync(p)) || 'chrome'
const dbg = 9983 + Math.floor(Math.random() * 7)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${dbg}`, '--remote-allow-origins=*', '--no-first-run', '--disable-gpu',
  '--hide-scrollbars', `--user-data-dir=${(process.env.TEMP || '/tmp')}/shotpreview-${Date.now()}`, 'about:blank'], { stdio: 'ignore' })
let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl } catch { }; if (!wsUrl) await sleep(300) }
if (!wsUrl) throw new Error('Chrome 起不来')
let id = 0; const pend = new Map(); const ws = new WebSocket(wsUrl)
await new Promise((r) => { ws.onopen = r })
const errs = []
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text) }
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result?.result?.value }
await send('Runtime.enable'); await send('Page.enable')

// 数据是轮询来的、卡片有进度条过渡：等「卡片 ≥2 + 字体就绪 + 条已有宽度」再拍（判据里别带 %，那是正常内容）。
const SETTLED = `(() => {
  const cards = document.querySelectorAll('[data-slot="card"]');
  if (cards.length < 2) return false;
  if (!document.fonts || document.fonts.status !== 'loaded') return false;
  const bars = [...document.querySelectorAll('.sk-bar-fill')];
  if (!bars.some((b) => b.getBoundingClientRect().width > 2)) return false;
  return true;
})()`

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false })
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
let ok = false
for (let i = 0; i < 80; i++) { await sleep(300); if (await js(SETTLED)) { ok = true; break } }
await sleep(1800)
const facts = JSON.parse(await js(`JSON.stringify({
  style: document.querySelector('[data-card-style]')?.getAttribute('data-card-style') ?? null,
  cards: document.querySelectorAll('[data-slot="card"]').length,
  globe: !!document.querySelector('canvas, svg[viewBox]'),
})`))
const r = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(OUT, Buffer.from(r.result.data, 'base64'))
console.log(`输出 ${OUT} ｜ ${W}×${H}@${DPR} ｜ data-card-style=${facts.style} ｜ 卡片 ${facts.cards} ｜ ${(Buffer.from(r.result.data, 'base64').length / 1024).toFixed(0)}KB ｜ 地球 ${facts.globe} ｜ ${ok ? '就绪' : '⚠ 等超时'} ｜ 桩命中 ${configHits}`)
console.log('控制台异常:', errs.length ? errs.join(' | ') : '无')
ws.close(); chrome.kill(); server.close()
