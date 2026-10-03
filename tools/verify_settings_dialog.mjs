// 不用登录密码，验证「后台 → 主题 → 主题设置」里到底画出了哪些设置项。
//
// 原理：hub 后台是 SPA，设置对话框完全按 `GET /api/themes` 返回的 manifest.config 现画；
// 所以这里用 CDP 拦 /api/* 发假数据（config 就喂目标主题真实的 theme.json），跑的是真 React 组件。
//
// 对照组用法：先拿**改动前**的 theme.json 跑一遍，断言必须 FAIL（证明这个护栏真看得见设置项的增删），
// 再拿改动后的跑，断言必须全 PASS。只验「正确时通过」等于没验。
//
// ★Hub 1.3.0 的两条布局规则（从前端 bundle 里挖出来的，判据就是**非标题字段的个数**）：
//     o = 非标题字段 > 6  → 栅格变**两列**（每格半宽）
//     s = o && 分组数 > 1 → 再加**左侧分组导航、只挂载当前那一组**
//   1.4.0 的 7 个设置项正好跨过第一道坎：两列里长说明折成四五行的同时并排两项高矮不齐、
//   每组最后一行还空半格。1.5.0 把两个「列表页顶部」开关并成一个四选一，回到 6 项 → 单列平铺。
//   文字断言因此**按组点开、按组断言**（有导航时只挂载当前组，拿一次文本去断所有组会把没打开的
//   那批整批判成「没画出来」）；下面的排版断言则不管哪种布局都成立。
//
// 用法: node tools/verify_settings_dialog.mjs <theme.json> <截图前缀> [baseUrl=http://127.0.0.1:28081]
//
// 用法: node tools/verify_settings_dialog.mjs <theme.json> <截图前缀> [baseUrl=http://127.0.0.1:28081]
//   baseUrl 通常是 ssh -L 隧道到测试 hub 的本地端口。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const MANIFEST = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const PREFIX = process.argv[3] || 'shots/settings-dialog';
const BASE = (process.argv[4] || 'http://127.0.0.1:28081').replace(/\/$/, '');
// 本站要靠这几项换图标、指养鸡场入口、切卡片形态、开关列表页顶部那两行、按名字挑延迟线路、
// 决定备注摊在哪儿——名字与 theme.json 的 label 逐字对应。
// ★备注：「服务器备注」那份清单 1.15.x 起、1.16.0 删过、1.17.0 请回来、1.18.0 删掉——备注内容只读
// hub 后台按节点填的「公开备注」与「私有备注」（见 src/lib/notes.ts）；1.19.1 起主题这边给「备注」
// 那一节配了一个**真实设置项「备注显示位置」**（卡片与详情页 / 只在卡片 / 只在整页详情 / 都不显示），
// 用法说明就挂在它的灰色说明里（hub 只画「后面跟着字段」的标题，没有字段的标题会被静默丢掉）。
// **字段数 6**（≤6 就不会让面板切两列 + 分组导航；到 7 个才会，下面有排版断言）。
const WANTED = ['站点图标', '养鸡场入口', '卡片形态', '列表页顶部', '备注显示位置', '显示的延迟线路'];
const PORT = 9780 + Math.floor(Math.random() * 20);
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
  .find((p) => existsSync(p)) || 'chrome';

const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
  '--user-data-dir=' + (process.env.TEMP || '.') + '/settingsdlg-' + PORT + '-' + Date.now(), 'about:blank'], { stdio: 'ignore' });

let id = 0; const pend = new Map();
async function connect() {
  for (let i = 0; i < 40; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(300);
  }
  throw new Error('Chrome 没起来');
}
const ws = new WebSocket(await connect());
await new Promise((r) => { ws.onopen = r; });
const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
// 站点配置喂 `{}` = 从没保存过：面板的初值是 `saved[key] ?? default`，
// 所以截图里应当看到主题自带的默认值（/site-icon.png、开关是开的）。
// 「保存过非默认值」那一态不用这里验——线上真机的 PUT/匿名读回才是判据。
const saved = {};
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params; const u = request.url;
    const json = (o) => send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(o)).toString('base64') });
    if (/\/api\/ws/.test(u)) return send('Fetch.failRequest', { requestId, errorReason: 'Aborted' });
    if (/\/api\/themes\/[^/]+\/config/.test(u)) return json(saved);
    if (/\/api\/themes(\?|$)/.test(u)) return json({ themes: [
      { name: MANIFEST.name, short: MANIFEST.short, description: MANIFEST.description, version: MANIFEST.version, author: MANIFEST.author, url: MANIFEST.url, selected: true, builtin: false, config: MANIFEST.config },
      { name: '默认主题', short: 'default', description: '', version: '1.0.0', author: 'Monitor', url: '', selected: false, builtin: true, config: [] },
    ] });
    if (/\/api\/me(\?|$)/.test(u)) return json({ authed: true, admin: true, github: false, public_page: true, site: BASE, site_name: '演示站点' });
    if (/\/api\/nodes/.test(u)) return json({ nodes: [] });
    if (/\/api\/ping-tasks/.test(u)) return json({ tasks: [] });
    if (/\/api\/version/.test(u)) return json({ version: '1.3.0' });
    return send('Fetch.continueRequest', { requestId });
  }
};
const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
let pass = 0, fail = 0;
const check = (n, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${extra ? ' — ' + extra : ''}`); if (ok) pass++; else fail++; };

await send('Runtime.enable'); await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/admin/themes` });

