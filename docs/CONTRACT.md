# 插件侧契约（DSH Office ↔ 运行时工具链）

这份文档是两边唯一的耦合面。改它等于改接口，要两边一起动。

## 一、运行时根目录的布局

插件期望一个目录，里面是三件必需组件：

```
<runtimeRoot>/python/python.exe
<runtimeRoot>/libreoffice/program/soffice.com
<runtimeRoot>/poppler/poppler-26.09.0/Library/bin/pdftoppm.exe
```

`<runtimeRoot>` 在发行包里就是 `<包根>/runtime/win32-x64`（清单文件 `<包根>/runtime.json`）。
`runtime.json` 中的 `components.<name>.entry` 是发布运行时的权威入口；插件侧对旧布局仍保留
兼容回退。新运行时版本必须先更新工具链锁文件并通过验收，不能只替换目录名。

## 二、插件怎么解析这三个路径（优先级从高到低）

1. **插件配置**：`runtimeRoot`，或分别 `pythonPath` / `sofficePath` / `pdftoppmPath`（绝对路径）；
2. **环境变量**：`DSH_OFFICE_RUNTIME_ROOT`（指向含 `win32-x64/` 的目录或直接指向那一层），
   或按件覆盖 `DOCX_PYTHON` / `DOCX_SOFFICE` / `DOCX_PDFTOPPM`；
3. **兄弟包**：从插件包目录向上逐层找 `node_modules/@deepseek-ai/dsh-docx-runtime`，
   读到它的 `runtime.json` 就用它下面的 `runtime/win32-x64`；
4. **插件自带**：`<插件包>/runtime/win32-x64`（旧布局兼容）。

运行时查找、解析和路径注入属于 DSH host 环境适配层；能力模块不应自行下载、安装或扫描系统组件。

第 3 条在 npm 扁平布局与 pnpm 隔离布局下都实测通过（pnpm 隔离布局是"核心包能不能看到兄弟包"最不确定的一种，
本仓库 0.9.0 的验收里专门测过：装上核心包 + 运行时包后，插件自报 `source = runtime-package`、
无缺失、三条路径全部存在）。

## 三、缺运行时时的行为（契约的一部分，别当成错误）

- 只有**插件自己的服务端** `lib/server.mjs` 缺失，才算"包不完整"、才拒绝启动。
- 运行时不全时：插件照常启动，只把**存在的**路径注入子进程，把缺什么写进 stderr 与
  环境变量 `DSH_DOCX_RUNTIME_MISSING`（逗号分隔的 `名字=路径` 列表），并注入 `DSH_DOCX_RUNTIME_SOURCE`
  （`config` / `env` / `runtime-package` / `bundled`）。
- 依赖运行时的能力在调用时返回 `ENGINE_UNAVAILABLE`（例如 `Unable to launch the parse interpreter "python"`、
  `Could not start renderer executable: spawn soffice ENOENT`），`docx_doctor` 逐项给结论。
- **纯 Node 的能力不受影响**：创建、样式、编辑、交付清单这些在没有运行时的情况下照常工作。
- 一个副作用要知道：不注入 `DOCX_PYTHON` 时插件回落到 `python` 这个名字，会在 **PATH** 上找——
  于是"机器上恰好装了合适的 Python"时解析能力是能用的（`docx_doctor` 会如实报告），
  这属于宿主环境，不是运行时包提供的确定性能力。

## 四、`runtime.json` schema（当前 v1）

```json
{
  "schema": "dsh-office-runtime/v1",
  "version": "0.9.0",
  "platform": "win32-x64",
  "components": {
    "python":      { "present": true, "entry": "python/python.exe",                                        "bytes": 50013265,   "files": 665 },
    "libreoffice": { "present": true, "entry": "libreoffice/program/soffice.com",                          "bytes": 1577413569, "files": 19456 },
    "poppler":     { "present": true, "entry": "poppler/poppler-26.09.0/Library/bin/pdftoppm.exe",       "bytes": 126544679,  "files": 561 }
  }
}
```

- 插件只**读**它来做定位（第 3 条解析），不做强制校验；`scripts/verify-runtime.mjs` 才做严格校验。
- `components.<name>.entry` 必须使用 `/` 作为分隔符，且必须是相对路径。producer 可以在本机把它转换成
  原生路径访问文件，但写入 `runtime.json` 时不得转换；verifier 按规范化后的 `/` 值严格比较。
- 换布局/换版本时保持 `schema` 字符串不变、把 `version` 与 `components` 更新即可；
  `platform` 目前只有 `win32-x64`。
- 运行时包的 `package.json` 声明 `os: ["win32"] / cpu: ["x64"]`；核心包不限定平台。

## 五、验收清单（接手的人按这个跑）

1. `node scripts/verify-runtime.mjs <runtimeRoot>` —— 所有检查全过、退出码 0（二进制版本、5 个 Python 包、体积、`runtime.json`）。
2. 打成交接包后，在一个**干净目录**里用两个 `file:` 依赖装核心包与运行时包，确认插件自报
   `runtime source = runtime-package` 且无缺失项（0.9.0 的实测：pnpm install 6m51s，退出码 0）。
3. 三组真实调用对照（0.9.0 实测结论）：

   | 配置 | create | parse | pptx | render |
   | --- | --- | --- | --- | --- |
   | 只有核心包，保留宿主 PATH | ✓ | ✓（用了系统 Python） | ✓ | ✗ `spawn soffice ENOENT` |
   | 只有核心包，PATH 收成 System32 | ✓ | ✗ `Unable to launch the parse interpreter "python"` | ✗ | ✗ |
   | 核心 + 运行时包 | ✓ | ✓ | ✓ | ✓ 产出 PDF |

4. 换运行时版本时，至少复跑第 1 与第 3 组；第 3 组里"只有核心包"那一列是**降级行为**的回归。

## 六、不在契约内（明确不做）

- 不提供 `docling`（深度解析）与 `rdocx`（复杂版面页坐标）——它们由使用方按需另装，缺包时插件明确报不可用。
- 不保证非 Windows x64 平台；Popper 目录名带版本号这一点也不保证跨版本稳定。
- 不做服务发现（没有 DSH 服务注入）：目前只认配置、环境变量、兄弟包、自带目录这四条。
- Java 是工具链锁文件中的可选、宿主拥有组件；当前运行时包不提供 JDK，也不因没有 Java 而降低
  既有 Office 能力。未来 Java 模块必须显式声明自己的组件契约、来源、摘要和验收探针。
