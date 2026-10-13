#!/usr/bin/env python3
"""生成随主题包分发的中文手写体子集（public/fonts/rakugaki-{hand,kai}.woff2）。

用法（仓库根）：
  python tools/make_cjk_subset.py           # 重新生成两枚子集
  python tools/make_cjk_subset.py --check   # 只校验现有子集与当前字符集是否对齐（不写文件）
  python tools/make_cjk_subset.py --fetch   # 先下载上游源字体到 tools/.cjk-src/（不进包）

依赖：fontTools + brotli（pip install fonttools brotli）。
需要能访问 GitHub（本机走系统代理时先 export HTTPS_PROXY=http://127.0.0.1:2080）。

上游（均为 OFL-1.1，版权与许可随字体与 FONTS.md 分发）：
  Rakugaki Hand  ← LXGW Marker Gothic（霞鹜漫黑）v1.004
  Rakugaki Kai   ← LXGW WenKai GB Screen（霞鹜文楷 Screen）v1.522
子集经重命名分发（Rakugaki Hand / Rakugaki Kai），避免与上游完整字面混淆；
内嵌的版权（name 0）与许可（name 13/14）原样保留。

字符集 = 扫描本仓库文本文件（跳过 node_modules/dist/shots 等）里的中日韩字形
        ∪ tools/cjk-extra.txt（手工补充的常用字）
        ∪ SYMBOLS（↓↑ 一类界面符号）。
上游字体真的缺的字形只有 ⚠ ✓ ✕（见 MISSING_OK），其余都应在子集里。
"""
import argparse
import re
import subprocess
import sys
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "public" / "fonts"
SRC = ROOT / "tools" / ".cjk-src"
EXTRA = ROOT / "tools" / "cjk-extra.txt"

CJK = re.compile(r"[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3000-\u303F]")
SYMBOLS = "↓↑←→×≈✓✕⚠·、，。！？；：（）「」『』《》〈〉【】…—～％＃＠＆★"
MISSING_OK = set("⚠✓✕")  # 上游字体缺、由系统兜底的字形

SKIP_DIRS = {".git", "node_modules", "dist", "release", "shots", ".vite-cache", ".vite-temp", ".cjk-src"}
SCAN_EXT = (".tsx", ".ts", ".css", ".html", ".json", ".md", ".mjs", ".txt", ".py")

UPSTREAM = {
    "hand": {
        "url": "https://github.com/lxgw/LxgwMarkerGothic/releases/download/v1.004/LxgwMarkerGothic-v1.004.zip",
        "zip": "LxgwMarkerGothic-v1.004.zip",
        "member": "LxgwMarkerGothic-v1.004/fonts/ttf/LXGWMarkerGothic-Regular.ttf",
        "family": "Rakugaki Hand",
    },
    "kai": {
        "url": "https://github.com/lxgw/LxgwWenKai-Screen/releases/download/v1.522/LXGWWenKaiGBScreen.ttf",
        "file": "LXGWWenKaiGBScreen.ttf",
        "family": "Rakugaki Kai",
    },
}


def build_charset() -> str:
    chars = set()
    for path in ROOT.rglob("*"):
        if path.is_dir() or not path.suffix in SCAN_EXT:
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        chars |= set(CJK.findall(text))
    if EXTRA.exists():
        chars |= set(CJK.findall(EXTRA.read_text(encoding="utf-8")))
    chars |= set(SYMBOLS)
    chars = {c for c in chars if c.strip() and unicodedata.category(c)[0] != "C"}
    return "".join(sorted(chars))


def fetch_sources() -> None:
    SRC.mkdir(parents=True, exist_ok=True)
    for key, spec in UPSTREAM.items():
        target = SRC / (spec.get("zip") or spec["file"])
        if target.exists():
            print(f"已缓存 {target}")
            continue
        print(f"下载 {spec['url']} -> {target.name}")
        urllib.request.urlretrieve(spec["url"], target)
    z = zipfile.ZipFile(SRC / UPSTREAM["hand"]["zip"])
    z.extract(UPSTREAM["hand"]["member"], SRC)


def source_paths() -> dict:
    return {
        "hand": SRC / UPSTREAM["hand"]["member"],
        "kai": SRC / UPSTREAM["kai"]["file"],
    }


def subset(src: Path, out: Path, family: str, charset_file: Path) -> None:
    from fontTools.ttLib import TTFont

    tmp = out.with_suffix(".tmp.woff2")
    cmd = [sys.executable, "-m", "fontTools.subset", str(src),
           f"--text-file={charset_file}", "--flavor=woff2", "--desubroutinize",
           f"--output-file={tmp}"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"fontTools.subset 失败：\n{r.stderr[-800:]}")
    f = TTFont(str(tmp))
    n = f["name"]
    for nid, val in [(1, family), (2, "Regular"), (3, f"{family}-Regular;subset"),
                     (4, f"{family} Regular"), (6, f"{family}-Regular"),
                     (16, family), (17, "Regular")]:
        n.setName(val, nid, 3, 1, 0x409)
        n.setName(val, nid, 1, 0, 0)
    n.setName("Subset of the upstream OFL font (see FONTS.md); renamed.", 10, 3, 1, 0x409)
    f.save(str(out))
    tmp.unlink()
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB  family=\"{family}\"")


def coverage(woff2: Path) -> set:
    from fontTools.ttLib import TTFont
    return set(TTFont(str(woff2)).getBestCmap().keys())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只校验，不写文件")
    ap.add_argument("--fetch", action="store_true", help="先下载上游源字体到 tools/.cjk-src/")
    args = ap.parse_args()

    if args.fetch:
        fetch_sources()
        if args.check:
            return

    charset = build_charset()
    print(f"字符集 {len(charset)} 个字符")
    outs = {"hand": FONTS / "rakugaki-hand.woff2", "kai": FONTS / "rakugaki-kai.woff2"}

    if args.check:
        bad = 0
        for key, out in outs.items():
            if not out.exists():
                print(f"缺文件：{out}"); bad += 1; continue
            cmap = coverage(out)
            miss = {c for c in charset if ord(c) not in cmap}
            unexpected = miss - MISSING_OK
            print(f"{out.name}: 覆盖 {len(charset) - len(miss)}/{len(charset)}；"
                  f"缺失 {''.join(sorted(miss)) or '（无）'}")
            if unexpected:
                print(f"  ✗ 有非预期缺失：{''.join(sorted(unexpected))} —— 重新生成")
                bad += 1
        sys.exit(1 if bad else 0)

    if not source_paths()["hand"].exists():
        sys.exit("上游源字体不在 tools/.cjk-src/ —— 先跑 --fetch（或手动放入）")
    charset_file = SRC / "charset.txt"
    charset_file.write_text(charset, encoding="utf-8")
    for key, out in outs.items():
        subset(source_paths()[key], out, UPSTREAM[key]["family"], charset_file)
    print("完成。跑 python tools/make_cjk_subset.py --check 复核覆盖。")


if __name__ == "__main__":
    main()
