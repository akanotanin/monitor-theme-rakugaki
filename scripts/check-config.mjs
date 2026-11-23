// theme.json 的 config 默认值，必须与 src/lib/site-settings.ts 的 DEFAULTS 逐项一致。
//
// 这两处是同一个开关的两半：面板按 theme.json 现画表单，页面按 DEFAULTS 兜底。
// 只改一处就是那种「后台显示开着、页面还是旧样子」的毛病，而且两边都不报错。
//
// 用法：node scripts/check-config.mjs（npm run check，打包脚本与 CI 都会调）
import { existsSync, readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('theme.json', 'utf8'))
const fields = (manifest.config || []).filter((entry) => entry.type !== 'title' && entry.key)
if (!fields.length) throw new Error('theme.json 的 config 里没有任何设置项')

const source = readFileSync('src/lib/site-settings.ts', 'utf8')
const block = source.match(/export const DEFAULTS[^=]*=\s*\{([\s\S]*?)\n\}/)
if (!block) throw new Error('src/lib/site-settings.ts 里找不到 DEFAULTS')
const declared = {}
for (const line of block[1].split('\n')) {
  const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*(.+?),?\s*$/)
  if (m) declared[m[1]] = m[2].replace(/,$/, '').trim()
}

const problems = []
for (const field of fields) {
  if (!(field.key in declared)) {
    problems.push(`${field.key}: theme.json 有、DEFAULTS 里没有`)
    continue
  }
  // 去掉引号后照字面比：布尔、数字、字符串三种默认值都够用，不做求值。
  const code = declared[field.key].replace(/^["'`]|["'`]$/g, '').trim()
  const json = String(field.default).trim()
  if (code !== json) problems.push(`${field.key}: theme.json 是 ${json}、DEFAULTS 是 ${code}`)
}
for (const key of Object.keys(declared)) {
  if (!fields.some((f) => f.key === key)) problems.push(`${key}: DEFAULTS 有、theme.json 里没有`)
}
if (problems.length) throw new Error(`设置项默认值两边不一致：\n  ${problems.join('\n  ')}`)
console.log(`设置项默认值一致：${fields.map((f) => `${f.key}=${f.default}`).join('、')}`)

// ★2026-11-23 补：**选项清单**也要对得上。原来只比默认值，于是
//   theme.json 里删掉 cardStyle 的 wide 一档（后台再也选不到宽卡）、
//   或塞一个 TS 联合类型里不存在的值（hologram），这个脚本都照样 exit 0。
// 判据：把 site-settings.ts 里 `name: "a" | "b" | ...` 与 `export type X = "a" | ...`
//   两种形状都收成「键 → 字面量集合」，再与 theme.json 各 select 的 options[].value 求对称差。
// ★按**行**收，别用贪婪组：6 个值的 `cardStyle:` 那行会被
//   截成前两个（实测只收到 classic|latency），后面 4 个全被误报成「theme.json 多出来的」。
const unions = {}
const uniLine = /^\s*(?:export\s+type\s+)?(\w+)\s*[=:]\s*((?:"[^"]+"\s*\|\s*)*"[^"]+")\s*$/
for (const line of source.split("\n")) {
  const m = line.match(uniLine)
  if (m && /^"[^"]*"(?:\s*\|\s*"[^"]*")+$/.test(m[2].trim())) {
    unions[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1])
  }
}

// theme.json 不知道 TS 的类型名，靠「哪个联合类型包含这个 key 的默认值」配型；
// 同名字段优先（cardStyle → ThemeConfig.cardStyle），否则取重叠最多的那一族。
const optionProblems = []
for (const field of fields) {
  if (field.type !== "select" || !Array.isArray(field.options)) continue
  const values = field.options.map((o) => o.value)
  const candidates = Object.entries(unions).filter(([, vals]) => vals.includes(field.default))
  const anchor = candidates.find(([name]) => name === field.key)
    ?? candidates.sort((a, b) => b[1].filter((v) => values.includes(v)).length - a[1].filter((v) => values.includes(v)).length)[0]
  if (!anchor) {
    optionProblems.push(`${field.key}: theme.json 的默认值 ${JSON.stringify(field.default)} 在 site-settings.ts 的任何联合类型里都找不到`)
    continue
  }
  const [typeName, typeVals] = anchor
  for (const v of values.filter((v) => !typeVals.includes(v))) optionProblems.push(`${field.key}: theme.json 有选项 ${JSON.stringify(v)}、${typeName} 里没有`)
  for (const v of typeVals.filter((v) => !values.includes(v))) optionProblems.push(`${field.key}: ${typeName} 有 ${JSON.stringify(v)}、theme.json 的选项里没有`)
}
if (optionProblems.length) throw new Error(`设置项选项清单两边不一致：\n  ${optionProblems.join('\n  ')}`)
console.log(`设置项选项清单一致：${fields.filter((f) => f.type === "select").map((f) => `${f.key}(${f.options.length})`).join('、')}`)

// 站名那个缓存键散在三处（App 一处、早跑脚本一处、index.html 的内联脚本一处）——它们必须逐字
// 一致。不一致的症状很阴：缓存有人写、没人读（或反过来），页面照常、后台照常，只是刷新时先闪
// 一次占位值，谁也不报错。这里一次比清，顺带保住那条早跑脚本没被删。
//
// ★ 站点图标那条缓存（`jikasei:site_icon`）1.25.0 起没了：图标改由 hub 1.4.0 的面板管，
//   主题侧只留 `public/favicon.svg` + `public/favicon.ico` + `public/apple-touch-icon.png` 三份兜底文件。
const CACHES = [
  { what: '站名', key: 'rakugaki:site_name', places: [
    ['src/App.tsx', /TITLE_CACHE_KEY\s*=\s*"([^"]+)"/g],
    ['public/title-probe.js', /var KEY\s*=\s*"([^"]+)"/g],
    // 只认 `rakugaki:` 前缀那一条：index.html 里还有首帧明暗那段读的 `theme`（见下一条）。
    ['index.html', /localStorage\.getItem\("(rakugaki:[^"]+)"\)/g],
  ] },
  // 明暗这一档同源两处：App 的 useTheme 读 / 写 / 删，index.html 的首帧脚本事先读一次。
  { what: '明暗', key: 'theme', places: [
    ['src/App.tsx', /localStorage\.getItem\("(theme)"\)/g],
    ['index.html', /localStorage\.getItem\("(theme)"\)/g],
  ] },
]
const bad = []
for (const cache of CACHES) {
  for (const [file, pattern] of cache.places) {
    const found = [...readFileSync(file, 'utf8').matchAll(pattern)].map((m) => m[1])
    if (!found.length) bad.push(`${cache.what}：${file} 里找不到缓存键（护栏的锚点没了，别当通过）`)
    for (const value of found) if (value !== cache.key) bad.push(`${cache.what}：${file} 里是 ${value}，应为 ${cache.key}`)
  }
}
const html = readFileSync('index.html', 'utf8')
// ★ 2026-10-09：探针改 async 后，写死的精确串 `<script src="/title-probe.js">` 就失配了——
//   这里匹配的是「整条标签、允许带属性」，并额外钉住 async 本身：普通脚本会阻塞解析、
//   defer 也会被文档序拖住（实测 300ms 的探针延迟 = 首绘 396 vs 132ms），它是承重的。
{
  const probeTag = html.match(/<script src="\/title-probe\.js"[^>]*>/)
  if (!probeTag) bad.push(`index.html 里没有引入 /title-probe.js（标签页的占位值就没法早点换掉）`)
  else if (!/\basync\b/.test(probeTag[0])) bad.push(`/title-probe.js 的引入没有 async：普通脚本/defer 会拖住入口与首绘（见 index.html 注释里的实测数）`)
}
// ★ 首帧明暗（2026-11-06）：暗色访客在入口包执行之前只有 CSS 默认亮色底 —— 先闪一屏亮色。
//   那一段必须内联在 <head>、赶在入口模块之前，并且要把 colorScheme 说清楚。
{
  const toggleAt = html.indexOf('document.documentElement.classList.toggle("dark"')
  const moduleAt = html.indexOf('<script type="module"')
  if (toggleAt < 0) bad.push('index.html 里没有首帧明暗的内联脚本（暗色访客会先闪一屏亮色）')
  else {
    if (moduleAt >= 0 && toggleAt > moduleAt) bad.push('首帧明暗那段在入口模块之后：必须赶在首帧之前（挪回 <head>）')
    if (!html.includes('document.documentElement.style.colorScheme')) bad.push('首帧明暗那段没有设 colorScheme（暗色下原生滚动条与表单控件仍是亮色）')
  }
  const css = readFileSync('src/index.css', 'utf8')
  if (!css.includes('color-scheme: dark')) bad.push('src/index.css 的 .dark 没有 color-scheme: dark')
  if (!css.includes('color-scheme: light')) bad.push('src/index.css 的 :root 没有 color-scheme: light')
}
// 站点图标的两条静态引用：hub 1.4.0 认的就是这两个路径，写成别的名字等于把兜底丢了。
for (const icon of ['/favicon.svg', '/apple-touch-icon.png']) {
  if (!html.includes(`href="${icon}"`)) bad.push(`index.html 里没有引用 ${icon}（站点图标的兜底就断了）`)
}
// 主题包里必须真的带着这两份兜底文件（public/ 会被原样拷进 dist/）。
for (const file of ['public/favicon.svg', 'public/favicon.ico', 'public/apple-touch-icon.png']) {
  if (!existsSync(file)) bad.push(`缺少 ${file}`)
}
if (bad.length) throw new Error(`缓存键或早跑脚本对不上：\n  ${bad.join('\n  ')}`)
console.log(`缓存键一致：${CACHES.map((c) => `${c.what} ${c.key}（${c.places.length} 处）`).join('、')}；早跑脚本在 index.html 里；站点图标两条静态引用与三份兜底文件都在`)
