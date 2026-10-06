// 现网验收「卡片形态的出厂默认档」：全新 profile 打开真站，分三趟测同一份线上产物——
//   ① 把主题设置接口打桩成 `{}`（= 从没保存过这一格的站）→ 渲染的必须是**出厂默认档**的形状
//      （现为简约：每张卡片底部一根 `data-net="row"` 的网络行、没有 `data-net="grid"` 的四格）；
//   ② 真配置（访客现在看到的样子）→ 也应落在同一档上；
//   ③ 对照组：打桩成 `{"cardStyle":"classic"}` → 必须变成 2×2 四格。
// ③ 才是这脚本的关键：它证明拦截真的生效、渲染真的跟着配置走，于是 ① 的结论才不是「反正都一样」。
// 三档都顺带断「不发延迟（`/api/nodes/<id>/metrics`）请求」。
//
// 为什么不能只比线上文件哈希：哈希只能证明「伺服的就是我构建的那块」，
// 证明不了「那块在浏览器里真的渲染成默认档」——默认值是在代码与 theme.json 两处表达的。
//
// 用法：node tools/verify_live_default.mjs <站点URL> [期望的形态值，默认 plain]
// 站点在 CDN 后面时浏览器要走本机代理（本机策略决定），所以脚本不传 --proxy-server，随策略走。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const SITE = (process.argv[2] || '').replace(/\/$/, '')
if (!SITE) { console.error('用法：node tools/verify_live_default.mjs <站点URL> [期望的形态值]'); process.exit(2) }
const WANT = process.argv[3] || 'plain'
const ROW_STYLES = ['plain', 'latency'] // 底部「一行两段」的那两档；classic / detailed / compact 都不是
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p)) || 'chrome'
const PORT = 9800 + Math.floor(Math.random() * 90)

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--disable-background-timer-throttling',
  '--window-size=1280,900', '--user-data-dir=' + (process.env.TEMP || '/tmp') + '/livedef-' + Date.now(), 'about:blank'], { stdio: 'ignore' })

let wsUrl = null
for (let i = 0; i < 80 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl } catch {}
  if (!wsUrl) await sleep(250)
}
if (!wsUrl) { console.error('Chrome 没起来'); chrome.kill(); process.exit(2) }
const ws = new WebSocket(wsUrl)
await new Promise((r) => { ws.onopen = r })
let id = 0; const pend = new Map()
let stubBody = null              // null = 不打桩，用服务器上那份配置
let configHits = 0; const metricHits = []
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return }
  if (m.method === 'Fetch.requestPaused') {
    const { requestId } = m.params
    // 命中次数统一由下面的 Network.requestWillBeSent 记（这里再记一次会翻倍）。
    send('Fetch.fulfillRequest', { requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(stubBody || '{}').toString('base64') })
    return
  }
  if (m.method === 'Network.requestWillBeSent') {
    const u = m.params.request.url
    if (/\/api\/themes\/[^/]+\/config/.test(u)) configHits++
    if (/\/api\/nodes\/[^/]+\/metrics/.test(u)) metricHits.push(u)
  }
}
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value
let pass = 0, fail = 0
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`); if (ok) pass++; else fail++ }

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

const PROBE = `JSON.stringify((() => {
  const cards = [...document.querySelectorAll('[data-slot="card"]')].filter((c) => /CPU/.test(c.innerText))
  return {
    cards: cards.length,
    netRow: document.querySelectorAll('[data-net="row"]').length,
    netGrid: document.querySelectorAll('[data-net="grid"]').length,
    infoBox: document.querySelectorAll('[data-slot="card"] [data-slot="card"]').length,
    text: cards[0] ? cards[0].innerText.replace(/\\n/g, ' | ') : '',
  }
})())`

async function load(body, tag) {
  stubBody = body
  configHits = 0; metricHits.length = 0
  if (body) await send('Fetch.enable', { patterns: [{ urlPattern: '*api/themes/*/config*', requestStage: 'Request' }] })
  else await send('Fetch.disable')
  await send('Page.navigate', { url: `${SITE}/?probe=${tag}&t=${Date.now()}` })
  let dom = null
  for (let i = 0; i < 80; i++) {
    await sleep(300)
    try { dom = JSON.parse(await js(PROBE)) } catch { dom = null }
    if (dom && dom.cards > 0 && dom.netRow + dom.netGrid > 0) break
  }
  await sleep(1500) // 让延迟请求（若有）落地
  return { dom, hits: configHits, metric: metricHits.length }
}

// 「一行两段」还是「2×2 四格」：按锚点数与卡片数对齐来判，对不上就是形状变了（不是这一档）。
const shapeOf = (dom) => dom.netRow === dom.cards && dom.netGrid === 0 ? 'row'
  : dom.netGrid === dom.cards && dom.netRow === 0 ? 'grid'
    : `别的形状（行 ${dom.netRow} / 格 ${dom.netGrid} / 卡 ${dom.cards}）`

const PASSES = [
  { body: '{}', tag: 'empty', label: '打桩成 {}（从没保存过这一格的站）', want: WANT, stub: true },
  { body: null, tag: 'real', label: '真配置（访客现在看到的样子）', want: WANT, stub: false },
  { body: '{"cardStyle":"classic"}', tag: 'control', label: '对照组：打桩成 classic', want: 'classic', stub: true },
]

for (const p of PASSES) {
  const { dom, hits, metric } = await load(p.body, p.tag)
  console.log(`\n—— ${p.label}`)
  if (!dom || dom.cards === 0) { check(`${p.label}：页面渲染出了卡片`, false, JSON.stringify(dom)); continue }
  console.log(`   卡片 ${dom.cards} 张 / 网络行 ${dom.netRow} / 四格 ${dom.netGrid} / 读数盒 ${dom.infoBox} / 延迟请求 ${metric} / 设置请求 ${hits}`)
  console.log(`   第一张卡片的文本：${dom.text.slice(0, 110)}`)
  const got = shapeOf(dom)
  const wantShape = ROW_STYLES.includes(p.want) ? 'row' : 'grid'
  check(`${p.label}：渲染成「${p.want}」的形状（期望 ${wantShape}）`, got === wantShape, `实测 ${got}`)
  check(`${p.label}：这一档不发延迟请求`, metric === 0, `实测 ${metric} 次`)
  if (p.stub) check(`${p.label}：打桩真的命中了主题设置接口（否则测的是服务器上那份配置）`, hits === 1, `命中 ${hits} 次`)
}
console.log(`\n结果: PASS ${pass} / FAIL ${fail}`)
ws.close(); chrome.kill()
process.exit(fail ? 1 : 0)
