// 键盘与动效偏好的一组回归（2026-11-23 实测出来的四条）。
//
//   ① 卡片形态菜单：**第一次**打开焦点就要落进菜单（原来首帧 portal 未挂、`items()` 为空，
//      `start?.focus()` 静默落空，键盘用户必须关掉再开一次才有效）。
//   ② 在菜单里按 Esc：焦点必须回到触发按钮（原来两个 document keydown 抢着收菜单，
//      第一个把菜单卸掉、第二个的 `focus()` 落空，真机实测 active=BODY）。
//   ③ `prefers-reduced-motion: reduce` 下 `.sk-chip:hover` / `.sk-check:hover` 不许再转
//      （原来的 @media 块在它们之前，同特异性后者胜）。
//   ④ 延迟图上的 Ctrl+滚轮属于浏览器缩放，图表不许 preventDefault；普通滚轮仍要拦（页面不跟着滚）。
//
// 用法：cd <repo> && node tools/verify_keyboard_and_motion.mjs
import { spawn } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { assertDistFresh } from "./_dist-fresh.mjs"
import { findChrome } from "./_chrome.mjs"
assertDistFresh()

const PORT = Number(process.env.KB_PORT || 5291)
const CDP_PORT = PORT + 4000
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' }

/** 两台机器：一台在线带指标（详情页有延迟图），一台离线。 */
const nodes = [
  {
    id: 1, name: '键盘一号', sort: 1, public: true, online: true, country: 'JP', group: '东京',
    last_seen: Math.floor(Date.now() / 1000), last_seen_ago: 2,
    metrics: {
      uptime: 86400, cpu: 21, load: [0.4, 0.5, 0.6], mem_total: 2147483648, mem_used: 1073741824,
      swap_total: 0, swap_used: 0, disk_total: 42949672960, disk_used: 21474836480,
      net_rx: 2048, net_tx: 4096, total_rx: 1000, total_tx: 2000, month_rx: 3000, month_tx: 4000,
      tcp: 12, udp: 3, procs: 88,
    },
    os: 'Debian', kernel: '6.1', arch: 'x86_64', virt: 'kvm', cpu_name: 'EPYC', cpu_cores: 4,
    mem_total: 2147483648, swap_total: 0, disk_total: 42949672960, agent_version: '1.4',
    price: 0, currency: '', billing_cycle: '', expires_at: null, expires_in: null,
    traffic_limit: 0, traffic_mode: 'sum', traffic_reset_day: 1, total_rx: 0, total_tx: 0,
    month_rx: 0, month_tx: 0, month_start: '', day_rx: 0, day_tx: 0, public_remark: '',
  },
  {
    id: 2, name: '键盘二号', sort: 2, public: true, online: false, country: 'SG', group: '新加坡',
    last_seen: 0, last_seen_ago: 7200, metrics: null,
    os: 'Ubuntu', kernel: '6.1', arch: 'x86_64', virt: 'kvm', cpu_name: 'EPYC', cpu_cores: 2,
    mem_total: 1073741824, swap_total: 0, disk_total: 21474836480, agent_version: '1.4',
    price: 0, currency: '', billing_cycle: '', expires_at: null, expires_in: null,
    traffic_limit: 0, traffic_mode: 'sum', traffic_reset_day: 1, total_rx: 0, total_tx: 0,
    month_rx: 0, month_tx: 0, month_start: '', day_rx: 0, day_tx: 0, public_remark: '',
  },
]

/** 延迟序列：24 个点，够画图也够滚轮缩放（量不够时 zoomCap 会挡住缩放，测不出来）。
 *  ★形状要对齐 hub：`ping` 是「每条线路 { id, name, points[{time,value}] }」的数组，
 *  不是一整条 `series`。给错了图表不会挂载 `[data-chart]`，护栏会误判成「没有图」。 */
