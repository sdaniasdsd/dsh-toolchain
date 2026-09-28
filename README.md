# dsh-toolchain —— DSH Office 的运行时工具链

这个仓库接收 **DSH Office 插件（`@deepseek-ai/dsh-docx`）所需的运行时**：Windows x64 上的私有
Python 3.13、LibreOffice、Poppler。插件本体不再捆绑这 1.6 GB，改成按契约去找运行时。

当前运行时交接版本：**0.9.0**，与插件 `@deepseek-ai/dsh-docx@0.9.0` 配对；工具链配方版本为
**0.10.0**。工具链不是独立 Agent，不包含模型、UI、MCP 服务或后台调度。
交接包（打包好的运行时 tgz）见本仓库的 Release；源码与配方见下面。

## 仓库里有什么

| 路径 | 是什么 |
| --- | --- |
| `toolchain.lock.json` | **唯一事实来源**：版本、下载 URL、SHA-256、目录布局、探针和 Python wheel；不再分散写进多个脚本 |
| `scripts/fetch-runtime.ps1` | Windows 提取器：只读取锁文件，下载并 **sha256 校验**资产，装到 `runtime/win32-x64/`，并写入 `runtime.json` |
| `scripts/verify-runtime.mjs` | 严格验收脚本：只读取锁文件，检查二进制版本、插件真正用到的 Python 包、体积文件数和 `runtime.json` |
| `scripts/pack-runtime.mjs` | 在验收通过后打出独立 runtime tgz；运行时和 DSH Office 核心包保持分离 |
| `docs/ARCHITECTURE.md` | prepare → verify → pack 的工程边界，以及未来 Java 等可选组件的扩展规则 |
| `docs/CONTRACT.md` | **插件侧契约**：目录布局、解析顺序、环境变量与配置键、`runtime.json` schema、缺运行时时的降级语义 |
| `docs/COMPONENTS.md` | 三组件的版本、体积、文件数、许可文件位置（实测回执） |
| `runtime.example.json` | 0.9.0 的实际清单，可直接作为 `runtime.json` 的样板 |

`runtime/` 本身**不入库**（1.7 GB），走 Release 资产或本地 fetch。

## 怎么跑

```powershell
# 先看本次将使用的版本、摘要和组件；不会下载任何内容。
npm run plan

# 取运行时（约 1.7 GB，全部来源都做 sha256 校验），并写 runtime.json。
npm run prepare:runtime

# 严格验收，再打出独立交接包。
npm run verify:runtime
npm run pack:runtime
```

`npm run bootstrap` 只校验工程契约；缺运行时是允许的。需要一键准备并验收离线运行时时使用
`npm run bootstrap:with-runtime`。这把开发环境检查与大体积下载分开，避免普通源码操作意外触发下载。

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

## 扩展 Java 或其他工具链

Java 已在 `toolchain.lock.json` 中登记为**可选、宿主拥有**的组件：它不被下载、不修改系统 JDK，缺失时
也不会影响 DOCX/PPTX/XLSX/PDF。未来 Java 模块应先在锁文件声明自己的版本、来源、入口、探针和是否打包，
再补充验收与契约测试；不能把 Java 的安装、PATH 修改或启动行为塞进现有 Office 模块。详见
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。
