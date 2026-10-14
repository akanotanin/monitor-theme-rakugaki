# 第三方资源声明

本主题的**代码**以 MIT 发布（见 [LICENSE](LICENSE)）。本文件声明主题包内随附的第三方资源。

## 字体

`public/fonts/` 下的 12 个 woff2 是以下七款字体的**子集**（拉丁只打用到的字重；两枚中文子集只收界面用得到的字形），随主题包分发（离线可用，
不联 Google Fonts、也不依赖访客机器装了什么）。七款均为 SIL Open Font License 1.1（OFL-1.1）；
拉丁子集取自 Google Fonts 经 Fontsource 分发，两枚中文子集的来源与生成方式见下表与文末：

| 字体 | 用途 | 版权声明 |
| --- | --- | --- |
| Rakugaki Hand（子集，重命名自 LXGW Marker Gothic） | 标题・名称・强调・手写小注的汉字 | Copyright 2021-2026 The LXGW Marker Gothic Project Authors (https://github.com/lxgw/LxgwMarkerGothic) |
| Rakugaki Kai（子集，重命名自 LXGW WenKai GB Screen） | 正文与小字的汉字 | Copyright 2021-2024 LXGW (https://github.com/lxgw/LxgwWenKai-Screen)；Copyright 2020 The Klee Project Authors (https://github.com/fontworks-fonts/Klee) |
| Shantell Sans | 标题・名称・正文（手写感的无衬线） | Copyright 2022 The Shantell Sans Project Authors (https://github.com/arrowtype/shantell-sans) |
| Newsreader | 标题（衬线；子集保留备用） | Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader) |
| Instrument Sans | 正文（子集保留备用） | Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans) |
| JetBrains Mono | 数字读数（等宽） | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) |
| Caveat | 手写小注 | Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat) |

七款**均未声明 Reserved Font Name**；两枚中文子集仍改为 Rakugaki Hand / Rakugaki Kai 分发，
避免与上游完整字面混淆（上游版权与许可声明保留在字体内部）。中文子集由
`tools/make_cjk_subset.py` 生成：字符集 = 仓库文本 + `tools/cjk-extra.txt`（当前 1596 字），
集外汉字仍由访客系统字体兜底——字体栈写在 `src/index.css` 的 `--family-*` 里。

## 视觉参考

界面语言（纸面底色、墨线描边、歪圆角、硬偏移影子、波浪分隔线、等宽读数）参考
[cc-router](https://ccrouter.app/)（MIT）的官网与桌面端风格。**参考的是观感，不是代码**：
本主题的组件、样式与逻辑都写在本仓库里，与该项目没有代码往来。

## 许可全文（OFL-1.1，上述七款字体共用）

```
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
