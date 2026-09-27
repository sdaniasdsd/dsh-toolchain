# 运行时组件清单（0.9.0 实测）

三件二进制都由 `scripts/fetch-runtime.ps1` 从上游下载并做 sha256 校验，装到 `runtime/win32-x64/`。
下面每一项都在本机跑过（版本是二进制自报的，体积/文件数是遍历目录统计的）。

## 组件

| 组件 | 版本（自报回执） | 入口 | 体积 | 文件数 |
| --- | --- | --- | --- | --- |
| Python（embeddable） | `Python 3.13.15` | `python/python.exe` | 50,013,265 B | 665 |
| LibreOffice | `LibreOffice 26.8.0.3 bce0998afefdbc355585ca324285661a2170ba77` | `libreoffice/program/soffice.com` | 1,577,413,569 B | 19,456 |
| Poppler | `pdftoppm version 26.09.0`（`pdftotext` 同为 26.09.0） | `poppler/poppler-26.09.0/Library/bin/pdftoppm.exe` | 126,544,679 B | 561 |

合计约 1.67 GB（打包成 tgz 后 546 MB）。

## Python 侧的包（插件真正 import 的）

| 包 | 版本（自报） | 用途 |
| --- | --- | --- |
| `lxml` | 6.1.0 | DOCX/PPTX 引擎的 XML 后端（docx-parse / inspect / complex-parse / easy-parse） |
| `python-pptx` | 1.0.2 | pptx-office 的幻灯片检查、按坐标替换文本、标题-正文层级排版 |
| `Pillow` | 12.3.0 | 图像相关处理 |
| `XlsxWriter` | 3.2.9 | 表格输出路径 |
| `typing_extensions` | 4.16.0 | 上述包依赖 |

**不在**运行时包里（按需另装，插件会明确报不可用）：`oletools`（宏语义分析）、`docling`（深度解析）、
`rdocx`（复杂版面页坐标）。

## 上游来源与校验（脚本里逐条钉住 sha256）

| 来源 | URL | 下载物 |
| --- | --- | --- |
| python.org | `https://www.python.org/ftp/python/3.13.15/python-3.13.15-embed-amd64.zip` | `python-3.13.15.zip` |
| poppler-windows | `https://github.com/oschwartz10612/poppler-windows/releases/download/v26.09.0-0/Release-26.09.0-0.zip` | `poppler-26.09.0.zip` |
| The Document Foundation | `https://mirror.clarkson.edu/tdf/libreoffice/stable/26.8.0/win/x86_64/LibreOffice_26.8.0_Win_x86-64.msi` | LibreOffice MSI（用 `msiexec /a` 管理式解包，不安装） |
| PyPI | `lxml 6.1.0` / `python_pptx 1.0.2` / `pillow 12.3.0` / `xlsxwriter 3.2.9` / `typing_extensions 4.16.0` 的 wheel | 解到 `python/Lib/site-packages` |

## 许可文件（都在运行时树里，随包分发）

| 组件 | 树内的许可/声明文件 |
| --- | --- |
| Python | `python/LICENSE.txt`（33,861 B） |
| LibreOffice | `libreoffice/license.txt`（512,187 B）、`libreoffice/LICENSE.html`（583,943 B）、`libreoffice/NOTICE`（1,859 B） |
| Poppler | `poppler/poppler-26.09.0/share/poppler/COPYING`、`COPYING.gpl2`、`COPYING.adobe` |
| Python 包 | 各自 dist-info 里：`lxml-6.1.0.dist-info/licenses/{LICENSE.txt,LICENSES.txt}`、`pillow-12.3.0.dist-info/licenses/LICENSE`、`python_pptx-1.0.2.dist-info/LICENSE`、`typing_extensions-4.16.0.dist-info/licenses/LICENSE` |

分发时**不要剥离**这些文件。插件仓库另有 `THIRD_PARTY.md` 记录它与这些组件的关系，
两边说法不一致时以本仓库运行时树里的原始文件为准。

> 备注：上面只列"文件在哪、多大"，不代替对许可条款的解读；要对外分发请按各组件自己的许可文件逐条确认。