// 先把「主题页本身起来了」和「卡片上有设置按钮」分开断言：
// Hub 只给**声明了 config 的**主题画那枚「主题设置」按钮，所以没有 config 时
// 等它出现会一直等不到——那是被测对象的状态，不是页面没起来，别混成一句失败。
let pageOk = false;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  pageOk = await js(`document.body.innerText.includes('安装主题')`);
  if (pageOk) break;
}
check('后台主题页渲染出来了', pageOk);
if (!pageOk) console.log('⚠ 页面没起来（曾遇到一次性空白页假失败）——同样的桩重跑一次再判定，不要当代码问题');

let btn = false;
if (pageOk) {
  for (let i = 0; i < 20; i++) {
    btn = await js(`!!document.querySelector('button[title="主题设置"]')`);
    if (btn) break;
    await sleep(300);
  }
}
check('主题卡片上有「主题设置」按钮（Hub 只给声明了 config 的主题画）', btn);

let dlg = false;
if (btn) {
  await js(`document.querySelector('button[title="主题设置"]')?.click()`);
  for (let i = 0; i < 40; i++) { await sleep(400); dlg = await js(`!!document.querySelector('[role="dialog"]')`); if (dlg) break; }
  check('设置对话框已打开', dlg);
  await sleep(800);
}

const entries = MANIFEST.config || [];
// theme.json 里 type=title 的项就是面板上的小节标题，也是分组导航上的项名。
const groups = [];
for (const entry of entries) {
  if (entry.type === 'title') groups.push({ label: entry.label, fields: [] });
  else if (groups.length) groups[groups.length - 1].fields.push(entry);
  else groups.push({ label: '', fields: [entry] });
}

const dialogText = async () => (await js(`(document.querySelector('[role="dialog"]')?.innerText || '')`)) || '';
// 分组导航：对话框左侧那排按钮。实测面板给它们发的是 `aria-current`（true/false），不是
// `aria-selected`（后者要 `[role=tab]` 才成立）——写错的那版返回空数组，于是「没导航」这段
// 分支被当成常态，断言全落在第一组上。别拿 [role=dialog] nav 找，那是另一个对话框的结构。
const nav = (await js(`[...document.querySelectorAll('[role="dialog"] button[aria-current]')].map((b) => b.innerText.trim())`)) || [];
const hasNav = nav.length > 1;
console.log(`对话框布局：${hasNav ? `分组导航 ${nav.join(' / ')}` : '一页平铺（字段数 ≤ 6，无导航）'}\n`);

async function openGroup(label) {
  if (!hasNav) return true;
  const clicked = await js(`(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button[aria-current]')].find((x) => x.innerText.trim() === ${JSON.stringify(label)})
    if (!b) return false
    b.click()
    return true
  })()`);
  if (clicked) await sleep(500);
  return clicked;
}

