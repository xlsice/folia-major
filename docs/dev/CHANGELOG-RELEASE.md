# Folia 二开 — 变更流水

> 记录**我们这个 fork** 的里程碑。上游 Folia 自己的版本发布看 GitHub Releases，
> 本文件只记我们的二开状态。
> 格式参照 yunyun-ecosystem 的 `CHANGELOG-RELEASE.md`。

---

## ⚡进行中（next release）

### `dev-2026-10-13-android` — 安卓版（Capacitor）工程落地

**性质**：新增平台工程，分支 `Android`（从 `67fb072a` 开出）
**路线**：侧载自用（非上架 Play）
**完整方案**：见 [`docs/dev/ANDROID.md`](ANDROID.md)

#### 路线决策

**不移植 Electron**，走 **Web 构建 + Capacitor 壳**。Electron 从无 Android 支持；
上游 README 自己就点名了这条路线并给了示范仓库 `chthollyphile/folia-sonnet`。
实测该仓库配置后发现：它 `variables.gradle` 与 `cap add android` 生成的模板**逐行一致**，
所以官方示范本质就是 `npx cap add android`。

**「安卓 15+」需要修正为 targetSdk 36**：Play 自 2026-08-31 起要求 API 36（已过期），
而 targetSdk 36 ⇒ 必须吃 Android 16 强制 edge-to-edge（opt-out 开关已被删除）。
Capacitor 官方不支持自定义 target SDK，8.x 绑定 36 ⇒ **必须 Capacitor 8，不能用 7**。

⚠️ **反直觉结论：侧载并不改变 targetSdk 建议。** targetSdk 决定的是手机上的**运行时行为**，
与审核无关；真要躲开 edge-to-edge 只能降到 targetSdk ≤34（即 Capacitor 6），而 Capacitor 的
edge-to-edge 恰恰 8.3.0 才在框架层修好 —— 为躲几行 CSS 而降级反而踩更多坑。

#### 本轮改动

**新增文件**

| 文件 | 作用 |
| --- | --- |
| `capacitor.config.ts` | Capacitor 配置。`appId` 沿用桌面版 `top.izuna.foliamajor`；WebView 加载 APK 内 `dist/`（`androidScheme: https` + `hostname: localhost`）；内置 `SystemBars` 设 `insetsHandling: 'css'` + `initialViewportFitValueHint: 'cover'` + `style: 'LIGHT'` |
| `dev/android/stripCdnImportmapPlugin.mjs` | Android 构建时剥离 CDN importmap（见下） |
| `docs/dev/android-build.ps1` | 构建脚本，固化 JDK/SDK 环境变量陷阱 |
| `docs/dev/ANDROID.md` | 完整技术方案（缺口清单、实施路线、法律约束） |
| `android/` | Capacitor 生成的原生工程 |

**上游文件改动（3 处，均有必要）**

1. **`index.html`** — `viewport` 加 `viewport-fit=cover`。
   edge-to-edge 的前提；桌面浏览器无副作用。已实测产出物含该属性。
2. **`index.html` + `dev/android/`** — 剥离 `aistudiocdn.com` 的 CDN importmap（见下）。
3. **`vite.config.ts`** — 注册上述插件（条件式，网页版构建行为不变）。
4. **`android/app/build.gradle`** — `compileSdk` 改用 `release(36) { minorApiLevel = 1 }`。
5. **`android/gradle/wrapper/gradle-wrapper.properties`** — 换华为云镜像 + 加大超时。

#### 🔴 阻塞项 A：CDN importmap 会让 APK 白屏

`index.html` 原有一段 importmap，把 `react` / `react-dom` / `framer-motion` /
`lucide-react` / `i18next` 等核心库全指向 `https://aistudiocdn.com/`（Google AI Studio 的 CDN）。
vite **不会移除它**，会原样保留到产物 HTML，于是运行时浏览器优先按 importmap 去 CDN 取包：

