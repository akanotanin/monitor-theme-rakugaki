#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成 hub 1.4.0 要的那几份兜底图标（主题侧只管「站长没设图标」时的回落）。

    public/favicon.ico          老浏览器、书签管理器、RSS 阅读器会**不看 <link> 直接来要**这条；
                                多尺寸 ICO，免得它们拿到的是回落页（HTML）。
    public/apple-touch-icon.png iOS 主屏幕图标 —— 180×180、**不透明**（iOS 会把透明的填黑，
                                所以照 hub 面板的做法铺一层纸色底）。

`public/favicon.svg` **不由这个脚本生成**：它是一张手绘的 16×16 矢量图（笔画刻意画得不平，
深色浏览器栏里也认得出），比位图缩下去清楚，所以保留原样、只在这里核对它还在。

源图放 `preview-src/`（不进包）：`site-icon.png` 是那枚手绘站标（纸 + 陶土色走势线）的
256×256 位图，ICO 与主屏图标都从它出。`site-icon.svg` 是同一枚站标的矢量原稿，一并留档。

跑法：uv run --with pillow python tools/make_icons.py [--check]
    --check 只比对（不写盘）。
"""
import io
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = os.path.join(ROOT, "preview-src", "site-icon.png")
SVG = os.path.join(ROOT, "public", "favicon.svg")
TOUCH = os.path.join(ROOT, "public", "apple-touch-icon.png")
ICO = os.path.join(ROOT, "public", "favicon.ico")

TOUCH_PX = 180
# 主屏图标那层底：纸色（与 index.css 的 --paper 同值）。
PAPER = (250, 249, 245, 255)


def _palette(img: Image.Image) -> Image.Image:
    """量化成 256 色调色板：源图描边的抗锯齿有一千多色，缩到这两个尺寸看不出差别，
    体积只有 RGBA 的三分之一。不平滑（dither=NONE）—— 平涂的手绘线条抖动反而出噪点。"""
    return img.convert("P", palette=Image.ADAPTIVE, colors=256, dither=Image.NONE)


def touch_png(src: Image.Image) -> bytes:
    # iOS 会把透明区域填黑，所以铺一层纸色底（与 hub 面板生成 touch_icon 的做法一致）。
    canvas = Image.new("RGBA", (TOUCH_PX, TOUCH_PX), PAPER)
    art = src.convert("RGBA")
    scale = min(TOUCH_PX / art.width, TOUCH_PX / art.height)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(art, ((TOUCH_PX - art.width) // 2, (TOUCH_PX - art.height) // 2))
    out = io.BytesIO()
    _palette(canvas.convert("RGB")).save(out, "PNG", optimize=True)
    return out.getvalue()


def ico_bytes(src: Image.Image) -> bytes:
    """多尺寸 ICO：16/32/48 三档（浏览器标签页、任务栏、书签管理器各取所需）。
    不带 64/128：那两档只是把体积翻倍，而这几个地方最大也就画到 48。"""
    art = src.convert("RGBA")
    out = io.BytesIO()
    art.save(out, "ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    return out.getvalue()


def main() -> int:
    check = "--check" in sys.argv
    src = Image.open(SRC)
    touch = touch_png(src)
    ico = ico_bytes(src)
    if check:
        ok = True
        if not os.path.exists(SVG):
            print("★ public/favicon.svg 不见了（手绘那张要保留）")
            ok = False
        have = open(TOUCH, "rb").read() if os.path.exists(TOUCH) else b""
        if have != touch:
            print("★ public/apple-touch-icon.png 与源图不一致")
            ok = False
        have = open(ICO, "rb").read() if os.path.exists(ICO) else b""
        if have != ico:
            print("★ public/favicon.ico 与源图不一致")
            ok = False
        print("图标产物与源图一致" if ok else "图标产物需要重新生成")
        return 0 if ok else 1
    open(TOUCH, "wb").write(touch)
    open(ICO, "wb").write(ico)
    print(f"public/favicon.ico         {len(ico)} B（16/32/48 多尺寸，从 preview-src/site-icon.png）")
    print(f"public/apple-touch-icon.png {len(touch)} B（{TOUCH_PX}×{TOUCH_PX}，纸色底不透明）")
    print("public/favicon.svg         保留原样（手绘矢量，不由本脚本生成）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
