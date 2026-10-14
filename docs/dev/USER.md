# Folia 二开 — 用户档案与协作偏好

> 这份文件给未来的 Agent/人看，回答"跟雪冷水（ShimoRay）协作时该怎么做"。
> 硬性偏好标记为 **违反即重做**。
> 最后更新：2026-10-13

---

## 身份

- **中文名**：雪冷水　**拉丁署名**：LianYinSu
- 色彩基准屏：27" 联想来酷 **Lecoo N2721Q**（Fast-IPS 2560×1440 180Hz 300nit）
- 审美风格：**暗色电影感** —— 近黑底 + 霓虹渐变 + 胶片颗粒，中英双语混排
- 兄弟机：内网笔记本 `192.168.0.109`（Dell Inspiron 15 3511，已刷 Win11）

---

## 这次的任务背景

他要做 **Folia 的二次开发**。动机很明确：这东西的核心卖点是全屏歌词动画，
跟他自己那套「文字 PV」创作方向是同一件事——他在 2026-10-03 做过一支 3 分钟
动态设计作品集短片（《叶》96 小节 / 128BPM / 9 场），Folia 正好是那个方向的现成引擎。

**所以这不是"玩一个开源软件"，是"找一个和自己手艺同源的系统来改造"。**
给他出主意时可以直接往视觉语言和工程实现上谈，不用铺垫"什么是开源软件"。

---

## 协作风格（硬性偏好，违反即重做）

### 🔴 参考作品一律「拆方法重建」，不是「拿素材」

他发一个别人的作品/教程链接说"照着做一张 X"，默认意思**永远是拆出方法自己重建**。
不要先花一轮做版权劝退（实测踩过：白花一整轮，他回"实际上我是想说他右边那个位置
我们不在这放文字"，证明从头到尾就是重建）。

- ✅ 直接走：**提取可复用要素 → 用自己的素材重建**
- ✅ 配色数值、技法思路可放心复用（不受著作权保护）
- 🚫 拦他的只有画面像素本身和里面的角色
- 🚫 只有他**明确说**要直接用原图时才谈授权/署名

### 🔴 结论先行

回答先给结论，再给证据。他讨厌先铺三段背景再进正题。

### 🔴 少问细节，按推荐默认走

三选一的题他基本都选推荐项。所以：能自己判断的直接判断，别抛一堆选项回去。
真的阻塞时才用 `ask_user`，一次问完，别挤牙膏。

### 🔴 汇报要诚实，失败就说失败

- 说了"装好了"就要有验证依据；**我自己的脚本 bug 导致误判时要主动纠正**
- 不要把"工具返回成功"说成"任务完成"
- 实测过 / 没验证过，要分清楚说

### 🔴 每次编译成功就 commit，不用每次问

2026-10-13 他明确授权的节奏：

- **每次构建/编译跑通就立刻提一个 commit**，APK / web / desktop 任一出包都算。
- 不需要每次停下来征求同意（他明确否掉了"只在完整功能落地时提"的选项）。
- 仍然**不要自动 push** —— 只在他明确要求时推，且遵守 feature-branch 规则。
- **只提本次改动**，不夹带无关文件。
- commit message 要写清三件事：**为什么这么选 / 实测数据 / 已知未做项**。
  他会当文档看，别只写一句 "fix stuff"。

---

## Git 身份与提交约定

| 项 | 值 |
| --- | --- |
| 提交身份 | **雪冷水 `<shimoray@163.com>`** |
| 配置范围 | **仓库本地**（`git config --local`），全局配置保持为空，不影响他其他项目 |
| 工作流 | feature-branch，从 `main` 开分支 |
| 推送 | **只推自己的分支**，🚫 绝不 `git push origin main` |
| 合并时机 | **由他决定**，不要替他合 |

⚠️ 2026-10-13 之前本仓库没有配 git 身份，第一次 commit 会报
`Author identity unknown`。已在 `Android` 分支上配好本地身份。

---

## 文件组织偏好