- 冷启动强依赖外网，**断网直接白屏**；
- 该域名国内基本不可达；
- 版本还和 `package.json` 对不上（importmap `react ^19.2.0` vs 实际 `^19.3.0`）。

**处理**：`stripCdnImportmapPlugin.mjs` 在 `VITE_ANDROID_BUILD=1` 时用
`transformIndexHtml`（`order: 'pre'`，早于 vite 内置处理）删掉该块，让依赖正常 bundle。
**已验证**：`dist/index.html` 无 importmap、整个 `dist/` 无 `aistudiocdn` 引用，
产物 1869 文件 / 19.0 MB。

#### 本机环境实测（无需额外安装）

| 项 | 状态 |
| --- | --- |
| Node v24.15.0 / npm 11.12.1 | ✅ |
| Android Studio AI-261.25134.95 | ✅ |
| **JBR 21.0.10** | ✅ |
| SDK platforms `android-35` + `android-36.1` | ✅ |
| build-tools 34.0.0 + 36.1.0 | ✅ |
| 磁盘剩余 83.3 GB | ✅ |

#### 本轮踩到的坑

- ⛔ **`npm ci` 会卡死在 electron 二进制下载**（GitHub，国内不可达，14 分钟无进展）。
  Android 构建根本不需要它 ⇒ 设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 后 **26 秒**装完。
  配合已热的 npm cache（1.68 GB），1170 个包秒级完成。
- ⛔ **PowerShell `$ErrorActionPreference='Stop'` 会把 native 命令的 stderr 当致命错误**。
  `java -version` 把版本号打到 stderr，脚本在打印工具链版本时就崩了。脚本内改用 `'Continue'`
  + 显式判 `$LASTEXITCODE`。