// 「面板画出来了没」：按组点开再读文本。有导航时只挂载当前那一组，
// 没导航（小表单）时整页就是全部字段——两种布局共用同一批断言。
const texts = {};
for (const group of groups) {
  const opened = await openGroup(group.label);
  const text = await dialogText();
  texts[group.label] = text;
  const where = hasNav ? `「${group.label}」组` : '对话框';
  console.log(`—— ${where}: ${text.replace(/\n+/g, ' | ').slice(0, 400)}\n`);
  check(`${where}读到了内容`, opened && text.includes('取消'));
  for (const field of group.fields) check(`${where}里画出了「${field.label}」`, text.includes(field.label));
  check(`${where}每一项的说明文案都画出来了`,
    group.fields.every((f) => !f.help || text.includes(f.help)), group.fields.map((f) => f.label).join('、'));
}
const everyText = Object.values(texts).join('\n');
// 分组名（= 小节标题）也要能看到：有导航时在导航栏上，没有时在正文里。
// ★别只拿 everyText 当判据——导航栏本身就属于对话框正文，组名永远在里面，那样断言恒真。
check('theme.json 里的每个分组都有对应的导航项 / 小节标题',
  groups.length > 0 && groups.every((g) => g.label === '' || nav.includes(g.label) || everyText.includes(g.label)),
  groups.map((g) => g.label).join('、') || '（一个都没有）');
const declaredKeys = entries.filter((e) => e.type !== 'title').map((e) => e.key);
console.log(`声明的设置项: ${declaredKeys.join('、') || '（无）'}  分组: ${groups.map((g) => g.label).join('、') || '（无）'}  version=${MANIFEST.version}`);

// 两个方向都断：manifest 声明了没（我们的表单写对了没），面板画出来了没（Hub 认不认这个声明）。
for (const label of WANTED) {
  const owner = groups.find((g) => g.fields.some((f) => f.label === label));
  check(`对话框里画出了「${label}」`, !!owner && (texts[owner.label] || '').includes(label));
  check(`theme.json 声明了「${label}」`, entries.some((e) => e.label === label));
}