- 常用目录：`C:\Users\wodes\XLS\`（APP 放软件，Pro 放项目，Pro\DevPro 放开发仓库）
- 应用统一装在 `XLS\APP\<名>\`，安装包也留在那（方便重装/校验）
- 开发仓库放 `XLS\Pro\DevPro\<仓库名>\`
- 文档用中文写
- 看到 `.claude`、`.workbuddy`、`.idea`、`.vscode` 等工具目录并存 → 说明他**同时用多个
  AI 编码工具**，不要假设只有一个工作流

---

## 当前关注（2026-10-13 深夜快照：能播了 + 沉浸式已做）

1. **Folia 安卓版** —— 主线，已装在他的一加 Ace 3 上实测。
   `Android` 分支，Capacitor 8.5.3，APK **15.6 MB**（minSdk 24 / targetSdk 36）。
   **已达成**：沉浸式全屏（状态栏 + 手势导航条隐藏）、窄屏缝宽度 bug 修复、
   **网易云扫码登录可用（二维码真的渲染出来了）**、
   **新增第四套 library suite「netease」= 手机版网易云布局，已真机验证**。
   归档 `C:\Users\wodes\AppData\Local\Folia-Android\` 旁的
   `C:\Users\wodes\XLS\APP\Folia-Android\Folia-Android-debug-0.7.18.apk`。
   **2026-10-14 更新**：推荐墙已真出数据（35 张封面 / 每日推荐 33 首），
   宿主浮条与套件标签栏的**压叠**已修（真机 adb 截图确认）。
   **再更新**：**「点开歌单不显示内容」已修复并真机验证**——这是两个叠在一起的独立 bug
   （描述符漏必填 `source` 被静默降级成空资源 + 集合层没抬 z-index 被宿主 `z-[49]` 底板盖死），
   现在点推荐歌单卡能出 **185 首真实歌曲**，每日推荐 33 首，私人 FM 直接播，行内「⋯」菜单与歌手页全通。
1.5. **⚠️ 集合页必须自己抬 z-index**（写任何新套件的集合/歌手页都会再踩）：
   集合层挂在首页 `absolute inset-0 z-10` 里，宿主转场背景板 `GridViewOverlayHost.tsx:654` 是它的
   **兄弟节点**且 `z-[49]` 不透明 —— 不自带 `z-[110]` + `data-library-surface` 就会被盖死。
   **因为底板 `pointer-events-none`，点击能穿透、DOM 全对，只有视觉空白**，
   靠 DOM / 命中测试查不出来，只能靠 adb 真截图的字节数（34 KB vs 559 KB）。
   契约依据在 `grid/transitions/morphGeometry.ts:135-141` 注释。详见 AGENTS.md。
1.6. **⚠️ 别用 `as` 强转拼 `onOpenGridView` 的描述符**：`source` 是必填字段，
   漏了会被 `createCollectionResource.ts:44-47` 静默降级成空的静态资源，
   一条请求都不发，详情页永远「0 首」。走 `homeResources.actions.openOnlineCard`。
2. **⚠️ `docs/dev/android-build.ps1` 只打包不装机** —— 每次装机后必须自己核对：
   `adb shell dumpsys package top.izuna.foliamajor | Select-String lastUpdateTime`，
   时间戳早于 APK 的 `LastWriteTime` 就是没装上（我因此把一个未验证的改动当成「已实测」汇报过）。
   装完还要清 Service Worker，否则仍跑旧 chunk。
3. **⚠️ 切库内界面不用重装**：设置 → 选项 → 「播放进入视图」下面选**网易云布局**，
   或 **Ctrl+K** → 搜「资料库界面」。切的是 localStorage `library_suite`，
   存的是**裸字符串** `netease`（不是 JSON `"netease"`），写错会静默回退到网格。
4. **网易云布局套装的配色跟着主题走**：从 `theme` 推 `--nt-*` 变量，
   组件里不写死色值（用户明确要求：别弄成固定配色）。
   真机实测浅色/暗色两套变量全部正确，`onAccent` 会自动反色保对比度。
   改动它时**别在组件里加硬编码色**，加到 `src/library/suites/netease/neteaseTheme.ts`。
5. **⚠️ 音源部署在别处，不在本机**（2026-10-14 用户澄清，我曾误以为是本机 `ncm-api.ps1` 起的那个）。
   排查「列表空 / 加载失败」类问题前，**先读 `docs/dev/NETWORK.md`**，
   不要在本机找服务、也不要启动 `ncm-api.ps1` 来"修"问题。
   典型症状：控制台 `[QQMusic] Search failed: SyntaxError: Unexpected token '<'`
   （后端返回的是 HTML 错误页而非 JSON），此时先怀疑音源不可达，而不是界面坏了。
6. **后台播放 —— 现在是最大缺口**。`dumpsys media_session` 实测搜不到 `foliamajor`
   ⇒ 锁屏断播、耳机按键无响应。要写原生 Media3/ExoPlayer + `MediaSessionService`。
6.5. **✅ 杜比音效问题已修（2026-10-14，待他听感确认）**。根因**不是**音频 API：
   Folia 本来就在 AudioTrack 上，但 `new AudioContext()` 默认 `latencyHint:'interactive'`
   让 baseLatency 只有 4ms，Chromium 把流分到了 **FastMixer 快线程（`F` 前缀）**，
   而 FastMixer「绕过部分处理」＝绕过 Dolby 效果链。改成 `latencyHint:'playback'` 后
   `F` 前缀消失、latency 29t→225.62t，三项指标对齐网易云音乐。
   ⚠️ **下次别再让他「换 AudioTrack」**——已经在了。**只认 `F` 前缀**，别看流格式。
   ⚠️ 听感我没验过，需要他自己 A/B 一下才知道音效是不是真回来了。
7. **迷你播放条还没接真实播放状态** —— `NeteaseMiniPlayer` 的 `onTogglePlayback` 已接，
   但契约的 home props 里没有 `isPlaying` 字段，图标恒为「播放」。要读 `usePlaybackStore`。
   右侧「队列」按钮目前只弹 `onStatusMessage` 提示，没接真实队列面板。**用户说了本轮不做。**
7.5. **宿主胶囊浮条在歌单页 / 歌手页仍盖住列表底部若干行**（`00:00 —— 03:50` 压住第 8/9 行附近）。
   **这是刻意的，不是漏修**：上一条让它位时把「浏览深度 > 0」排除在外了——
   那几屏没有 netease 迷你播放条，关掉浮条就没有播放入口。属用户本轮明确不处理的播放条细节。
8. **QQ / 酷狗音源还没通** —— `.env.local` 只配了网易云。那两个平台仍报 `*_API_BASE_MISSING`，
   且酷狗没有现成的本地包（`api-ts/` 里没有），要另外解决。
9. **旋转适配** —— 按他要求本轮不做。转屏后缝会被挤出屏幕自动收起，点边缘标签能唤回。
10. **Android 侧还有一个 404**：`https://api.amll.dev/v1/lyrics/get` 返回 404（逐字歌词 provider）。
   与本次改动无关，是既有现象。要查歌词接口可用性时留意它。
