// 护栏共用：找无头 Chrome / Chromium。
//
// 原来每个 verify 脚本各写一份探测链，散成三种：只认 Windows 的 chrome.exe、
// 认 /usr/bin/google-chrome 不认 /usr/bin/chromium、不读 CHROME 环境变量。
// 结果是 37 个护栏里只有 13 个能在 Linux CI 上跑起来（2026-11-23 统计）。
// 这里统一成一条链，优先级：CHROME > CHROME_PATH > 各平台默认路径 > PATH 里的 chrome。
//
// 用法：import { findChrome } from "./_chrome.mjs" ; const CHROME = findChrome()
import { existsSync } from 'node:fs'

const CANDIDATES = [
  // Linux（CI 与服务器：Ubuntu/Debian 两套命名、snap、Chrome 官方源）
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Windows
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

/** 返回可执行文件路径（找不到就退回 `chrome` / `chromium` 让 spawn 去 PATH 里试）。 */
export function findChrome() {
  const fromEnv = process.env.CHROME || process.env.CHROME_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const hit = CANDIDATES.find((p) => existsSync(p))
  if (hit) return hit
  return process.platform === 'win32' ? 'chrome' : 'chromium'
}
