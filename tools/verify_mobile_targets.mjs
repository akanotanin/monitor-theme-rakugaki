// 「手机上点得到」的一组回归：390 宽下紧凑档展开行的「完整详情 ›」不许折行，
// 地球针的命中圆在窄屏上不许小于 WCAG 2.5.8 的 24px（按屏幕像素量，不是 SVG 用户单位）。
//
// 两条都是 2026-11-23 实测出来的真问题：
//   ① 390 宽 + 4 枚量程按钮（history_days=2）时，按钮被挤成 **12×80（5 行竖排）**，
//      操作条 80px 高；history_days 为 14/30（5 枚按钮）反而正常 —— 所以「换台机器看不出来」。
//   ② `.hit` 的 r=9 是 SVG 用户单位，跟着画布缩：390 宽实测 13.3×13.3px，1440 宽 21×21px。
//
// 用法：cd <repo> && node tools/verify_mobile_targets.mjs
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { assertDistFresh } from "./_dist-fresh.mjs"
import { findChrome } from "./_chrome.mjs"
assertDistFresh()

const PORT = Number(process.env.MOBILE_PORT || 5288)
const CDP_PORT = PORT + 4000
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' }

/** 一台在线、有备注的机器（挤压那条要靠备注把右端撑满）。 */
const node = {
  id: 7, name: '朋友挂的机器', sort: 1, public: true, online: true, country: 'JP', group: '东京',
  last_seen: Math.floor(Date.now() / 1000), last_seen_ago: 2,
  metrics: {
    uptime: 100000, cpu: 12.5, load: [0.1, 0.2, 0.3], mem_total: 2147483648, mem_used: 1073741824,
    swap_total: 0, swap_used: 0, disk_total: 42949672960, disk_used: 21474836480,
    net_rx: 1024, net_tx: 2048, total_rx: 1000, total_tx: 2000, month_rx: 3000, month_tx: 4000,
    tcp: 1, udp: 2, procs: 3,
  },
  os: 'Debian', kernel: '6.1', arch: 'x86_64', virt: 'kvm', cpu_name: 'EPYC', cpu_cores: 4,
  mem_total: 2147483648, swap_total: 0, disk_total: 42949672960, agent_version: '1.4',
  price: 12.5, currency: 'USD', billing_cycle: 'monthly', expires_at: '2027-01-01', expires_in: 40,
  traffic_limit: 0, traffic_mode: 'sum', traffic_reset_day: 1, total_rx: 0, total_tx: 0,
  month_rx: 0, month_tx: 0, month_start: '', day_rx: 0, day_tx: 0, public_remark: '朋友专用',
}

const server = createServer((req, res) => {
  const path = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname
  const json = (b) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(b)) }
  if (path.startsWith('/api/')) {
    // ★history_days=2 → 量程按钮 4 枚。这是挤压的临界配置（5 枚反而换行成两行、不会挤）。
    if (path === '/api/me') return json({ authed: false, github: false, public_page: true, site: `http://127.0.0.1:${PORT}`, site_name: '手机上点得到', history_days: 2 })
    if (path === '/api/nodes') return json({ nodes: [node] })
    if (path.endsWith('/config')) return json({ cardStyle: 'compact' })
    if (path.includes('/metrics')) return json({ metrics: [], ping: [], probes: {}, loss: {} })
    return json({})
  }
  const file = join('dist', normalize(path === '/' ? '/index.html' : path).replace(/^(\\.[/\\\\])+/, ''))
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' })
    return res.end(readFileSync('dist/index.html'))
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const CHROME = findChrome()
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
  '--no-first-run', '--disable-gpu', '--no-proxy-server', `--user-data-dir=${join(tmpdir(), `mobile${CDP_PORT}`)}`,
  '--no-sandbox', 'about:blank'], { stdio: 'ignore' })
let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch { /* 等 chrome 起来 */ }
  if (!wsUrl) await sleep(250)
}
if (!wsUrl) throw new Error('Chrome 没起来')

const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
}
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq
  pending.set(id, resolve)
  ws.send(JSON.stringify({ id, method, params }))
})
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''))
  return r.result?.result?.value
}