const pts = Array.from({ length: 24 }, (_, i) => ({
  time: Math.floor(Date.now() / 1000) - (24 - i) * 3600,
  value: 20 + ((i * 7) % 30),
}))
const metricsBody = {
  metrics: [],
  ping: [{ id: 11, name: '电信', points: pts }],
  probes: { 11: { name: '电信' } },
  loss: { 11: 0 },
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const json = (b) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(b)) }
  if (path.startsWith('/api/')) {
    if (path === '/api/me') return json({ authed: false, github: false, public_page: true, site: `http://127.0.0.1:${PORT}`, site_name: '键盘与动效', history_days: 30 })
    if (path === '/api/nodes') return json({ nodes })
    if (path.endsWith('/config')) return json({ cardStyle: 'latency' })
    if (path.includes('/metrics')) return json(metricsBody)
    return json({})
  }
  const file = join('dist', normalize(path === '/' ? '/index.html' : path).replace(/^(\\.[/\\\\])+/, ''))
  const fs = { existsSync: (p) => { try { statSync(p); return true } catch { return false } } }
  if (!fs.existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' })
    return res.end(readFileSync('dist/index.html'))
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

const CHROME = findChrome()
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*',
  '--no-first-run', '--disable-gpu', '--no-proxy-server', `--user-data-dir=${join(tmpdir(), `kb${CDP_PORT}`)}`,
  '--no-sandbox', 'about:blank'], { stdio: 'ignore' })