- ⛔ **`Split-Path -Parent $PSScriptRoot` 只退一级**。脚本在 `docs\dev\` 下，
  一次 `-Parent` 只到 `docs\`，导致 `npx cap` 在没有 `capacitor.config.ts` 的目录运行，
  报出极具误导性的 **`android platform has not been added yet`**（而 `android/` 明明存在）。
  必须退两级，并在脚本开头断言 `capacitor.config.ts` 存在。
- ⛔ **`cap add android` 在 `dist/` 缺失时会静默中断**，只生成半套模板：
  没有 `capacitor.settings.gradle`、`capacitor.build.gradle`、`assets/public`，
  但退出码仍是 0。**必须先 `vite build` 出 `dist/` 再 `cap add android`**，
  否则后续 `cap sync` 会一直报 "platform has not been added"。
- ⛔ **`services.gradle.org` 官方源连不上**（实测 connect 10s 超时）。
  华为云镜像 276ms、腾讯云 523ms 返回同一份 137 MB zip ⇒ 换镜像并把
  `networkTimeout` 从 10000 提到 60000。
  （Maven 侧 `dl.google.com` 实测 433ms 可达，故未改 `build.gradle` 的仓库。）
- ⛔ **`compileSdkVersion = 36` 在本机不可用**：SDK 只装了 `android-36.1`，
  纯数字 36 会报 `Failed to find target with hash string 'android-36'`。
- ⛔ **`-all.zip` 换成 `-bin.zip`**：wrapper 默认下 `-all`（含源码与文档），体积约两倍。
- ⛔ **Gradle 内置的 SDK 包下载器会卡死，但同一 URL 用 node 下只要 1.7 秒**。
  AGP 要 `Android SDK Platform 36 (revision 2)`，Gradle 下的 `platform-36_r02.zip`
  **卡在 0 字节**（83 秒零增长，日志却没报错，看起来像在正常干活）。
  手工用 node `fetch` 下同一个 URL：**62.8 MB / 1.7 秒 / 35 MB/s**，
  再用 `tar -xf`（**别用 `Expand-Archive`，1 万多个条目会慢到不可用**）解进
  `Sdk\platforms\`（7.9 秒），构建立刻通过。
  ⚠️ 本机存在 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量，疑似是 Gradle 下载器卡住的原因；
  node 的 fetch 不受影响。**遇到 Gradle 要下 SDK 组件时，直接手动下。**
- ⚠️ 环境变量里已有 `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY`（来自 JetBrains 系工具链），
  Java 侧走代理，node 侧不走 —— **排查下载卡死时先分清是哪一边的网络栈**。

#### 产出

**✅ 可安装 APK 已产出**

```
android/app/build/outputs/apk/debug/app-debug.apk        14.41 MB
C:\Users\wodes\XLS\APP\Folia-Android\Folia-Android-debug-0.7.18.apk   （归档副本）
```

`aapt2 dump badging` 实测校验：

| 项 | 值 |
| --- | --- |
| package | `top.izuna.foliamajor` |
| **minSdkVersion** | **24**（Android 7.0+） |
| **targetSdkVersion** | **36**（Android 16，对齐 Play 现行要求） |
| compileSdkVersion | 36 |
| application-label | `Folia` |
| 权限 | `INTERNET` + Capacitor 自动加的 `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` |
| 内含 web 资源 | **1871 个 `assets/public/*` 条目**（`index.html` + 本地 bundle 的 `bootstrap-*.js`） |

⚠️ **真机实测已完成（2026-10-13 23:17，一加 Ace 3 / Android 16）**

| 项 | 结果 |
| --- | --- |
| 设备 | OnePlus **PJE110**（一加 Ace 3），Android **16**（SDK 36），arm64-v8a，1264×2780 @ 560dpi |
| 配对方式 | Android 11+ 无线调试：`adb pair 192.168.0.100:38857 <码>`，之后 adb **自动经 mDNS 发现并连接**，无需手动 `connect` |
| 安装 | `adb install -r -g`，14.41 MB / **11 秒**，`Success` |
| 启动 | `topResumedActivity = top.izuna.foliamajor/.MainActivity`，**进程存活且在前台** |
| 渲染 | ✅ **不是白屏**，中文正常显示，界面完整渲染 |
| JS 运行时 | ✅ **零 JS 错误、零网络失败**（logcat 无 Uncaught/TypeError/net::ERR） |
| 内存 | TOTAL PSS **约 203 MB**（RSS 420 MB）—— 偏高，见下 |

#### 实测确认的三条硬结论

1. **✅ Web MediaSession 在 WebView 里确实不生效**（缺口 1 坐实）。
   `adb shell dumpsys media_session` 输出里**完全搜不到 `foliamajor`**。
   没有任何系统媒体会话注册 ⇒ 锁屏断播、无通知栏控制、耳机按键无响应，属预期行为。

2. **⚠️ 这台机器的 WebView 是 138.0.7204.179（< 140）** —— 正好落在 Capacitor 源码里
   标注 `WEBVIEW_VERSION_WITH_SAFE_AREA_FIX = 140` 的阈值之下。
   也就是说 **`env(safe-area-inset-*)` 在这台机器上返回的值不可信**，
   必须靠 `insetsHandling: 'css'` 注入的 `--safe-area-inset-*`。这个配置不是可选项。

3. **❌ 布局完全没适配移动端 —— 竖屏横屏都不行**（本次实测最重要的发现）。
   侧边栏（书库/歌单/电台/专辑/本地）在手机竖屏被压成一条窄带、中文字**一字一行竖排**、
   左右大片空白；切横屏（794dp × 361dp）后**依旧不变**。
   → 这是**上游 Folia 自身没有移动端布局**，不是 Capacitor 打包引入的问题。
   桌面版布局假设宽屏，直接塞进 WebView 就会这样。
   ⇒ 若要让安卓版真正可用，**移动端布局是必须做的二开工作量**，优先级应排在
   后台播放之前（布局不可用 = 用户根本用不了；布局可用但不能后台播放 = 能用但体验差）。

#### 附带观察

- **当前并非 edge-to-edge**：顶部状态栏是系统浅色底 + 深色图标，WebView 内容从状态栏
  下方开始。**好处是没有内容被遮挡，暂时不需要做 inset 适配**；代价是歌词动画无法铺满全屏，
  不够沉浸。若后续要做沉浸式，需要主动改成 edge-to-edge 并处理 inset。
- 内存 PSS 约 203 MB 偏高，与 `registry.tsx` eager 拉入 183 个 visualizer 模块
  （含 three.js / pixi.js）的已知问题吻合，后续应做按需加载。

#### 已知未做（按优先级）

| 优先级 | 项 | 说明 |
| --- | --- | --- |
| 🔴 | **后台播放 / 锁屏控制** | 最大缺口。本项目是 `HTMLAudioElement` + Web MediaSession（`src/utils/mediaSessionSync.ts`），**在 WebView 里 MediaSession 完全不生效** ⇒ 锁屏断播、无通知栏控制、耳机按键无响应、无音频焦点处理。必须写原生 Media3/ExoPlayer + `MediaSessionService` 前台服务。官方示范仓库也没做（Manifest 只有 `INTERNET` 一个权限） |
| 🔴 | **音源后端** | 酷狗/QQ/网易云是 Node 服务，WebView 跑不了。需部署 `deploy/docker/` 或 Vercel/Cloudflare，App 用 `VITE_*_API_BASE` 指向 |
| 🟠 | **edge-to-edge inset CSS** | `insetsHandling: 'css'` 已配好并会注入 `--safe-area-inset-*`，但**具体哪些固定 UI 元素要加 inset 需真机验证后再改**。`src/` 目前 `safe-area` 零命中。不盲改，避免破坏桌面布局 |
| 🟠 | **本地音乐库** | 依赖 `showDirectoryPicker`（File System Access API），Android WebView 不实现 ⇒ 目录授权/整库扫描/封面全失效 |
| 🟡 | **16 KB page size** | Capacitor 壳无预编译 `.so`；侧载不查，但日后上架要验 |
| 🟡 | **visualizer 按需加载** | 183 个 visualizer 模块（含 three.js）被 `registry.tsx` eager 拉入，移动 GPU 上首屏与发热待实测 |

**桌面专属功能直接不移植**：壁纸贴窗 / windowtolayer / Discord RPC / 阻止休眠 /
本地视频导出 / Automix(htdemucs+onnxruntime) / Folium 模组系统（依赖主进程 Node 运行时）。

### `dev-2026-10-13` — 环境就位与摸底（尚无功能改动）

**性质**：基础设施/调研，无 semver tag

#### 已完成

- **仓库落地**：`chthollyphile/folia-major` clone 到
  `C:\Users\wodes\XLS\Pro\DevPro\folia-major`
  - 基线 `67fb072a`（main，2026-10-13）
  - 213.2 MB / 2446 commits
  - ⚠️ 尚未执行 `npm ci`，没有 `node_modules`
- **官方桌面版安装**：v0.7.18（2026-10-11 发布）
  - 位置 `C:\Users\wodes\AppData\Local\Programs\Folia`（490.9 MB / 85 文件）
  - per-user 安装，无 UAC，卸载程序齐全
  - 完整性验证：SHA512 + 文件大小双重比对官方 `latest.yml`，**逐字节一致**
  - 安装包未数字签名（`NotSigned`），Defender 全程未拦截
- **许可与开源范围核实**（结论见下）
- **Folium 模组系统实测**：`k3panel` 官方样例已装并验证可用
- **文档体系建立**：`docs/dev/` 三件套

#### 许可与开源范围（已核实，非推测）

| 项 | 结论 | 依据 |
| --- | --- | --- |
| 协议 | **标准 AGPL-3.0**，无附加条款 | LICENSE 原文 34523 字符，逐字比对无额外限制段落 |
| 开源范围 | **完整开源，含服务端** | `src/` `electron/` `api/` `api-ts/` `worker/` `sync-server/` 全在仓库 |
| 桌面主进程 | 明文 `.cjs` 源码，无混淆 | 33 个文件，`main.cjs` 单文件 252 KB |
| 音源后端 | 全部为公开开源包，写在 `package.json` | 见下表 |
| Android 版 | **官方没有 APK** | Releases 无 `.apk`/`.ipa`；README 明确走 Web+PWA |

音源后端依赖（npm registry 权威查证）：

| 包 | 版本 | 许可证 |
| --- | --- | --- |
| `@neteasecloudmusicapienhanced/api`（网易云） | 4.41.1 | MIT |
| `@yakult-green-tea/qq-music-api` | 3.2.0 | MIT |
| `kugoumusicapi`（引 GitHub tag v1.6.0） | 1.6.0 | MIT |
| `bodian-music-api`（波点） | 0.1.2 | **AGPL-3.0** |

⚠️ `folia-sonnet`（作者自建的 Android 打包示范）README 里那句"不包含内置的在线音乐后端"
**只针对该仓库的 APK 构建产物**，不是说主仓库闭源。真实原因是浏览器端跑不了 Node 服务，
必须把 API 部署到服务器 —— 是架构限制，不是授权限制。

#### 二开必须遵守的许可约束

1. 衍生作品同样 **AGPL-3.0 整体开源**
2. **§13 网络条款**：部署到服务器经网络供人使用修改版，必须向使用者提供完整对应源码
3. 上游 README 另声明"仅供非营利"——该句**不在 LICENSE**，属作者意向声明，
   **商用意图必须先开 issue 确认**

#### 扩展面盘点（写模组/改码前必读）

`src/mods/folium/registries/` 下 12 个注册表：

- **稳定可用**：`tunings` `visualizers` `visualizerRender` `backgrounds` `styles`
  `commands` `progress` `playerPanelTabs` `settingsSections` `stageLayers`
  `stageLayerView`，以及歌词解析（1.4 起）
- **🚫 禁止**：`omniProviders`（实验性，作者明确警告 v2 前不要做完整音源模组）

内建可视化模式 14 个：`cadenza` `cappella` `claddagh` `classic`(默认) `diorama`
`fume` `lumiere` `monet` `partita` `pendolo` `sonnet`(=商籁) `still` `tempera` `tilt`

#### 本轮踩到的坑（已进 `AGENTS.md`）

- ⛔ 切可视化模式**只有 Ctrl+K 命令面板**一条路，设置页里没有模式选择器
- ⛔ tuning 面板只在**对应模式的「歌词动画」tab 底部**，「通用」tab 里没有
- ⛔ tuning 默认值 `1.0` = 原版效果，不拖滑杆看不出任何变化
- ⛔ 音源模块打进 `app.asar` 而非 `app.asar.unpacked`，查错地方会以为没打包
- ⛔ electron-builder 默认安装目录用 `productName` 而非 `appId`
- ⛔ electron-builder `latest.yml` 的 sha512 是 **base64 不是 hex**

#### 待决

- **二开路线未选**：Folium 模组 vs fork 主仓。等雪冷水表态。
- **手机端方案未选**：自托管 Web + PWA vs Capacitor 自打 APK
- **`npm ci` 未执行**：磁盘余量仅 49.8 GB，构建前需先清理

---

## 📦 历史归档

（暂无。二开功能改动从下一条开始。）

---

## 格式约定

```markdown
### `dev-YYYY-MM-DD` — 一句话标题 (类别, 有无 semver tag)

**性质**：功能 / BUG fix / 基础设施

#### 变更
- 具体做了什么，影响哪些文件

#### 验证
- 怎么确认它真的работает（不是"应该没问题"）

#### 踩坑
- 这一版过程中发现的新坑，同步进了 AGENTS.md 的哪一节
```

**规则**：不记流水账。一次里程碑一条，写清楚**改了什么 / 怎么验证的 / 踩了什么坑**。
上游 commit 不逐条转记，需要对照时直接 `git log`。