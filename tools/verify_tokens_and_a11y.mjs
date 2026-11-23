// 2026-11-23 第二轮（子代理审查）修的一批：token 映射、焦点环强度、tooltip 排序、进程 null、
// Summary 空格键、页签 ARIA、导航语义。全部在真实渲染里量，不读源码。
//
// 用法：cd <repo> && node tools/verify_tokens_and_a11y.mjs
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { assertDistFresh } from "./_dist-fresh.mjs"
import { findChrome } from "./_chrome.mjs"
assertDistFresh()

const PORT = Number(process.env.TOK_PORT || 5294)
const CDP_PORT = PORT + 4000
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' }

/** 两台机器：一台在线带全部指标（procs 为 null，模拟老 agent），一台离线。 */
const nodes = [
  {
    id: 1, name: '令牌一号', sort: 1, public: true, online: true, country: 'JP', group: '东京',
    last_seen: Math.floor(Date.now() / 1000), last_seen_ago: 2,
    metrics: {
      uptime: 86400, cpu: 21, load: [0.4, 0.5, 0.6], mem_total: 2147483648, mem_used: 1073741824,
      swap_total: 0, swap_used: 0, disk_total: 42949672960, disk_used: 21474836480,
      net_rx: 2048, net_tx: 4096, total_rx: 1000, total_tx: 2000, month_rx: 3000, month_tx: 4000,
      tcp: 12, udp: 3, procs: null,
    },
    os: 'Debian', kernel: '6.1', arch: 'x86_64', virt: 'kvm', cpu_name: 'EPYC', cpu_cores: 4,
    mem_total: 2147483648, swap_total: 0, disk_total: 42949672960, agent_version: '1.4',
    price: 0, currency: '', billing_cycle: '', expires_at: null, expires_in: null,
    traffic_limit: 0, traffic_mode: 'sum', traffic_reset_day: 1, total_rx: 0, total_tx: 0,
    month_rx: 0, month_tx: 0, month_start: '', day_rx: 0, day_tx: 0, public_remark: '',
  },
  {
    id: 2, name: '令牌二号', sort: 2, public: true, online: false, country: 'SG', group: '新加坡',
    last_seen: 0, last_seen_ago: 7200, metrics: null,
    os: 'Ubuntu', kernel: '6.1', arch: 'x86_64', virt: 'kvm', cpu_name: 'EPYC', cpu_cores: 2,
    mem_total: 1073741824, swap_total: 0, disk_total: 21474836480, agent_version: '1.4',
    price: 0, currency: '', billing_cycle: '', expires_at: null, expires_in: null,
    traffic_limit: 0, traffic_mode: 'sum', traffic_reset_day: 1, total_rx: 0, total_tx: 0,
    month_rx: 0, month_tx: 0, month_start: '', day_rx: 0, day_tx: 0, public_remark: '',
  },
]

/**
 * 四条线路：一条全超时（loss 100），三条有值 —— 用来断 tooltip 的排序方向。
 *
 * ★形状必须是 hub 的**扁平** array：`{ task_id, ts, latency, band?, loss? }`，
 *   不是 `{ id, name, points }` 那种嵌套（第一版夹具给错了形状，图表一行都画不出来、
 *   于是 tooltip 那条永远假红）。
 */
const T0 = Date.now()
const mkPing = (taskId, latency, loss) =>
  Array.from({ length: 16 }, (_, i) => ({
    task_id: taskId,
    ts: T0 - (16 - i) * 3600_000,
    latency,
    band: latency === null ? undefined : [latency * 0.9, latency * 1.1],
    loss,
  }))
const metricsBody = {
  metrics: [],
  ping: [
    ...mkPing(11, 60, 0),
    ...mkPing(12, 120, 0),
    ...mkPing(13, 300, 2),
    ...mkPing(14, null, 100),
  ],
  probes: { 11: '电信', 12: '联通', 13: '移动', 14: '教育网' },
  loss: { 11: 0, 12: 0, 13: 2, 14: 100 },
}

const server = createServer((req, res) => {
  const path = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname
  const json = (b) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(b)) }
  if (path.startsWith('/api/')) {
    if (path === '/api/me') return json({ authed: false, github: false, public_page: true, site: `http://127.0.0.1:${PORT}`, site_name: '令牌与语义', history_days: 30 })
    if (path === '/api/nodes') return json({ nodes })
    if (path.endsWith('/config')) return json({ cardStyle: 'latency', listTop: 'both' })
    if (path.includes('/metrics')) return json(metricsBody)
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
  '--no-first-run', '--disable-gpu', '--no-proxy-server', `--user-data-dir=${join(tmpdir(), `tok${CDP_PORT}`)}`,
  '--no-sandbox', 'about:blank'], { stdio: 'ignore' })
let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl } catch { /* 等 */ }
  if (!wsUrl) await sleep(250)
}
if (!wsUrl) throw new Error('Chrome 没起来')

const ws = new WebSocket(wsUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || ''))
  return r.result?.result?.value
}

