# dsh-toolchain —— DSH Office 的运行时工具链

这个仓库接收 **DSH Office 插件（`@deepseek-ai/dsh-docx`）所需的运行时**：Windows x64 上的私有
Python 3.13、LibreOffice、Poppler。插件本体不再捆绑这 1.6 GB，改成按契约去找运行时。

当前的交接版本：**0.9.0**，与插件 `@deepseek-ai/dsh-docx@0.9.0` 配对。
交接包（打包好的运行时 tgz）见本仓库的 Release；源码与配方见下面。

## 仓库里有什么

| 路径 | 是什么 |
| --- | --- |
| `scripts/fetch-runtime.ps1` | 从上游下载并 **sha256 校验**三件二进制与 5 个 Python wheel，装到 `runtime/win32-x64/`；目标目录可用 `-RuntimeRoot` 指定 |
| `scripts/verify-runtime.mjs` | 验收脚本：给定运行时根目录，逐项检查二进制版本、插件真正用到的 Python 包、体积文件数、`runtime.json` 清单 |
| `docs/CONTRACT.md` | **插件侧契约**：目录布局、解析顺序、环境变量与配置键、`runtime.json` schema、缺运行时时的降级语义 |
| `docs/COMPONENTS.md` | 三组件的版本、体积、文件数、许可文件位置（实测回执） |
| `runtime.example.json` | 0.9.0 的实际清单，可直接作为 `runtime.json` 的样板 |

`runtime/` 本身**不入库**（1.7 GB），走 Release 资产或本地 fetch。

## 怎么跑

```powershell
# 1) 取运行时（约 1.7 GB，全部来源都做 sha256 校验）
pwsh -File scripts/fetch-runtime.ps1

# 2) 验收
node scripts/verify-runtime.mjs runtime/win32-x64

# 3) 打成交接包（目录布局必须是 <pkg>/runtime/win32-x64 与 <pkg>/runtime.json）
#    在 dsh-office 仓库里由 scripts/build-dsh.mjs + pack-dsh.mjs 完成，产物名：
#    deepseek-ai-dsh-docx-runtime-<版本>.tgz
```

验收脚本 0.9.0 的回执（在本机对打包好的运行时实跑）：

```
✓ binary:python              Python 3.13.15
✓ binary:libreoffice         LibreOffice 26.8.0.3 bce0998afefdbc355585ca324285661a2170ba77
✓ binary:poppler             pdftoppm version 26.09.0
✓ python:lxml                6.1.0
✓ python:pptx                1.0.2
✓ python:PIL                 12.3.0
✓ python:xlsxwriter          3.2.9
✓ python:typing_extensions   ok
✓ manifest:schema            dsh-office-runtime/v1
✓ manifest:platform          win32-x64
✓ manifest:components        三个组件都标 present
体积：python 48MB/665 files，libreoffice 1504MB/19456 files，poppler 121MB/561 files
结论：全部通过
```

## 插件怎么找到它（三句话）

1. 插件按 `runtimeRoot` 配置 → `DSH_OFFICE_RUNTIME_ROOT` 环境变量（或 `DOCX_PYTHON`/`DOCX_SOFFICE`/`DOCX_PDFTOPPM`）→
   **兄弟包** `node_modules/@deepseek-ai/dsh-docx-runtime`（读它的 `runtime.json`）→ 自带 `runtime/` 的顺序解析。
2. 所以把一个符合布局的运行时包放进 profile 的 `node_modules` 就够了；要复用宿主已有的 LibreOffice/Python，
   用 `runtimeRoot` / `DSH_OFFICE_RUNTIME_ROOT` 指过去，连 546 MB 都不用装。
3. **运行时缺失不是致命错误**：插件照常启动，只在调用依赖运行时的能力时返回 `ENGINE_UNAVAILABLE`，
   并在 `docx_doctor` 里逐项列明。详细语义见 `docs/CONTRACT.md`。

## 交接边界

- 本仓库负责：**运行时二进制的来源、版本钉住、校验、验收、打包形态**。
- 插件仓库（`sdaniasdsd/dsh-office`）负责：怎么用这些路径、能力如何降级、`docx_doctor` 怎么报。
- 两边唯一耦合面是 `docs/CONTRACT.md` 里写的那份契约：**三个绝对路径 + 可选的 `runtime.json`**。
  只要这三个路径能用、`runtime.json` 的 schema 不变，换一份运行时（自建、宿主已有、别的版本）都不需要改插件。