let failed = 0
const rows = []
const check = (ok, what, got) => {
  rows.push({ ok, what, got })
  if (!ok) { failed++; console.error(`FAIL ${what}${got === undefined ? '' : `（${got}）`}`) }
  else console.log(`PASS ${what}${got === undefined ? '' : `（${got}）`}`)
}

async function goto(url) {
  await send('Page.navigate', { url })
  await sleep(900)
  for (let i = 0; i < 40; i++) {
    const ready = await evalJs('document.readyState')
    if (ready === 'complete') break
    await sleep(150)
  }
  await sleep(400)
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  // ---------- ① 390 宽 + 4 枚量程：完整详情不许折行 ----------
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await goto(`http://127.0.0.1:${PORT}/`)
  await evalJs("localStorage.setItem('rakugaki:card_style','compact')")
  await goto(`http://127.0.0.1:${PORT}/`)
  await sleep(800)
  await evalJs("(() => { const b = document.querySelector('tbody tr button'); b?.click(); return !!b })()")
  await sleep(1800)

  const detail390 = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('完整详情'))
    if (!btn) return { missing: true }
    const r = btn.getBoundingClientRect()
    const cs = getComputedStyle(btn)
    return {
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      lines: Math.round(r.height / parseFloat(cs.lineHeight)),
      nowrap: cs.whiteSpace,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })()`)
  if (detail390.missing) {
    check(false, '390 宽：紧凑档展开行里找得到「完整详情」', '找不到 —— 夹具或版式变了')
  } else {
    check(detail390.lines === 1, '390 宽：「完整详情 ›」只占一行（不许被挤成竖排）', `${detail390.w}×${detail390.h} / ${detail390.lines} 行`)
    check(detail390.nowrap === 'nowrap', '390 宽：按钮是 nowrap（根因，不是结果）', detail390.nowrap)
    check(detail390.overflow <= 0, '390 宽：页面没有横向溢出', `${detail390.overflow}px`)
  }

  // 360 / 320 同样不许折（更窄的机型）：只量按钮行数，不重复整轮
  for (const w of [360, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: true })
    await sleep(500)
    const m = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('完整详情'))
      if (!btn) return { missing: true }
      const r = btn.getBoundingClientRect()
      return { lines: Math.round(r.height / parseFloat(getComputedStyle(btn).lineHeight)), w: +r.width.toFixed(1) }
    })()`)
    check(!m.missing && m.lines === 1, `${w} 宽：「完整详情 ›」也只占一行`, m.missing ? '找不到按钮' : `${m.w}px / ${m.lines} 行`)
  }

  // ---------- ② 地球针的屏幕像素直径 ----------
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await goto(`http://127.0.0.1:${PORT}/`)
  await sleep(1400)
  const pins390 = await evalJs(`(() => {
    const hits = [...document.querySelectorAll('.globe-atlas circle.hit')]
    if (!hits.length) return { missing: true }
    const sizes = hits.map((c) => { const b = c.getBoundingClientRect(); return +Math.min(b.width, b.height).toFixed(1) })
    return { n: sizes.length, min: Math.min(...sizes), first: sizes.slice(0, 3) }
  })()`)
  if (pins390.missing) {
    check(false, '390 宽：地球上有命中圆', '一个都没有 —— 夹具或地球没渲染')
  } else {
    check(pins390.min >= 24, '390 宽：地球针的命中区 ≥ 24px（WCAG 2.5.8）', `${pins390.n} 枚，最小 ${pins390.min}px`)
  }

  // 1440 宽：不许因为这条修复变大（桌面本来就够）
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await sleep(900)
  const pins1440 = await evalJs(`(() => {
    const hits = [...document.querySelectorAll('.globe-atlas circle.hit')]
    if (!hits.length) return { missing: true }
    const sizes = hits.map((c) => { const b = c.getBoundingClientRect(); return +Math.min(b.width, b.height).toFixed(1) })
    return { n: sizes.length, min: Math.min(...sizes) }
  })()`)
  if (!pins1440.missing) {
    check(pins1440.min >= 24, '1440 宽：地球针的命中区也 ≥ 24px', `${pins1440.n} 枚，最小 ${pins1440.min}px`)
  }
} finally {
  try { ws.close() } catch { /* ignore */ }
  chrome.kill()
  server.close()
}

console.log(`\n结果: PASS ${rows.filter((r) => r.ok).length} / FAIL ${failed}`)
process.exit(failed ? 1 : 0)