// 设置项的**说明文案**与**开关初值**也要断：它们是站长唯一看得见的地方，
// 改了 theme.json 的 help / default 却在面板上没生效（或残留旧句子）就等于没改。
// 「养鸡场地址」的说明曾经带一个跨站示例（会指向一个具体站点），那是要脱敏掉的。
// 断的时候只看**形状**（示例句子 + 指向 farm 路径的具体网址），不把站点名写进本仓库。
const helpText = (entries.find((e) => e.key === 'farmUrl') || {}).help || '';
check('「养鸡场入口」的说明不再带跨站示例', helpText !== '' && !/例如|跨站的会在新标签页打开/.test(helpText), `help=${helpText}`);
check('对话框里也没有残留的旧示例句子',
  !everyText.includes('例如想直接进公开的') && !/https?:\/\/[^\s"）)]*\/chicken/.test(everyText));

// 「服务器备注」那一格（serverNotes）：1.15.x 起、1.16.0 删过、1.17.0 请回来、1.18.0 删掉——备注只读
// hub 后台按节点填的两个字段。两个方向都断（manifest 声明了没、面板画出来了没），并且**反过来断
// 「它不许回来」**：半截状态（字段删了、对话框还画着一格）最难发现，而站长会照着那一格白填。
check('theme.json 里不再声明「服务器备注」（serverNotes）', !entries.some((e) => e.key === 'serverNotes'),
  JSON.stringify(entries.filter((e) => e.type !== 'title').map((e) => e.key)));
check('「主题设置」对话框里也没有那一格', !everyText.includes('服务器备注'));

// 「备注」那一节的用法说明：**它不再是上面那行加粗标题**——用户要求「说明挂在字段上、写精简」，
// 于是并进了「备注显示位置」的 `help`（灰色小字，就画在下拉框下面）。判据因此从「标题文案」
// 挪到「那个字段的 help」；标题只留一个精简的小节名，且**必须紧跟一个字段**（hub 会把
// 「紧跟另一个标题的标题」与「列表里最后一个标题」静默丢掉——实测挪到「卡片形态」下面整行消失）。
const GUIDE_TITLE = (entries.find((e) => e.type === 'title' && /备注/.test(String(e.label))) || {}).label || '';
check('theme.json 里声明了「备注」那一节的标题', GUIDE_TITLE !== '',
  JSON.stringify(entries.filter((e) => e.type === 'title').map((e) => e.label)));
check('小节标题精简（说明搬进字段的灰色说明里了，标题不再是整段话）', GUIDE_TITLE.length <= 6, GUIDE_TITLE);
const GUIDE = (entries.find((e) => e.key === 'remarkPlacement') || {}).help || '';
check('用法说明并进了「备注显示位置」的灰色说明里（在下拉框下面）', GUIDE !== '', GUIDE);
check('说明里讲清了两个来源与可见性（公开给访客、私有给自己）',
  /公开/.test(GUIDE) && /私有/.test(GUIDE) && /访客/.test(GUIDE) && /自己/.test(GUIDE), GUIDE);
check('说明里讲清了展示位置（卡片与详情页）', /卡片/.test(GUIDE) && /详情/.test(GUIDE), GUIDE);
check('说明里讲了怎么填（后台节点 / 逗号分隔＝多枚 / 留空不显示）',
  /后台|节点/.test(GUIDE) && /逗号/.test(GUIDE) && /留空/.test(GUIDE), GUIDE);
check('那一节标题紧跟一个字段（hub 会丢掉没有字段跟进的标题）',
  entries.some((e, i) => e.type === 'title' && String(e.label) === GUIDE_TITLE && entries[i + 1] && entries[i + 1].type !== 'title'),
  JSON.stringify(entries.map((e) => e.type)));
const guideAt = entries.findIndex((e) => e.type === 'title' && String(e.label) === GUIDE_TITLE);
check('说明后面跟的正是「备注显示位置」', entries[guideAt + 1]?.key === 'remarkPlacement',
  JSON.stringify(entries[guideAt + 1]));
// 四档口径：默认两边都摊，另有只在卡片 / 只在整页详情 / 都不显示。
const PLACE_OPTS = ((entries.find((e) => e.key === 'remarkPlacement') || {}).options || []).map((o) => o.value);
check('「备注显示位置」是四档：both / card / detail / none',
  JSON.stringify(PLACE_OPTS) === JSON.stringify(['both', 'card', 'detail', 'none']), JSON.stringify(PLACE_OPTS));
check('「备注显示位置」的默认值是 both（与 DEFAULTS 同口径）',
  (entries.find((e) => e.key === 'remarkPlacement') || {}).default === 'both',
  JSON.stringify((entries.find((e) => e.key === 'remarkPlacement') || {}).default));
check('「卡片形态」在「列表与卡片」那一组里（不再挂在备注标题下）',
  entries.findIndex((e) => e.key === 'cardStyle') < guideAt &&
    entries.slice(0, entries.findIndex((e) => e.key === 'cardStyle')).some((e) => e.type === 'title' && e.label === '列表与卡片'),
  JSON.stringify(entries.map((e) => e.key || e.label)));
check('「主题设置」对话框里画出了这段说明（在下拉框下面那行灰字里）',
  GUIDE !== '' && everyText.includes(GUIDE.slice(0, 12)), `找「${GUIDE.slice(0, 12)}…」`);

// 说明文案占几行才是这次的病根：两列时半宽，四五行的说明既折得碎又把并排两项拉得一高一矮。
// 逐项按 theme.json 里 help 的**原文**定位那个元素（文本完全相等），量它的高度 / 行高。
async function helpLines(help) {
  return await js(`(() => {
    const dlg = document.querySelector('[role="dialog"]')
    if (!dlg) return -1
    const el = [...dlg.querySelectorAll('*')].find((x) => x.children.length === 0 && x.textContent.trim() === ${JSON.stringify(help)})
    if (!el) return -1
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 16
    return Math.round(el.getBoundingClientRect().height / lh)
  })()`)
}
const wrapped = []
for (const field of entries.filter((e) => e.type !== 'title' && e.help)) {
  const owner = groups.find((g) => g.fields.includes(field))
  await openGroup(owner?.label ?? '')
  const n = await helpLines(field.help)
  if (n > 2 || n < 1) wrapped.push(`${field.label}=${n < 0 ? '没找到' : n + ' 行'}`)
}
// 病根是**两列半宽**下的四五行，不是「说明必须恰好一行」：单列 462px 里说明折成两行是正常的，
// 1.6.0 的「养鸡场入口」要讲清留空 / off / 地址三种状态、备注那一节的说明要讲清摊在哪儿 / 怎么填，
// 压成一行就只能删掉站长唯一的说明书。所以门槛定在 ≤2 行——四五行的退化（半宽那份）照样报错。
check('排版：每项说明至多两行（没有折成四五行的）', wrapped.length === 0, wrapped.join('、') || '全部 ≤2 行')

// 留档截图前回到第一组：上面的检查会一组组点过去，停在哪一组取决于断言顺序，
// 截图要的是「稳定可复现的那一屏」而不是「最后一个被点到的那一屏」。
if (hasNav && groups.length) await openGroup(groups[0].label)
await sleep(300)

mkdirSync(PREFIX.split('/').slice(0, -1).join('/') || '.', { recursive: true });
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${PREFIX}.png`, Buffer.from(shot.result.data, 'base64'));
console.log(`\n结果: PASS ${pass} / FAIL ${fail}  截图 -> ${PREFIX}.png`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
