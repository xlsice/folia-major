# Folia 二开 — Agent 指南

> 本文件是**我们在本仓库做二次开发**时给 Agent（和未来的自己）看的操作指南。
> 上游项目自己的规则在仓库根目录 `AGENTS.md`（skill 索引），两者都读，不要互相覆盖。
>
> **事实快照：2026-10-13 实测。** 仓库 clone 自 `chthollyphile/folia-major`，基线 `67fb072a`（main，2026-10-13）。
> 已安装的官方桌面版是 **v0.7.18**（2026-10-11 发布），比 main 落后几个提交，属正常。

---

## 🚨 部署事实（2026-10-13 实测）

| 项 | 值 |
| --- | --- |
| 本机已装版本 | v0.7.18，`C:\Users\wodes\AppData\Local\Programs\Folia` |
| 本仓库基线 | main @ `67fb072a`（2026-10-13） |
| 仓库体积 | 213.2 MB / 2446 commits |
| 安装包来源 | `C:\Users\wodes\XLS\APP\Folia\Folia-Setup-0.7.18.exe`（141.5 MB，未签名） |
| 安装包校验 | SHA512 base64 `kYKrTO+xkwDWEh86iEzYaBA6DFldfTc8IelkEprXLsr25uxY7SRG+d5YyKHeIsZFENQpDZzsZQXSEsm4aoU24Q==` |
| 用户数据 | `%APPDATA%\Folia`（含 `mods/`、`logs/`、`config.json`） |
| 模组安装位 | `%APPDATA%\Folia\mods\<modId>\` |
| Node 要求 | `.nvmrc` 声明；构建链需 Node 20+ |
| 本机磁盘 | C: 930 GB 总，**剩余紧张（49.8 GB @ 2026-10-13）** |

**未验证项**：`npm install` / `npm run dev` / `npm run build` **在本机从未跑过**。本仓库是刚 clone 的干净副本，
没有装依赖。任何人要跑构建，先确认磁盘余量。

---

## Iron rule

### 🚨 Iron Rule #1：不要覆盖上游文件

上游 `AGENTS.md`、`README.md`、`docs/`、`mods/`、`skills/` 都是他人维护的。
我们的二开文档一律放 `docs/dev/`，本地验证产物放 `docs/dev/.tmp/`（已 gitignore 时另说）。

要改上游文件前先确认两件事：

1. 这次改动**必须**动上游文件（比如真的在改功能）；
2. 改动**能不能**收敛到模组层——能用 Folium 模组解决的，不要 fork 核心代码。

### 🚨 Iron Rule #2：扩展优先走 Folium 模组，不要 fork 主仓

Folia 提供了完整的模组扩展面（见下方「扩展点地图」）。除非需求明确超出模组能力
（见作者列出的红线），否则新功能一律写成模组。

**理由**：fork 主仓 = AGPL 义务跟着走 + 每次 rebase 都是痛苦；模组层耦合度低，
不进 AGPL 衍生作品的灰色地带。

### 🚨 Iron Rule #3：一切派生作品同样 AGPL-3.0

Folia 是 **AGPL-3.0**（标准原文，无附加条款）。约束：

- 复制/修改其代码 → 你的作品必须同样 AGPL-3.0 **整体开源**；
- **§13 网络条款**：部署到服务器让用户通过网络使用修改版，**必须把完整对应源码提供给他们**，
  哪怕只自用、哪怕在内网。这是 AGPL 相对 GPL 唯一的实质增量，也是最容易踩的一条；
- 不能改成 MIT/Apache 闭源。

⚠️ 上游 README「法律与免责声明」另写了"仅供非营利使用，请勿用于商业盈利用途"。
该句**只在 README、不在 LICENSE**，法律上约束力弱，但代表作者意向。
**任何商用意图先开 issue 确认**，不要默认能商用。

### 🚨 Iron Rule #4：不要手工维护会漂移的清单

上游多处清单由脚本生成或编译期断言，改动时必须用对应机制，而不是手动同步文本：

| 清单 | 生成/校验机制 |
| --- | --- |
| `docs/CODEMAP.md` | `npm run codemap` 生成，`codemap:check` 校验；CI 自动重生成 |
| 内建可视化模式 | `src/types/visualizerModes.ts` 静态清单，registry 初始化时 `assertBuiltinModeList` 断言，**对不上直接抛错启动失败** |
| 动态注册点展开 | `import.meta.glob` 自动发现，禁止手写清单 |

**推论**：新增一个内建可视化模式，必须同时改 `entry.tsx` 目录 **和**
`BUILTIN_VISUALIZER_MODES` 清单，漏一个应用就起不来。这不是 bug，是设计。

---

## Modules at a glance

代码区域规模（取自 `docs/CODEMAP.md`，量级向下取整）：

| 区域 | 文件数量级 | 说明 |
| --- | --- | --- |
| `components` | 512+ | UI 主体，含 `visualizer/`、`ponder/`、`wall/` |
| `test/dev` | 512+ | 测试与开发探针 |
| `library` | 256+ | 资料库实现（`suites/` 下有 bravais / grid / tui 三套） |
| `services` | 128+ | 业务服务（`onlineMusic/` 走 Omni 路由） |
| `utils` | 128+ | 工具（`lyrics/` 是歌词引擎核心） |
| `backend/electron` | 64+ | 桌面端主进程 + 内嵌音源后端 |
| `hooks` | 64+ | React hooks |
| `stores` | 32+ | 状态（zustand 系） |
| `types` | 16+ | 类型定义，**`src/types.ts` 是 512+ 依赖的最高枢纽** |

### 枢纽模块（改动波及面最大，改前先想清楚）

| 模块 | 依赖量级 | 说明 |
| --- | --- | --- |
| `src/types.ts` | 512+ | 全项目最核心枢纽 |
| `src/types/onlineMusic.ts` | 128+ | 在线音乐类型 |
| `src/components/command-palette/types.ts` | 64+ | 命令面板 |
| `src/components/visualizer/colorMix.ts` | 64+ | 可视化配色混合 |
| `src/library/core/contracts/suite.ts` | 64+ | 资料库套件契约 |
| `src/stores/usePlaybackStore.ts` | 64+ | 播放状态 |
| `src/mods/folium/contract.ts` | 32+ | **模组契约的唯一权威来源** |

### 内建可视化模式（14 个，权威清单在 `src/types/visualizerModes.ts`）

`cadenza` `cappella` `claddagh` `classic`（默认） `diorama` `fume` `lumiere`
`monet` `partita` `pendolo` `sonnet`（= 商籁） `still` `tempera` `tilt`

背景模式（6 个）：`common` `latent`（默认） `monet` `nomand` `sora` `url`

资料库套件（3 个）：`bravais` `grid` `tui`

---

## 扩展点地图（写模组前先查这里）

`src/mods/folium/registries/` 下有 **12 个注册表**，这就是二开的完整扩展面：

| 注册表 | 能加什么 | 稳定性 |
| --- | --- | --- |
| `tunings.tsx` | 参数面板（滑杆），宿主负责渲染/持久化/导出 | ✅ **稳定** |
| `visualizers.tsx` | **完整的新可视化模式** | ✅ 稳定 |
| `visualizerRender.tsx` | 自定义渲染 | ✅ 稳定 |
| `backgrounds.tsx` | 新背景 | ✅ 稳定 |
| `styles.ts` | 样式 | ✅ 稳定 |
| `commands.ts` | 命令面板命令 | ✅ 稳定 |
| `progress.tsx` | 进度条组件 | ✅ 稳定 |
| `playerPanelTabs.tsx` | 播放页面板 tab | ✅ 稳定 |
| `settingsSections.tsx` | 设置分区 | ✅ 稳定 |
| `stageLayers.tsx` / `stageLayerView.tsx` | 舞台图层 | ⚠️ 程度取决于具体能力 |
| `lyrics.parse` / `getLyrics` | 歌词原文解析（1.4 起） | ✅ 稳定 |
| `omniProviders.ts` | 音源 provider | 🚫 **实验性，禁止** |

### 🚨 作者红线（原文约束，务必遵守）

> 在 Folium v2 发布前，请绝对不要尝试制作超出当前实验接口能力的完整音源模组；
> 接口缺口必然导致问题，浪费开发者和维护者的时间。

> 任何尝试导出 provider 的原始音频流或解密之后的原始音频文件的模组，
> 都有极高的平台法律风险。无论采用何种实现方式，此类模组都不会上架官方模组市场。

`omni.providers` 目前**不具备**与内建 provider 对等的能力。做音源必须直接改主仓或等 v2。

### 模组契约怎么读

唯一权威来源：`src/mods/folium/contract.ts`（51 KB）。
配套：`dto.ts` `api.ts` `events.ts` `registry.ts` `services.ts` `internals.ts`。

最小可用模组（以官方样例 k3panel 为准，仅 1.8 KB）：

```js
// client.mjs —— 纯 client 模组，无 Node 代码
const KNOBS = [{ key: 'cameraScale', zh: '相机幅度', en: 'Camera intensity' }]

