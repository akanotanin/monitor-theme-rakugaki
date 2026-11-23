// 护栏共用的一道闸：**dist/ 必须是新的**。
//
// 为什么需要它：`tools/verify_*.mjs` 全都伺服 `dist/`（打包产物），而不是源码。
// 改了 `src/` 却忘了 `npm run build`，护栏照样全绿 —— 2026-11-23 实测：把 `.sk-card` 的
// `border` 从 2px 改成 0px、不重新构建，`verify_card_form` 仍然 `PASS 44 / FAIL 0`。
// 这种「真空通过」比没有护栏更坏：它给人一种「改完验过了」的错觉。
//
// 判据与 `scripts/package.mjs` 同源（那里也在拦同一件事）：`src/`、`public/`、`index.html`、
// `vite.config.ts`、`package.json`、`theme.json` 的最新 mtime 必须 ≤ `dist/index.html` 的 mtime。
// 用时间戳不用哈希：Vite 的产物名带内容哈希，比不出「改了源码但没重新构建」。
//
// 用法（每个 verify 脚本的开头一行）：
//   import { assertDistFresh } from "./_dist-fresh.mjs"
//   assertDistFresh()
//
// 例外：`RAKUGRAKI_SKIP_DIST_FRESH=1` 可跳过（临时量旧产物用），但会打一行显眼的警告。
import { existsSync, readdirSync, statSync } from 'node:fs'

/** 参与比对的源：目录会递归，文件名是仓库根的单个文件。 */
const SOURCES = ['src', 'public']
const FILES = ['index.html', 'vite.config.ts', 'package.json', 'theme.json']

/** 收集所有源文件的 mtime（毫秒）。 */
function newestSource() {
  let newest = 0
  let where = ''
  const visit = (path) => {
    const st = statSync(path)
    if (st.isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) visit(`${path}/${entry.name}`)
      return
    }
    if (st.mtimeMs > newest) {
      newest = st.mtimeMs
      where = path
    }
  }
  for (const dir of SOURCES) if (existsSync(dir)) visit(dir)
  for (const file of FILES) if (existsSync(file)) visit(file)
  return { newest, where }
}

/**
 * 断言 dist/ 比所有源码新。不新鲜就**直接退出**（exit 1），并打印要做的那一条命令。
 * 护栏脚本在文件顶部调用它，后面的东西一行都不会跑 —— 宁可红，也不要绿得没意义。
 */
export function assertDistFresh() {
  if (process.env.RAKUGRAKI_SKIP_DIST_FRESH === '1') {
    console.warn('⚠ 跳过 dist 新鲜度检查（RAKUGRAKI_SKIP_DIST_FRESH=1）：这一轮跑的是旧产物，结论只对那个产物成立')
    return
  }
  if (!existsSync('dist/index.html')) {
    console.error('✗ 没有 dist/index.html —— 先 `npm run build`')
    process.exit(1)
  }
  const built = statSync('dist/index.html').mtimeMs
  const { newest, where } = newestSource()
  if (newest > built) {
    const mins = ((newest - built) / 60000).toFixed(1)
    console.error(`✗ dist/ 比源码旧 ${mins} 分钟，跑的是旧产物（真空通过）：${where}`)
    console.error('  先 `npm run build`，再跑这条护栏。')
    process.exit(1)
  }
}