let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch { /* 等 */ }
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
const key = (type, k, code, windowsVirtualKeyCode, text) => send('Input.dispatchKeyEvent', {
  type, key: k, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode,
  ...(text ? { text, unmodifiedText: text } : {}),
})
// ★Enter 必须带 text:'\r' —— CDP 不给 text 的话浏览器不会把它当「激活键」，按钮的默认动作
//   （`<button>` 的 Enter → click）不会发生，菜单打不开（同一段代码在真键盘下是好的）。
const press = async (k, code, vk, text) => { await key('keyDown', k, code, vk, text); await key('keyUp', k, code, vk, text) }
const pressEnter = () => press('Enter', 'Enter', 13, '\r')
const pressEsc = () => press('Escape', 'Escape', 27)

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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(1600)
  await evalJs("document.querySelector('[data-node-card]') ? 'ok' : 'wait'")

  // ---------- ① 首次打开焦点进菜单 ----------
  // 每次都重新加载：第一次打开最容易复现「spot 未就绪」那条。
  for (let round = 1; round <= 2; round++) {
    if (round > 1) {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
      await sleep(1400)
    }
    await evalJs("document.querySelector('.card-style-toggle').focus()")
    await pressEnter()
    await sleep(600)
    const opened = await evalJs(`(() => {
      const a = document.activeElement
      return { menu: !!document.querySelector('[role=menu]'), inMenu: !!a?.closest?.('[role=menu]'),
               label: a?.getAttribute?.('aria-label') || (a?.textContent || '').trim().slice(0, 8) }
    })()`)
    check(opened.menu, `第 ${round} 轮：Enter 打开菜单`, opened.menu ? '开' : '没开')
    check(opened.inMenu, `第 ${round} 轮：打开后焦点落在菜单选项上`, `${opened.label}`)

    // 方向键在菜单里移动
    await press('ArrowDown', 'ArrowDown', 40)
    await sleep(200)
    const moved = await evalJs("(() => { const a = document.activeElement; return { inMenu: !!a?.closest?.('[role=menu]'), label: (a?.textContent || '').trim().slice(0, 8) } })()")
    check(moved.inMenu, `第 ${round} 轮：↓ 之后焦点仍在菜单里`, moved.label)

    // ---------- ② Esc 把焦点还给触发按钮 ----------
    await pressEsc()
    await sleep(500)
    const closed = await evalJs(`(() => {
      const a = document.activeElement
      return { menu: !!document.querySelector('[role=menu]'),
               tag: a?.tagName,
               label: a?.getAttribute?.('aria-label') || (a?.textContent || '').trim().slice(0, 8) }
    })()`)
    check(!closed.menu, `第 ${round} 轮：Esc 收起菜单`, closed.menu ? '还开着' : '收了')
    check(closed.label === '卡片形态', `第 ${round} 轮：Esc 后焦点回到「卡片形态」按钮`, `${closed.tag}/${closed.label}`)
  }

  // ---------- ③ reduced-motion 下不许转 ----------
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await sleep(300)
  const motion = await evalJs(`(() => {
    const rm = matchMedia('(prefers-reduced-motion: reduce)').matches
    // 用真实的 :hover 样式来源判定：遍历样式表，找最后一条命中 .sk-chip:hover 的 transform
    const seen = []
    for (const ss of document.styleSheets) {
      let rules = []
      try { rules = [...ss.cssRules] } catch { continue }
      const walk = (list, media) => {
        for (const r of list) {
          if (r.media) { walk([...r.cssRules], r.conditionText || 'media'); continue }
          const sel = r.selectorText
          if (!sel) continue
          if (/\\.sk-(chip|check):hover/.test(sel)) seen.push({ media: media || 'screen', sel, transform: r.style.transform || '' })
        }
      }
      walk([...rules], '')
    }
    // 最后一条媒体查询里写着 transform:none 的算赢（同特异性后者胜）
    const last = seen[seen.length - 1]
    return { rm, rules: seen, winner: last }
  })()`)
  check(motion.rm, '③ 浏览器确实进入 reduced-motion 模式')
  // 判据：.sk-chip:hover / .sk-check:hover 的**最终**规则必须是 reduce 媒体查询里的 transform:none
  const chipLast = [...(motion.rules || [])].reverse().find((r) => r.sel.includes('.sk-chip:hover') || r.sel.includes('.sk-check:hover'))
  check(
    !!chipLast && /reduce/.test(chipLast.media) && chipLast.transform === 'none',
    '③ reduced-motion 时 .sk-chip/.sk-check 的 hover 变换被压成 none（层叠顺序对）',
    chipLast ? `${chipLast.media} / ${chipLast.transform || '(空)'}` : '没找到规则',
  )

  // 恢复
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
  await sleep(200)

  // ---------- ④ Ctrl+滚轮 vs 普通滚轮 ----------
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/node/1?tab=latency` })
  await sleep(2600)
  // 延迟图只在「网络延迟」页签挂载：先在页面里点一次那个页签（路由参数之外的第二道闸）。
  await evalJs(`(() => {
    const tab = [...document.querySelectorAll('button,[role=tab]')].find((b) => (b.textContent || '').trim() === '网络延迟')
    tab?.click()
    return !!tab
  })()`)
  await sleep(1800)
  const chart = await evalJs(`(() => {
    const c = document.querySelector('[data-chart]')
    if (!c) return { missing: true }
    const r = c.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })()`)
  if (chart.missing) {
    check(false, '④ 详情页有延迟图', '找不到 [data-chart]')
  } else {
    const prevented = await evalJs(`(() => {
      const c = document.querySelector('[data-chart]')
      const svg = c.querySelector('svg') || c
      const r = c.getBoundingClientRect()
      const mk = (ctrl) => {
        const ev = new WheelEvent('wheel', { deltaY: -120, ctrlKey: ctrl, bubbles: true, cancelable: true,
          clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })
        svg.dispatchEvent(ev)
        return ev.defaultPrevented
      }
      return { ctrl: mk(true), plain: mk(false) }
    })()`)
    check(prevented.ctrl === false, '④ Ctrl+滚轮不被图表吞掉（浏览器缩放要能用）', prevented.ctrl ? '被 preventDefault 了' : '放行')
    check(prevented.plain === true, '④ 普通滚轮仍被图表接管（页面不跟着滚）', prevented.plain ? '拦住' : '没拦')
  }
} finally {
  try { ws.close() } catch { /* ignore */ }
  chrome.kill()
  server.close()
}

console.log(`\n结果: PASS ${rows.filter((r) => r.ok).length} / FAIL ${failed}`)
process.exit(failed ? 1 : 0)