export default function activate(folium) {
  folium.registries.tunings.register({
    id: 'my-deep-tuning',
    target: 'sonnet',                    // 内建模式 id
    label: { 'zh-CN': '我的深度精调', en: 'My deep tuning' },
    params: KNOBS.map(k => ({
      key: k.key, type: 'number',
      label: { 'zh-CN': k.zh, en: k.en },
      group: '相机与运动',
      min: 0, max: 3, step: 0.01,
      defaultValue: 1,                   // ⚠️ 1 = 原版，不动就看不出变化
    })),
  })
}
```

`mod.json` 只需声明 `folium` / `id` / `name` / `version` / `author` / `client`（+ 可选 `preview`）。

**模组不是沙箱**：启用后以应用完整权限运行。`deactivate` 和 IPC 拒绝只管开关，不构成隔离。
官方签名（`folium.sig.json`）只证明"未被官方审查过"，不代表安全审核。

### 本机模组目录

```
%APPDATA%\Folia\mods\<modId>\       ← 装这里，放完点「重载」即可，不用重启
```

**模组系统默认关闭**：设置 → 选项 → 系统 → 实验室 → 模组系统。关着时**不加载任何模组代码**
（不是隐藏 UI，已启用的模组会被 deactivate）。

---

## SOP — 任何改动必须做的事

1. **先查扩展点地图**（上一节）。能用模组解决就别动主仓。
2. **先读 `docs/CODEMAP.md`**（结构问题），符号级用 `rg`，两者都拿不准才升级
   `dev/mcp/ts-code-map/cli.mjs`。见上游 `skills/codebase-navigation/SKILL.md`。
3. **视觉相关设置必须进视觉配置导入导出**；**功能性设置和动作必须注册到命令面板**。
   见 `skills/settings-feature-integration/SKILL.md`。漏了会出现"设置里能改但导出不带"或
   "命令面板搜不到"。
4. **在线歌曲相关必须走 Omni 路由**，只有 provider adapter 能直接碰原始接口。
   见 `skills/online-song-omni-routing/SKILL.md`。
5. **不要造轮子**：优先复用 `pretext` 文本测量、visualizer runtime、歌词时序 helper、
   字体/颜色 helper、i18n、lucide 图标、虚拟列表。见 `skills/reuse-project-utilities/SKILL.md`。
6. **高频路径要看性能**：`useMotionValueEvent` / `requestAnimationFrame` / `ResizeObserver` /
   React state 更新频率。见 `skills/frontend-runtime-guardrails/SKILL.md`。
7. **写完在 `docs/dev/CHANGELOG-RELEASE.md` 记一笔**（格式见该文件）。
8. **不要顺手改上游文档**。上游 README/LICENSE/CONTRIBUTING 保持原样。

### 不要做的事

- ❌ 不要在没有明确指令时删除、翻译或改写上游注释（上游 AGENTS.md 明令）
- ❌ 不要手改 `docs/CODEMAP.md`
- ❌ 不要只改 `entry.tsx` 不改 `BUILTIN_VISUALIZER_MODES`（反之亦然）
- ❌ 不要给模组用内建模式 id（会撞 `assertBuiltinModeList`）
- ❌ 不要 `git push origin main`（见下）

### Git 约定

- 从 `main` 开功能分支，**只推自己的分支**：`git push -u origin <branch>`
- ❌ **绝不** `git push origin main`
- 合并时机由雪冷水自己决定，不要替他合
- 不要替他提交未完成的半成品重构

---

## 本地开发环境（**未验证**）

仓库刚 clone，**没有 `node_modules`**。首次构建：

```bash
cd C:\Users\wodes\XLS\Pro\DevPro\folia-major
npm ci                     # 或 npm install
npm run dev                # 浏览器开发
npm run dev:electron       # 桌面端开发
npm run typecheck
npm run test:unit
npm run codemap            # 生成 CODEMAP.md
```

⚠️ 本机 C: 剩余仅 49.8 GB。`npm ci` + electron 缓存可能吃掉数 GB，
**跑之前先确认空间**。

桌面端打包：`npm run build:electron`（产物 `release/`）。
⚠️ 打包前必读下一节的两个坑。

---

## Gotchas agents get wrong

> 以下每一条都是**本机实测踩过**的，不是推测。

### ⛔ 切换可视化模式只有一条路：Ctrl+K 命令面板

设置页里**没有**模式切换列表。别在设置里翻。路径是：

```
Ctrl+K  →  输入「商籁」  →  「切换到可视化：商籁」(visualizer: sonnet)
```

设置里那张「歌词动画样式」卡片点进去是**当前模式**的参数编辑器，不是模式选择器。

### ⛔ tuning 面板的位置：对应模式的「歌词动画」tab，不是「通用」tab

```
设置 → 选项 → 视觉设置 → 歌词动画样式 → 「歌词动画」tab → 滑到底
```

- 只对 `target` 指定的模式生效（k3panel 只对 `sonnet`）
- 面板出现在该模式设置卡片**下方**
- 切换模式后要**重新进这个 tab** 才看得到

### ⛔ tuning 默认值 1.0 = 原版效果

11 个滑杆默认值全为 `1.0`，即"什么都不改"。
装上模组却"看不到效果"基本都是这个原因，不是模组没加载。
调到 `0` = 关闭该效果，不是禁用模组。

### ⛔ app.asar.unpacked 里找不到音源模块 ≠ 没打包

音源后端（`kugoumusicapi` 等）被打进 **`app.asar` 归档**，不在 `.unpacked`。
`.unpacked` 里只有原生模块（`onnxruntime-node`、`@koromix`、`node-windows`）。
要确认打包内容得读 `app.asar` 的 JSON 文件索引，不是看 unpacked 目录。

### ⛔ electron-builder：默认安装目录用 `productName`，不是 `appId`

`appId` 是 `top.izuna.foliamajor`，实际装在 `%LOCALAPPDATA%\Programs\Folia`（= productName）。
用 `appId` 拼路径去 `Test-Path` 必然得到 False，会误判成"安装失败"。
**排查安装结果先读 HKCU `...\Uninstall` 的 UninstallString。**

### ⛔ electron-builder：`latest.yml` 里 sha512 是 base64，不是 hex

直接拿它跟 `Get-FileHash -Algorithm SHA512` 的输出比 → 必然 mismatch，白慌一场。
正确写法：`[Convert]::ToBase64String($sha.ComputeHash($stream))` 再比。

### ⛔ `nsis.oneClick:false` 时 `/S` 静默安装有效

per-user 安装无需 UAC，约 10 秒完成。
但注意 PowerShell 里 `git`/`curl` 的 stderr 会被 `$ErrorActionPreference='Stop'` 当错误抛，
需要 `$ErrorActionPreference='Continue'` + 判 `$LASTEXITCODE`。

### ⛔ 未签名安装包用 curl 下载不带 Zone.Identifier

所以**不会**触发 SmartScreen，`Unblock-File` 也不需要。
但该 exe `Authenticode Status = NotSigned` —— 完整性只能靠 `latest.yml` 的哈希验证。

### ⚠️ 仓库现存的分层边界违规（改动时别加深）

`docs/CODEMAP.md` 末尾列了几条现存违规，例如：

- `src/stores/useVisualizerSettingsStore.ts` → `src/components/visualizer/registry.tsx`
  （store 不该依赖组件层）
- 一批"文件住在 UI 目录但运行时不含 UI"的情况（修法是**移动文件**，不是改依赖）

看到了别以为是新引入的，也别在无关改动里顺手扩大它。

### ⚠️ registry.tsx 会 eager 拉进全部 183 个 visualizer 模块（含 three.js）

所以 store、同步 schema、OBS 短码解析**都不该 import registry**，它们只在校验一个字符串。
需要"这个 mode 字符串合不合法"时用 `src/types/visualizerModes.ts` 的静态判定。
需要"认不认 mod 模式"时用 registry 的 `hasVisualizerMode`（查活注册表）。

### ⚠️ mod 投稿的模式 id 一律带 `mod:` 前缀

由加载器加。内建判定 `isBuiltinVisualizerMode` 不会误判 mod 模式，
mod 模式也不会被当成未知值。两者结构上可区分。

---

## Reference index

| 我想知道… | 去哪 |
| --- | --- |
| 某个符号在哪 | `docs/CODEMAP.md` → `rg` → `dev/mcp/ts-code-map/cli.mjs` |
| 区域规模 / 枢纽 / 边界违规 | `docs/CODEMAP.md` |
| 整体架构与桌面端细节 | `docs/technical.md` |
| 歌词引擎 | `docs/lyric-api.md`、`src/utils/lyrics/` |
| 本地音乐库 | `docs/local-library-management.md`、`docs/library-suites.md` |
| 壁纸模式 | `docs/wallpaper-mode.md` |
| 酷狗音源对接 | `docs/ku-go-api-docs.md` + `.dev-credentials/kugou.json` |
| QQ 音乐部署 | `docs/qq-music-deployment.md` |
| 模组规范（全量） | `mods/README.md`（47 KB，规范本体） |
| 模组契约类型 | `src/mods/folium/contract.ts` |
| 上游工作规则 | 根 `AGENTS.md` + `skills/*/SKILL.md`（11 个） |
| 我们的二开进度 | `docs/dev/CHANGELOG-RELEASE.md` |
| 用户偏好 | `docs/dev/USER.md` |

### 上游 skills（11 个，按需加载，别全读）

`codebase-navigation` · `testing-strategy` · `readme-reference` · `glossary-alignment`
`file-modularization` · `frontend-runtime-guardrails` · `reuse-project-utilities`
`settings-feature-integration` · `kugou-provider-alignment` · `online-song-omni-routing`
`prepare-folia-release`