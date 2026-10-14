# Folia 安卓版 — 技术方案

> **状态**：规划文档，2026-10-13 调研产出。尚未动手实现。
> 事实均来自本仓库源码 + 官方 Capacitor 文档 + Google Play 官方要求 + 官方示范仓库 `chthollyphile/folia-sonnet`。

---

## 结论先行

**不要移植 Electron。** Electron 从来没有 Android 支持（Electron Mobile 2015 年就废弃了，
从未产出过可用的 Android 运行时）。本仓库已经有一条现成的 Web 运行路线，作者在 README 里
明确推荐用它做移动端：

> 有一定技术的用户可以使用 **capacitor 将本项目的 web 版本打包成为可安装的安卓 apk**，
> 具体方法可参考示范仓库：[chthollyphile/folia-sonnet](https://github.com/chthollyphile/folia-sonnet)

所以路线是 **Web 构建 + Capacitor 壳**，不是重写。

---

## ⚠️ 目标要修正一处：「安卓 15+」和 Play 的要求不是一回事

Google Play **从 2026-08-31 起要求新应用和更新必须 target API 36**（Android 16）。
今天是 2026-10-13，**deadline 已经过去 42 天，低于 36 的上传会被直接拒收**。
延期申请窗口到 2026-11-01。

关键后果：

- 你想要的「兼容安卓 15+」在 **minSdk** 层面成立（`minSdk 24` 覆盖 Android 7.0+），
  但在 **targetSdk** 层面必须是 **36**，不是 35。
- **targetSdk 36 ⇒ 必须吃 Android 16 的强制 edge-to-edge**。
  Android 15（API 35）对 targetSdk 35+ 强制 edge-to-edge；
  Android 16（API 36）把 `windowOptOutEdgeToEdgeEnforcement` 的退避开关**彻底删掉了**，没有出口。
- Capacitor 官方明确**不支持自定义 target SDK**，每个大版本绑定一个：

  | Capacitor | targetSdk |
  | --- | --- |
  | 8.x | 36 |
  | 7.x | 35 |
  | 6.x | 34 |

  → **必须用 Capacitor 8，不能用 7**。用 7 就等于放弃 Play 上架。

---

## 官方示范仓库实测数据（`chthollyphile/folia-sonnet`）

这就是上游给移动端的参考实现，本质是 folia-major 的 fork + Capacitor。

**`capacitor.config.ts`**
```ts
appId: 'top.izuna.foliamajor',   // 与桌面版同一个 id
webDir: 'dist',
server: { androidScheme: 'https', hostname: 'localhost', cleartext: false },
plugins: {
  SplashScreen: { backgroundColor: '#09090b', ... },
  StatusBar: { overlaysWebView: true, style: 'LIGHT', backgroundColor: '#09090b' },
}
```
WebView 加载的是**打进 APK 的本地 `dist/`**（`https://localhost`），不是远程站点。

**`android/variables.gradle`**
```gradle
minSdkVersion = 24
compileSdkVersion = 36
targetSdkVersion = 36
androidxActivityVersion = '1.11.0'
androidxCoreVersion = '1.17.0'
androidxWebkitVersion = '1.14.0'
cordovaAndroidVersion = '14.0.1'
```

**`android/app/build.gradle`**
```gradle
compileSdk { version = release(36) { minorApiLevel = 1 } }   // 36.1
```
另外内置了 `keystore.properties` 可选发布签名机制。

**`MainActivity.java`** —— 空的，没有一行自定义代码：
```java
public class MainActivity extends BridgeActivity {}
```

**`AndroidManifest.xml`** —— **只有 `INTERNET` 一个权限**：

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

没有前台服务、没有 `FOREGROUND_SERVICE`、没有 `POST_NOTIFICATIONS`、没有 MediaSession。
`configChanges` 含 `orientation|screenSize|...|density`，旋转/折叠屏由前端自己处理，不重建 Activity。

> **这意味着官方示范是个「能显示界面」的壳，不是能当音乐 App 用的成品。**
> 后台播放这一块它没做。

---

## 🔴 阻塞项 A：`index.html` 的 CDN importmap 会让 APK 白屏

**这是源码里真实存在的坑，不是理论风险。**

`index.html` 第 17–31 行有一段 `<script type="importmap">`，把 6 个核心库全部映射到
Google 的 CDN：

```html
<script type="importmap">
{
  "imports": {
    "@google/genai":        "https://aistudiocdn.com/@google/genai@^1.30.0",
    "react":                "https://aistudiocdn.com/react@^19.2.0",
    "react-dom/":           "https://aistudiocdn.com/react-dom@^19.2.0/",
    "framer-motion":        "https://aistudiocdn.com/framer-motion@^12.23.24",
    "lucide-react":         "https://aistudiocdn.com/lucide-react@^0.554.0",
    "i18next":              "https://aistudiocdn.com/i18next@^25.6.3",
    "react-i18next":        "https://aistudiocdn.com/react-i18next@^16.3.5",
    "i18next-browser-languagedetector":
                            "https://aistudiocdn.com/i18next-browser-languagedetector@^8.2.0"
  }
}
</script>
```

这段是给 **Vercel 网页部署**用的（让网页版走 CDN 而不是自己打包）。但 Capacitor 的
WebView 加载的是打进 APK 的 `dist/`，**importmap 会被原样保留到产物 HTML**，于是运行时
浏览器依然优先按 importmap 去 CDN 拉包，后果：

1. **冷启动强依赖外网**，断网直接白屏；
2. `aistudiocdn.com` 在国内基本不可达，冷启动要等超时；
3. 版本和 `package.json` 对不上（importmap 里 `react ^19.2.0` / `framer-motion ^12.23.24` /
   `lucide-react ^0.554.0`，而 `package.json` 是 `^19.3.0` / `^13.4.3` / `^1.48.0`），
   网页版和桌面版跑的根本不是同一套库。

**处理方式**：Android 构建时必须剥离这段 importmap，让 vite 把这些依赖正常 bundle 进 `dist/`。
建议做成**条件式**，只影响 Android 构建，不要破坏网页版部署。

---

## 🔴 阻塞项 B：`viewport` 缺 `viewport-fit=cover`

`index.html` 第 5 行：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

没有 `viewport-fit=cover`，WebView 不会真正铺到安全区外，`env(safe-area-inset-*)`
拿到的是 0，edge-to-edge 适配无从谈起。必须改成：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

这行改动**同时影响网页版**，属于必要的兼容性修复（`viewport-fit=cover` 在桌面浏览器无副作用）。

---

## 本机环境实测（2026-10-13）

动手前已确认这台机器的条件，**不需要额外装任何东西**：

| 项 | 状态 | 说明 |
| --- | --- | --- |
| Node | **v24.15.0** ✅ | Capacitor 8 要求 ≥22；仓库 `.nvmrc` 也是 24 |
| npm | 11.12.1 ✅ | |
| Android Studio | **AI-261.25134.95** ✅ | `AndroidStudio2026.1.2`，满足「Otter 或更新」 |
| JDK | **JBR 21.0.10** ✅ | **系统 `java` 是 17，但 Studio 自带 JBR 是 21** |
| Android SDK | `C:\Users\wodes\AppData\Local\Android\Sdk` ✅ | |
| platform | **android-35 + android-36.1** ✅ | 正好匹配示范仓库的 `compileSdk 36.1` |
| build-tools | 34.0.0 + **36.1.0** ✅ | |
| 磁盘剩余 | 83.3 GB ✅ | 足够 `npm ci` |

> ⛔ **JDK 是个陷阱**：命令行 `java -version` 是 **17.0.12**，直接拿它跑 Gradle 会报
> `invalid source release: 21`。**必须把 `JAVA_HOME` 指向**
> `C:\Program Files\Android\Android Studio\jbr`，否则 Capacitor 8 编译必然失败。

> ⚠️ `ANDROID_HOME` / `ANDROID_SDK_ROOT` 两个环境变量当前都是**空的**，
> 构建脚本里必须显式设置，否则 Gradle 找不到 SDK。

---

## 🛠 构建期实测踩坑（2026-10-13，全部真踩过）

完整记录见 [`CHANGELOG-RELEASE.md`](CHANGELOG-RELEASE.md)，这里是速查。

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| `npm ci` 卡 14 分钟无进展 | electron 二进制从 GitHub 下，国内不可达 | `ELECTRON_SKIP_BINARY_DOWNLOAD=1`（**Android 构建根本不需要它**），26 秒装完 |
| 脚本在打印 `java -version` 时就崩 | `$ErrorActionPreference='Stop'` 把 native 命令的 **stderr** 当致命错误，而 `java -version` 正是写 stderr | 脚本内改 `'Continue'` + 显式判 `$LASTEXITCODE` |
| `cap sync` 报 **`android platform has not been added yet`**（而 `android/` 明明存在） | 脚本在 `docs\dev\`，`Split-Path -Parent $PSScriptRoot` **只退一级** → 跑到没有 `capacitor.config.ts` 的 `docs\` | 退**两级**，并在脚本开头断言 `capacitor.config.ts` 存在 |
| 同上，但 `cap add android` 退出码是 0 | `dist/` 缺失时 `cap add` **静默中断**，只生成半套模板（无 `capacitor.settings.gradle`） | **先 `vite build` 再 `cap add android`** |
| `Failed to find target with hash string 'android-36'` | 本机只有 `android-36.1`，纯数字 36 找不到平台 | `compileSdk { version = release(36) { minorApiLevel = 1 } }` |
| Gradle 下 `services.gradle.org` connect 超时 | 官方源不可达 | 换华为云镜像（276ms vs 超时），`networkTimeout` 提到 60000 |
| **Gradle 下 SDK 组件卡在 0 字节，日志却无报错** | AGP 要 `Platform 36 rev2`，Gradle 内置下载器卡死（疑似与本机 `HTTP_PROXY` 有关） | **手工 node fetch 同一 URL（1.7 秒 / 35 MB/s）+ `tar -xf` 解压**，别用 `Expand-Archive` |

> 💡 **通用教训**：遇到「看起来在跑但零进度」时，先分清是**哪一边的网络栈**。
> 这台机器上 node 的 `fetch` 一律正常（npm registry、dl.google.com 都是），
> 凡是 Java/Gradle 侧卡住的下载，都换手动下载。

### 一键构建

```powershell
powershell -ExecutionPolicy Bypass -File docs\dev\android-build.ps1
# 只重跑原生部分，不重打 web：加 -SkipWebBuild
# 出 release 包：加 -Release（需先配 android/keystore.properties）
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📦 当前进度（2026-10-13）

**✅ 已产出可安装 APK，14.41 MB**，`aapt2` 校验：`minSdk 24` / `targetSdk 36` /
label `Folia` / 内含 1871 个 `assets/public/*` web 资源条目。

**⚠️ 尚未真机验证**：能否安装启动、edge-to-edge 实际观感、WebGL 在移动 GPU 上的帧率与发热、
锁屏是否断播（预期会断）、音源能否连通。

下一步优先级见文末「已知未做」表 —— **后台播放是最大缺口**，不做就是个只能看的网页壳。

---

## 六个真实缺口（按工作量排序）

### 1. 🔴 后台播放 / 锁屏控制 —— 最大缺口

本项目播放链路是 `HTMLAudioElement` + **Web MediaSession API**
（`src/utils/mediaSessionSync.ts`，维护 `positionState` / `MediaMetadata` / action handler）。

- 在浏览器 / PWA 里这套是**能用的**（锁屏卡片、通知栏控制都正常）。
- **在 Android WebView 里 Web MediaSession 完全不生效** —— WebView 没有系统媒体会话集成。

后果：锁屏即断播、无通知栏控制、**耳机按键无响应**、无音频焦点处理
（来电 / 其他 App 抢播不处理）、无法做后台播放。

> 🚨 **「锁屏即断播」已被实测推翻（2026-10-15），不要再照这条做。**
> 真机实测：**音频在后台与锁屏状态是能继续播的** —— 缺的只是系统媒体会话（无通知栏卡片、
> 无耳机按键、无音频焦点）。另有一个此前没注意到的连带症状：**一首歌播完不会自动接下一首**，
> 因为 App 没有前台服务，进程被降级后 WebView 渲染进程主线程被节流，而自动切歌整条链路
> （`App.tsx` 的 `onEnded` → `handleNextTrack` → `setState` → React 提交换 `<audio src>`）
> 全在 JS 主线程上。
>
> ⚠️ 由此得出一条通用判读纪律：**「有声音」完全不能证明页面还在正常跑。**
> 音频解码与输出在独立线程上，不受主线程节流约束；JS 拿不到时间片是另一回事。
>
> 方案与根因分析见 [`BACKGROUND-PLAYBACK.md`](BACKGROUND-PLAYBACK.md)。

要做必须引入**原生实现**：

- 路线 A：Capacitor 原生插件 + AndroidX Media3/ExoPlayer + `MediaSessionService` 前台服务
  （可控但要写 Java/Kotlin，工作量最大）
- 路线 B：社区插件（`@capawesome/capacitor-native-audio` 之类）接一层，减少自写量
- 两种都需要在 Manifest 加 `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
  + `POST_NOTIFICATIONS`（Android 13+ 通知运行时权限）

**这是决定这个 App 好不好用的分水岭，不做的话它只是个能看的网页壳。**

### 2. 🔴 音源后端必须远端化

酷狗 / QQ / 网易云 的 API 都是 **Node 服务**：

- `kugoumusicapi` 在 `package.json` 里是指向 GitHub tarball 的依赖
- `electron/kugouApiBridge.cjs`、`qqBackend.cjs`、`neteaseBackend.cjs` 是主进程里起的 Node 服务

WebView 里**跑不了 Node**。所以音源必须：

- 部署到 **Vercel / Cloudflare Workers**（仓库有 `vercel.json`、`wrangler.jsonc`、`api-ts/`），
  或 **Docker Compose**（`deploy/docker/` 已有 backend + gateway + kugou + netease + qq 全栈）
- App 通过 `VITE_KUGOU_API_BASE` / `VITE_QQ_API_BASE` 等环境变量指向它

实测取环境变量的位置：`src/services/onlineMusic/kugouTransport.ts` 的 `getWebApiBase()`，
Web 模式读 `import.meta.env`，非 Web 模式读 `window.electron`。

⚠️ **上架 Play 的合规风险**：这些是第三方逆向接口。作者在 README 写了「仅供非营利使用」。
用这些音源上架商业化应用，风险在你这边。**上架前务必开 issue 跟作者确认。**

### 3. 🟠 本地音乐库在 Android 上不可用

`src/services/localMusicService.ts` + `localLibraryAvailability.ts` 依赖
**File System Access API**（`showDirectoryPicker`）做整库扫描和目录授权。

Android WebView **不实现这个 API** → 目录选择、整库扫描、封面读取全部失效。

替代：Capacitor Filesystem + MediaStore 查询插件，重写本地库导入流程。
这是独立的一块工作量，可以放到最后甚至先不做。

### 4. 🟠 edge-to-edge 适配（Android 15/16 强制，不做就视觉错乱）

targetSdk 36 下 WebView 一定画到状态栏和导航栏底下，必须处理 inset。

三个必要动作：

1. **`index.html` 加 `viewport-fit=cover`**
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
   ```
2. **CSS 用注入变量优先、`env()` 兜底**
   ```css
   .app-header {
     padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
   }
   ```
3. **Capacitor 必须 ≥ 8.3.2，建议 8.4.0+**
   - 8.3.0 起 SystemBars 用 `WindowInsetsCompat` 原生读取 inset 并注入 `--safe-area-inset-*`
   - 原因：Android WebView < 140 的 `env(safe-area-inset-*)` **有 bug，返回的值是错的**，
     注入变量是为了绕开它
   - 8.3.2 修掉 API ≤ 34 上多余的 view padding；8.4.0 补齐低版本 API 的变量注入并让
     `insetsHandling: "disable"` 真正生效

> ⚠️ **官方示范仓库里的 `StatusBar: { overlaysWebView: true, backgroundColor: ... }`
> 在 Android 16 上已经是 no-op**（依赖的 opt-out 通道被删了）。照抄那段配置在 Android 16
> 设备上不起作用，要改用 SystemBars + CSS 变量。

> 🚨 **上面第 2 条建议已被真机实测推翻（2026-10-14），不要再照它做。**
> 「CSS 用注入变量优先、`env()` 兜底」的前提是 `insetsHandling: 'css'` 真的会把 inset
> 注入成 CSS 变量。实测**不成立**：本机 WebView 是 138.0.7204.179，低于 Capacitor 源码里
> `WEBVIEW_VERSION_WITH_SAFE_AREA_FIX = 140` 的阈值，于是 `SystemBars.java` 的
> `initWindowInsetsListener()` 走 `else` 分支，给 decorView 加原生 `setPadding`，
> **再把 `--safe-area-inset-*` 强制写成 0**。也就是说 `'css'` 在 WebView < 140 上
> 既没给出真实 inset，又额外制造了 padding（播放页三侧白带）。
>
> 本项目最终做法：`insetsHandling: 'disable'`（listener 根本不注册 ⇒ 无 padding），
> 配合 targetSdk 36 的强制 edge-to-edge 得到真全屏。因为 `src/` 对 `safe-area` 零命中，
> 没有任何固定 UI 需要 inset，所以关掉是零代价。
> 完整证据与取舍见 `CHANGELOG-RELEASE.md` 的 `dev-2026-10-14-fullscreen-padding`。

### 5. 🟠 WebGL 性能与包体

- 14 个内建可视化模式，183 个 visualizer 模块，含 `three.js` / `pixi.js` / `@react-three/*`
- **已知坑**（`docs/dev/AGENTS.md` 有记）：`registry.tsx` 会 **eager 拉进全部 183 个模块**，
  连 store、同步 schema 都不该 import 它
- 桌面 GPU 上没事，移动 GPU 上首屏加载和发热是真问题
- 需要做 visualizer 的 **按需加载 / 分包**，并给动画加降级档位

### 6. 🟡 16 KB page size

Play 要求 targeting Android 15+ 的应用支持 16 KB page size
（NDK r27 起支持，旧 `.so` 全部要重编）。

Capacitor 的 WebView 壳本身不带预编译 `.so`，**风险只来自你后来引入的原生插件**。
装了带 `.so` 的插件后要用 16 KB 模拟器镜像验证。

---

## 桌面专属功能：在 Android 上直接砍掉

这些要么无意义、要么不可能实现，**不要试图移植**：

| 功能 | 为什么砍 |
| --- | --- |
| 壁纸模式 / windowtolayer | Windows 桌面贴窗，Android 无对应能力 |
| `folia-wallpaper-helper.exe` | Windows 专属 |
| Discord RPC | 移动端无意义 |
| 阻止系统休眠 | 移动端无意义 |
| 本地视频导出（ProRes 4444） | WebView 里没有 ffmpeg sidecar |
| Automix / htdemucs（Python sidecar + onnxruntime） | 移动端跑不动，且模型体积不可接受 |
| 跨应用文件授权（`modSystem/fileGrants`） | 桌面模型，移动端要用 Storage Access Framework 重做 |
| Folium 模组系统 | 依赖主进程 Node 运行时，`window.electron?.mods` 在 WebView 里为 undefined |

> 模组系统这条要特别说明：`src/mods/ipc.ts` 的注释写得很清楚 —— 每个调用在
> web build 上都会**降级为安全兜底**，UI 仍可渲染但显示 desktop-only 提示。
> 也就是说模组面板不会崩，只是不能真正工作。

---

## 实施路线

### 阶段 0：工具链（硬性版本要求）

| 项 | 版本 | 说明 |
| --- | --- | --- |
| Node | **22+** | Capacitor 8 CLI 声明 `engines.node >= 22`；本仓库 `.nvmrc` 是 24 |
| JDK | **21** | Capacitor 8 用 Java 21 编译，JDK 17 会报 `invalid source release: 21` |
| Android Studio | **Otter 或更新** | |
| AGP | 8.13.0 | |
| Gradle | 8.14.3 | |
| Android SDK | 36（compileSdk 用 36.1） | |
| Kotlin | 2.2.20（若用 Kotlin） | `kotlinOptions {}` 在 2.x 会报错，要改 `compilerOptions` |

### 阶段 1：Capacitor 骨架，跑通 Web 构建

```bash
npm i -D @capacitor/cli@^8.3.2
npm i @capacitor/core@^8.3.2 @capacitor/android@^8.3.2
npm i @capacitor/splash-screen @capacitor/status-bar
npx cap init
npx cap add android
npm run build      # vite build → dist/
npx cap sync android
```

对照 `folia-sonnet` 的 `capacitor.config.ts` 和 `variables.gradle` 对齐。

### 阶段 2：edge-to-edge 适配

`viewport-fit=cover` + SystemBars 配置 + inset CSS。**这一步做完在 Android 15/16 真机上
才算「视觉正确」**，否则顶栏标题被状态栏吃掉。

### 阶段 3：后台播放（决定成败）

原生 MediaSession + 前台服务。做完才有锁屏控制、耳机按键、后台不断播。

### 阶段 4：音源后端

部署 `deploy/docker/` 或 Vercel/Cloudflare，把 base URL 写进 App 配置。

### 阶段 5（可选）：本地音乐

MediaStore / Capacitor Filesystem 重做导入流程。

---

## 两条路，先选一条

| | **A. 侧载自用** | **B. 上架 Play** |
| --- | --- | --- |
| targetSdk | 可停在 35 或更低 | 必须 36 |
| edge-to-edge 强制 | 可规避 | 必须完整适配 |
| 签名 | 自签 debug/release 即可 | 需要正式 keystore |
| 16 KB page size | 不管 | 必须过 |
| 隐私政策 / Data Safety | 不需要 | 必须填 |
| 音源合规 | 自担 | 需作者确认授权 |
| 工作量 | **2–3 天出可用 APK** | **3–5 倍** |
| 适合 | 自己手机随时听歌 | 作品集 / 给别人用 |

### ⚠️ 反直觉的一点：侧载并不改变 targetSdk 的建议

容易以为「我不上架，targetSdk 可以随便设低，edge-to-edge 就不用管了」。**这是错的。**

`targetSdk` 是你在 `AndroidManifest` 里声明的值，它决定的是**你手机上的运行时行为**，
跟审核无关：

- 声明 **36** → Android 15/16 上强制 edge-to-edge，你必须适配；
- 声明 **35** → Android 15 上同样强制 edge-to-edge（API 35 起对 targetSdk 35+ 强制）；
- 声明 **≤34** → 才真正能躲开（opt-out 开关在 API 35/36 逐步收紧）。

但「躲开」的代价是：**得降到 Capacitor 6**（6.x 绑定 targetSdk 34），而 Capacitor 的
edge-to-edge 恰恰是 **8.3.0 才在框架层真正修好的**（8.3.0 前要靠第三方插件打补丁，
8.3.2/8.4.0 才补齐低版本 API 的 inset 注入）。也就是说：

> **为了躲几行 CSS 而降级到 Capacitor 6，踩的坑比省下的多。**

适配的真实成本就是 `viewport-fit=cover` + 每条边一行 `var(--safe-area-inset-*, env(...))`。
所以**结论仍然是 Capacitor 8 + targetSdk 36 + 老老实实适配**，侧载也一样。

侧载真正省掉的是这些（都跟运行时行为无关，只跟审核有关）：
不查 16 KB page size、不填隐私政策和 Data Safety、不用正式 keystore、不用处理音源授权。

---

## 法律约束（复用 `docs/dev/AGENTS.md` Iron Rule #3）

- 本项目是 **AGPL-3.0**（标准原文）。你的安卓版是衍生作品 → **必须整体 AGPL-3.0 开源**。
- **§13 网络条款**：如果 APK 连你自己的服务器（部署在阶段 4 几乎是必然的），
  你**必须把完整对应源码提供给那些通过网络使用它的人**。
  APK 本身是「网络交互客户端」，这条对分发场景要特别留意。
- README 的「仅供非营利」只在 README 不在 LICENSE，**法律约束力弱但代表作者意向**。
- **上架 Play 变现前先开 issue 确认**（`chthollyphile/folia-major`）。

---

## 参考

- Capacitor target SDK 矩阵：https://capacitor.ionicframework.com/docs/android/setting-target-sdk
- Capacitor 8 升级指南（edge-to-edge / SystemBars）：https://capgo.app/blog/upgrade-capacitor-app-to-capacitor-8
- Capacitor edge-to-edge 与 safe area 完整指南：https://capawesome.io/docs/blog/capacitor-edge-to-edge-and-safe-areas-guide/
- Google Play target API 要求：https://support.google.com/googleplay/android-developer/answer/11926878
- 官方示范仓库：https://github.com/chthollyphile/folia-sonnet