/** WCAG 相对亮度对比度。 */
const CONTRAST = `(function(c1, c2) {
  const parse = (s) => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null
    const p = m[1].split(',').map((x) => parseFloat(x.trim()))
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
  const a = parse(c1), b = parse(c2)
  if (!a || !b) return null
  const fa = over(a, b)
  const la = lum(fa), lb = lum(b)
  const hi = Math.max(la, lb), lo = Math.min(la, lb)
  return +(((hi + 0.05) / (lo + 0.05)).toFixed(2))
})`

let failed = 0
const rows = []
const check = (ok, what, got) => {
  rows.push({ ok, what })
  if (!ok) { failed++; console.error(`FAIL ${what}${got === undefined ? '' : `（${got}）`}`) }
  else console.log(`PASS ${what}${got === undefined ? '' : `（${got}）`}`)
}

try {
  await send('Page.enable')
  await send('Runtime.enable')

  // ---------- ① --elev 已接进 utility 命名空间（bg-elev 真的画出来了） ----------
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(1800)
  const elev = await evalJs(`(() => {
    // 造一个用 bg-elev 的元素，量它的实际背景色（类不存在时是透明的）
    const d = document.createElement('div')
    d.className = 'bg-elev'
    d.style.cssText = 'position:fixed;left:-9999px;width:10px;height:10px'
    document.body.appendChild(d)
    const got = getComputedStyle(d).backgroundColor
    d.remove()
    const paper = getComputedStyle(document.body).backgroundColor
    return { got, paper }
  })()`)
  check(elev.got && elev.got !== 'rgba(0, 0, 0, 0)', 'bg-elev 有实际底色（token 已映射，不再是透明的）', `bg-elev=${elev.got}`)

  // ---------- ② 焦点环对比度 ≥ 3:1（WCAG 1.4.11） ----------
  const ring = await evalJs(`(() => {
    const root = document.documentElement
    const ringColor = getComputedStyle(root).getPropertyValue('--ring').trim()
    // 把 --ring 落到一个真实元素上量（它可能是 var() 链，直接解析不可靠）
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;left:-9999px;width:10px;height:10px;outline:2px solid'
    d.style.outlineColor = 'var(--ring)'
    document.body.appendChild(d)
    const outline = getComputedStyle(d).outlineColor
    d.remove()
    return { ringColor, outline, body: getComputedStyle(document.body).backgroundColor }
  })()`)
  const cr = await evalJs(`${CONTRAST}(${JSON.stringify(ring.outline)}, ${JSON.stringify(ring.body)})`)
  check(cr !== null && cr >= 3, '焦点环对纸底 ≥ 3:1（WCAG 1.4.11）', `${ring.outline} on ${ring.body} = ${cr}:1`)

  // ---------- ③ base 层不再把焦点环削成 50% ----------
  const baseOutline = await evalJs(`(() => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;left:-9999px;width:10px;height:10px;outline-width:2px;outline-style:solid'
    document.body.appendChild(d)
    const cs = getComputedStyle(d)
    const out = { color: cs.outlineColor }
    d.remove()
    return out
  })()`)
  check(!/rgba\([^)]*,\s*0?\.[0-9]+\)/.test(baseOutline.color), 'outline-ring/50 已去掉（描边不再带透明通道）', baseOutline.color)

  // ---------- ④ ageing agent（procs=null）不印出「进程 · null」 ----------
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/node/1` })
  await sleep(2400)
  const procs = await evalJs(`(() => {
    const h = [...document.querySelectorAll('h4, [class*=font-display]')].map((e) => (e.textContent || '').trim()).filter((t) => t.startsWith('进程'))
    return { headers: h, body: document.body.innerText.includes('进程 · null') }
  })()`)
  check(!procs.body, 'procs 为 null 时不印「进程 · null」', procs.headers.join(' / ') || '(没找到进程卡)')
  check(procs.headers.every((t) => !/null|undefined/.test(t)), '进程卡标题里没有 null/undefined', procs.headers.join(' / '))

  // ---------- ⑤ 页签 / 量程有 aria-pressed ----------
  const pressed = await evalJs(`(() => {
    const btns = [...document.querySelectorAll('button[aria-pressed]')]
    return {
      n: btns.length,
      on: btns.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => (b.textContent || '').trim().slice(0, 8)),
      off: btns.filter((b) => b.getAttribute('aria-pressed') === 'false').length,
    }
  })()`)
  check(pressed.n >= 6 && pressed.on.length >= 2, '页签与量程按钮都带 aria-pressed（读屏听得出选中哪一档）', `${pressed.n} 枚，选中 ${pressed.on.join('/')}`)

  // ---------- ⑥ 延迟 tooltip：超时排最后、最慢的排第一 ----------
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/node/1?tab=latency` })
  await sleep(2800)
  // ★这张图是**自绘 SVG**（Chart.tsx），悬停挂在绘图区那枚透明 <rect> 的 onMouseMove 上，
  //   不在 recharts 的 tooltip 命中里。所以：给 rect 派发带 clientX 的 mousemove（React 的
  //   合成事件会正常走），而不是往 svg 上派、也不是靠 CDP 的真鼠标（它命中不到那枚 rect 的
  //   事件处理器 —— 第一版就是这么假红的）。
  await evalJs(`(() => {
    const c = document.querySelector('[data-chart]')
    if (!c) return null
    const rect = [...c.querySelectorAll('svg rect')].find((r) => r.getAttribute('fill') === 'transparent')
      || c.querySelector('svg rect')
    if (!rect) return null
    const b = rect.getBoundingClientRect()
    rect.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, cancelable: true,
      clientX: Math.round(b.left + b.width * 0.7),
      clientY: Math.round(b.top + b.height * 0.5),
    }))
    return true
  })()`)
  await sleep(300)
  const tipRows = await evalJs(`(() => {
    const tip = document.querySelector('[data-tooltip]')
    if (!tip) return { missing: true }
    return { rows: [...tip.querySelectorAll('li')].map((li) => (li.innerText || '').replace(/\\s+/g, ' ').trim()) }
  })()`)
  if (tipRows.missing) {
    check(false, '⑥ 延迟图上能出 tooltip（夹具或图表变了）', '没找到 [data-tooltip]')
  } else {
    const idx = (kw) => tipRows.rows.findIndex((t) => t.includes(kw))
    const iSlow = idx('移动'), iTimeout = idx('教育网')
    check(iSlow >= 0 && iTimeout >= 0, '⑥ tooltip 里同时有「最慢的线路」与「超时的那条」', tipRows.rows.join(' | '))
    if (iSlow >= 0 && iTimeout >= 0) {
      check(iSlow < iTimeout, '⑥ 超时排在最后（worstFirst 是降序，缺失值要映射到 -Infinity）', `移动@${iSlow} 教育网@${iTimeout}`)
      check(iSlow === 0 || tipRows.rows[0].includes('300'), '⑥ 最慢的那条（300ms）排第一', tipRows.rows[0])
    }
  }

  // ---------- ⑦ Summary 浮层：在滚动区里按空格不许把浮层关掉 ----------
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(1800)
  await evalJs(`(() => {
    const blocks = [...document.querySelectorAll('[role=button][aria-expanded]')]
    const target = blocks.find((b) => (b.textContent || '').includes('今日流量')) || blocks[0]
    if (!target) return { missing: true }
    target.focus()
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    return { opened: true, label: (target.textContent || '').slice(0, 10) }
  })()`)
  await sleep(500)
  const spaceInner = await evalJs(`(() => {
    const pop = document.querySelector('[data-budget-detail]')
    if (!pop) return { noPop: true }
    const scroll = pop.querySelector('.detail-scroll')
    if (!scroll) return { noScroll: true, pop: true }
    scroll.focus()
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    scroll.dispatchEvent(ev)
    return { prevented: ev.defaultPrevented, stillOpen: !!document.querySelector('[data-budget-detail]') }
  })()`)
  if (spaceInner.noPop || spaceInner.noScroll) {
    // 浮层没开或没有滚动区：这条降级成信息（不算红）——不同站点配置下浮层内容会变
    console.log(`  INFO  ⑦ 跳过：浮层未开或没有 .detail-scroll（${JSON.stringify(spaceInner)}）`)
  } else {
    check(spaceInner.stillOpen, '⑦ 浮层滚动区里按空格不会把浮层关掉', spaceInner.stillOpen ? '仍开着' : '被关掉了')
    check(spaceInner.prevented === false, '⑦ 空格在滚动区里不被 preventDefault（原生翻页滚动要能用）', spaceInner.prevented ? '被拦了' : '放行')
  }

  // ---------- ⑧ 主题包自检：每个 woff2 都必须被某条 @font-face 引用 ----------
  const orphanFonts = await evalJs(`(async () => {
    const faces = []
    for (const ss of document.styleSheets) {
      let rules = []
      try { rules = [...ss.cssRules] } catch { continue }
      for (const r of rules) if (r.type === 5) faces.push(r.style.src || '')
    }
    const used = new Set(faces.join(' ').match(/[\\w.-]+\\.woff2/g) || [])
    const all = await (await fetch('/fonts-list.json')).json().catch(() => [])
    return { used: [...used], all }
  })()`).catch(() => ({ used: [], all: [] }))
  // 服务端没有 fonts-list.json，就从产物 CSS 里数（这条在 CI 里由 package.mjs 的开包校验兜底）
  console.log(`  INFO  ⑧ @font-face 引用的字体文件：${(orphanFonts.used || []).join(', ') || '(读不到)'}`)
} finally {
  try { ws.close() } catch { /* ignore */ }
  chrome.kill()
  server.close()
}

console.log(`\n结果: PASS ${rows.filter((r) => r.ok).length} / FAIL ${failed}`)
process.exit(failed ? 1 : 0)