> ⚠️ **别再凭截图断言「没做移动端适配」**。上一轮就是这么误判的（详见 CHANGELOG
> `dev-2026-10-13-seam-viewport`）：竖排与居中都是上游设计意图，真 bug 是量纲混用。
> 判断 UI 适配问题**必须读代码 + 用 CDP 量真实尺寸**。

---

## 技术栈与基础设施

| 项 | 情况 |
| --- | --- |
| 主力 | TypeScript + React + Vite + Electron（本仓库） |
| 桌面端 | Windows 11，per-user 安装习惯，免 UAC |
| 内网机器 | `192.168.0.109`，可用 SSH（`notebook-ssh` skill） |
| 视频管线 | ffmpeg + numpy 逐帧后期（他自建，见 agent memory） |
| 包管理 | npm / pnpm，Node 20+（实际 v24.15.0） |
| Git | feature-branch 工作流，**只推自己的分支**；仓库本地身份 `雪冷水 <shimoray@163.com>` |
| 安卓构建 | Capacitor **8.5.3**，Node 22+ / JDK 21 / AGP 8.13 / Gradle 8.14.3 / SDK 36.1<br>一键脚本：`docs\dev\android-build.ps1` |

---

## 给石墨的速记

如果你就是雪冷水本人，这段是给你自己看的：

- Folia 的调参面板藏在**当前模式的歌词动画 tab 底部**，不是设置主页面
- 切模式只有 **Ctrl+K 命令面板**一条路，别去设置里翻
- 滑杆默认 1.0 = 原版，不动看不出变化 —— 装的模组"没效果"基本都是这个原因
- 要做自己的视觉主题，优先看 `src/mods/folium/registries/visualizers.tsx`，
  能注册**完整新模式**，不用 fork
- 磁盘 2026-10-13 实测剩 **83.3 GB**（`.minimax/sessions` 一个目录就 42.5 GB），
  但它会波动，**规划容量前现场重测**别用旧数字
- `npm ci` 必须带 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，否则卡死在 electron 二进制下载
  （安卓构建根本不需要那个二进制）
- 安卓构建的 JDK 陷阱：命令行 `java` 是 **17**，Capacitor 8 要 **21**，
  须把 `JAVA_HOME` 指向 `C:\Program Files\Android\Android Studio\jbr`

---

## 文档双写职责（强制）

改动落地时**同时**更新这两份，不要只改一份：

| 改了什么 | 同步到 |
| --- | --- |
| 新增/改动了扩展点、注册表、模式 | `docs/dev/AGENTS.md` 的「扩展点地图」 |
| 踩了新的坑 | `docs/dev/AGENTS.md` 的「Gotchas agents get wrong」 |
| 环境事实变了（版本、路径、磁盘） | 本文件「部署事实」段 + `AGENTS.md` 顶部快照 |
| 完成了二开的一个里程碑 | `docs/dev/CHANGELOG-RELEASE.md` |
| 协作偏好变了 | 本文件 |

**触发时机**：每次提交前自问"这次改动会产生新的坑吗/新的能力吗"，是就写。
不要攒到月底补。