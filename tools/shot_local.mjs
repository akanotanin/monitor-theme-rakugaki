// 一条命令拍完本地这一版：起静态伺服（静态走本机 dist/，/api/* 转真 hub）→ 跑取景器 → 收伺服。
//
// 用法：
//   node tools/shot_local.mjs <上游hub> [输出目录] [config JSON]
//   node tools/shot_local.mjs http://127.0.0.1:28081 shots/rakugaki '{"listTop":"both"}'
//
// 为什么要有它：本机 Hermes 的后台进程起不了 node（任何 node 命令都会立刻退出），所以
// 「先起服务器、再拍、最后收掉」不能分三条命令跑，只能由一个前台脚本把服务器 spawn 成
// 自己的子进程——见 tools/serve.mjs 顶部那段说明。
//
// 上游 hub 只监听回环，所以先在别处起隧道：
//   ssh -f -N -L 28081:127.0.0.1:28080 <hub 所在机器>
//   （ssh -f 活得过 shell 回收；关它：ps -W | grep ssh 找 PID，再 kill）
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const UPSTREAM = (process.argv[2] || '').replace(/\/$/, '')
if (!UPSTREAM) { console.error('用法：node tools/shot_local.mjs <上游hub> [输出目录] [config JSON]'); process.exit(2) }
const OUT = process.argv[3] || 'shots/local'
const CONFIG = process.argv[4] || ''
const PORT = 5300 + Math.floor(Math.random() * 300)

// 上游先探一下：隧道没起来的话，后面每一张图都会拍到「加载失败」，早失败早报清楚。
try {
  const probe = await fetch(`${UPSTREAM}/api/nodes`, { signal: AbortSignal.timeout(8000) })
  const body = await probe.json()
  console.log(`上游 OK：${UPSTREAM}/api/nodes → ${body.nodes?.length ?? '?'} 个节点`)
} catch (e) {
  console.error(`上游取不到（${UPSTREAM}）：${e.message}\n  先检查隧道：ssh -f -N -L <本地端口>:127.0.0.1:28080 <hub 所在机器>`)
  process.exit(3)
}

const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT), CONFIG, '', UPSTREAM], { stdio: 'inherit' })
let up = false
for (let i = 0; i < 40 && !up; i++) {
  await sleep(250)
  try { up = (await fetch(`http://127.0.0.1:${PORT}/api/nodes`)).ok } catch { /* 等它 listen */ }
}
if (!up) { server.kill(); throw new Error('本地伺服没起来') }

const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => existsSync(p)) || 'chrome'
const run = (script, args) => new Promise((done) => {
  const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit' })
  child.on('exit', (code) => done(code ?? 1))
})

// 环境变量：SKIP_SHOTS=1 只跑预览图那一档；ONLY=<片段> 只拍名字里含它的机位（调一张图时省时间）。
// --run <脚本> [参数…]：把任意一个只吃 baseUrl 的护栏脚本也挂到这个本机伺服上跑
// （护栏自己不启服务器，指到隧道就等于在验那台机器上装的主题，而不是这一版构建）。
const runIdx = process.argv.indexOf('--run')
if (runIdx > 0) {
  const script = process.argv[runIdx + 1]
  const extra = process.argv.slice(runIdx + 2)
  // 第 7 个参数起才是护栏自己的参数：约定把 baseUrl 放在第一位，其余原样往后传。
  const code = await run(script, [`http://127.0.0.1:${PORT}`, ...extra])
  server.kill()
  process.exit(code)
}
let rc = 0
if (!process.env.SKIP_SHOTS) {
  const only = process.env.ONLY ? [process.env.ONLY] : []
  rc = await run('tools/shots.mjs', [`http://127.0.0.1:${PORT}`, OUT, ...only])
  console.log(`取景器退出码 ${rc}（图在 ${OUT}/）`)
}

// 第四个参数带 --preview：接着把面板卡片上那张 preview.png 与 README 里那四张形态图拍掉。
// 机位沿用本主题上一版：1440×810 @2x（16:9，面板里是 object-cover object-top）。
// 形态与列表页顶部那两行由 shot_preview 在浏览器层就地覆写（线上/桩里的站点配置一个字不动）。
if (process.argv.includes('--preview')) {
  const PREVIEWS = [
    // 面板卡片上那张（16:9、object-cover object-top，缩到约 300px 宽）：选「经典 + 分组 +
    // 概览」——八台机器两行都完整落在画面里。延迟/详细那两档的卡片更高，一行就撑满 810，
    // 第二行会被从卡片中间裁断；缩略图下那半截反而像没取好景。
    ['preview.png', 'classic', { listTop: 'both' }],
    ['preview-classic.png', 'classic', { listTop: 'summary' }],
    ['preview-latency.png', 'latency', { listTop: 'summary' }],
    ['preview-detailed.png', 'detailed', { listTop: 'summary' }],
    ['preview-compact.png', 'compact', { listTop: 'summary' }],
  ]
  for (const [out, style, extra] of PREVIEWS) {
    const code = await run('tools/shot_preview.mjs',
      [`http://127.0.0.1:${PORT}`, out, '1440', '810', '2', style, JSON.stringify(extra)])
    console.log(`  ${out} → 退出码 ${code}`)
  }
}
server.kill()
process.exit(rc)
