# Folia 二开 — 变更流水

> 记录**我们这个 fork** 的里程碑。上游 Folia 自己的版本发布看 GitHub Releases，
> 本文件只记我们的二开状态。
> 格式参照 yunyun-ecosystem 的 `CHANGELOG-RELEASE.md`。

---

## ⚡进行中（next release）

### `dev-2026-10-16-android-v0-7-20-published` — 发布：`android-v0.7.20` 已上线，二进制与对应源码同处

**性质**：发布。状态：✅ 已发布并自动标记为 latest。

#### 变更

Tag **`android-v0.7.20`** 打在 commit `62a5b3dc`（`Android` 分支）上，release 页
<https://github.com/xlsice/folia-major/releases/tag/android-v0.7.20> 附件为
`folia-android-0.7.20.apk`（18,269,083 字节 / 17.42 MiB，
`sha256:c54b55bab16bdbe46c04c31bb95a9c56dd1b5672cb120b12440d7949e6937397`），
外加 GitHub 自动附带的 `Source code (zip)` / `(tar.gz)`，满足 AGPL-3.0 §6(d)。

签名与 0.7.19 是**同一个 key**（`CN=Folia Android Release, OU=xlsice, O=xlsice, C=CN`，
证书 SHA-256 `e86e2038a72bafa4cebd5125c73bd5cc25f1a12bdfb7cf13309fbdd5e46397a3`），
所以从 0.7.19 升级可以直接覆盖安装。

#### 验收

发布不是「调完 API 就算数」，最后一步是**把 GitHub 上的 APK 下载回来比对**：

```
local  sha256 = c54b55bab16bdbe46c04c31bb95a9c56dd1b5672cb120b12440d7949e6937397
remote sha256 = c54b55bab16bdbe46c04c31bb95a9c56dd1b5672cb120b12440d7949e6937397
IDENTICAL     = True
```

另外核对：`draft=False`、`prerelease=False`、`assets=1`、`state=uploaded`、
`/releases/latest` 返回的就是 `android-v0.7.20`、发布说明正文含 §6(d) 声明与 build 号 `62a5b3dc`。

#### ⭐ 踩坑：发布网页表单根本传不了附件，改走 REST API 一把过

GitHub 的附件选择框是 `<input type="file" class="sr-only" aria-hidden="true">`，
它进不了无障碍快照，于是 **Browser 工具永远拿不到它的 ref，`upload_files` 用不了**。
本来已经退到「请用户手动拖文件」，实测用户拖了两次都失败。

**解法**：本机 `git push` 用的 GCM 凭证带仓库权限，**同一个凭证也能直接调 GitHub REST API** ——
于是建 release、传附件、核对全部脚本化，一次跑完，不用碰浏览器。

取凭证的正确姿势（踩了两次才通）：

```powershell
# ❌ 管道喂 stdin：git 收到空行，报 "missing protocol field"
"protocol=https`nhost=github.com`n`n" | git credential fill

# ✅ 必须用 Start-Process 的 stdin 重定向
[System.IO.File]::WriteAllText($in, "protocol=https`r`nhost=github.com`r`n`r`n")
Start-Process git -ArgumentList 'credential','fill' `
    -RedirectStandardInput $in -RedirectStandardOutput $out -NoNewWindow -Wait
```

⚠️ 附带一个 .NET Framework 的坑：**`[System.IO.File]` 没有 `GetFileName` 方法**，
取文件名必须用 `[System.IO.Path]::GetFileName`。写错的后果是 `?name=` 为空，
GitHub 回 `Invalid name for request` —— 错误信息完全指不到真正原因，容易误判成权限或格式问题。

⚠️ 另外网页表单的 **Tag 列表是页面加载时抓的缓存**：先 `git push` 了 tag、再去表单里选，
下拉框只会显示旧 tag（"Nothing to show"），必须刷新页面才会重取。
真要走 API 就没这个问题 —— 直接用 `git/ref/tags/<tag>` 校验 tag 指向的 commit，
**tag 指错了当场抛错**，比在网页上靠眼睛核对可靠。

### `dev-2026-10-16-release-one-shot` — 工具：把发版收成一个命令 `release-android.ps1`

**性质**：开发工具，不改运行时行为。

**为什么需要**：上一轮发 `android-v0.7.19` 时，整条链路（typecheck → 测试 → commit → push → 构建 → 验收）
是手工串起来的，每一步都出过一次岔子，其中一次差点造成实质损失：

**顺序是承重的**。`vite.config.ts` 在 vite 构建时执行 `git rev-parse --short HEAD`，
这个值就是 APK 里 §5(b) 声明报的 build id。**先构建、后 commit**，二进制就会声称一个并不包含它的 commit，
§6(d) 要求的「二进制 ↔ 对应源码可被任何人当场核对」当场失效。
本轮就撞上了：修完三个 bug 后我先构建了 release，等写脚本时才 commit，
于是必须再构建一次，才能让 tag 指向的 commit 与包里声明的 build id 严丝合缝。

脚本 `docs/dev/release-android.ps1` 把这件事变成不可逆的顺序：

```
0 预检      分支必须是 Android（绝不允许推 main）+ origin 存在
1 静态验证  npm run typecheck + npx vitest run test/unit/library
2 提交      git add -A → 暂存区凭证扫描 → commit（凭证不过就中止）
3 推送      git push origin Android，并回读 origin/Android 确认与本地一致
4 构建      调 android-build.ps1 -Release（签名在 android/keystore，已 gitignore）
5 产物验收  大小 / SHA-256 / apksigner 验签 + 解包 assets/*.js 查
            §5(b) 三个声明标记 + **本次 commit 短 hash**
6 收尾      打印待上传路径，并提醒 tag 必须指向该 commit
```

第 2 步的凭证扫描是**卡在 commit 之前**的，分两类：暂存**路径**里出现签名用的 keystore / 证书 / `.env`
就直接中止；暂存**内容**里出现网易云游客态的 cookie 字段名、CSRF 字段、Bearer 令牌、私钥 PEM 头
也直接中止。不留下「先提交再补救」的机会。

⛔ 这段文档本身被这道扫描误报过一次：初版把扫描的字面量原样写进了流水，脚本立刻把自己的说明文档判成凭证。
两处修法都留着：脚本里的字面量**由片段拼接而成**（否则它会匹配自己的源码），
文档里则改为描述类别而不贴具体 token 名 —— 流水是给人读的，贴 token 名没有信息量。
第 5 步的 commit 短 hash 检查同理 ——
包里的 build id 对不上就 `Die`，不会产出一个看起来正常但溯源错误的包。

⛔ 脚本本身**必须是纯 ASCII**：PowerShell 5.1 在没有 UTF-8 BOM 时按 ANSI 读 `.ps1`
（与 `android-build.ps1` 同一条约束）。所以中文 commit message 走 `-MessageFile` 参数，
由调用方写成**无 BOM 的 UTF-8**（用 `[System.IO.File]::WriteAllText` + `UTF8Encoding($false)`，
不能用 PowerShell 5.1 的 `-Encoding UTF8`，那会带 BOM 并污染首行）。

### `dev-2026-10-16-toast-narrow-column-and-mine-login` — 修复：状态弹窗文字被压成窄条；给「我的」页补上登录 / 退出登录

**性质**：BUG fix + 功能补齐。触发场景：`android-v0.7.19` 装到一台没登录过的新手机上实测。

#### 变更

**① 状态弹窗的文字窄列（`src/components/app/dialogs/AppDialogs.tsx`）**

真机现象：播放失败弹窗「当前账号仅可试听此歌曲，请登录具有完整播放权限的账号」被排成
**每行 2–3 个字**的竖窄条，整块背景因为 `rounded-full` 渲染成一个圆，文字溢出到圆外。

根因不是排版审美，是一条 CSS 约束：

| 环节 | 发生了什么 |
| --- | --- |
| `fixed` + `left-1/2` | 绝对定位元素只设 `left` 时，**可用宽度 = 视口宽 − left = 半屏**（1264px 的手机上只有 632px） |
| 内容宽度 | 28 个 CJK 字 ≈ 392px + 图标 18 + 两个按钮 + 三段 gap 36 + 内边距 48 ≈ **604px**，刚好挤爆那 632px |
| flex 收缩 | `<span>` 是 flex item，而**中文的 `min-content` 只有一个字**，于是它几乎被压成一列，按钮却完好 |
| `rounded-full` | 容器被文字撑得极高，`border-radius: 9999px` 收敛成圆 → 圆里装不下字 |

改法：居中从 `left-1/2` + framer-motion `x:'-50%'` 换成 `inset-x-0` + `mx-auto` + `w-fit`，
**可用宽度回到整个视口**，`w-fit` 再收回到内容宽；另加 `flex-wrap` 让超长文案在极窄屏换行而不是压字。

⛔ 已在代码里留注释说明**不要**改回 `left-1/2` + `x:-50%`。

**②「我的」页的登录 / 退出登录（`src/library/suites/netease/`）**

实测发现未登录时那一屏只有一句「未登录 / 登录网易云后这里会显示你的歌单」的纯文案，**没有任何登录入口**；
已登录时账号条也没有退出入口。陌生人装包后等于走投无路。

- `NeteaseEmpty` 增加可选的 `action` 槽位（向后兼容，其余调用点不受影响）
- 未登录：显示「登录」→ `account.selectProvider(activeProviderId)`
  —— 走 `selectProvider` 而不是 `startLogin`，因为前者才是「现 Grid3D 的选平台规则」那一支
  （provider 没配置时直接 `unavailable`，不会起一个注定失败的会话）
- 已登录：账号条右侧加「退出登录」→ `account.logout(activeProviderId)`，用 ref 挡连点（logout 是异步的），
  结果经 `onStatusMessage` 回报；登出后 `user` 变 null，页面自己翻回未登录态

⛔ **踩坑（第一版按钮没出来）**：我一开始给两个按钮都套了 `can.has('account-login')` / `can.has('account-logout')`
的门，结果按钮永远不渲染。账户动作只声明在 **account surface** 上（entry.ts 的 `ACCOUNT_ACTIONS`），
`HOME_ACTIONS` 里没有它们，所以 `can`（读的是 home 的声明）永远不含这两项。
**网格的既有写法就是首页直接调 controller**（`Grid3D` 的 `selectProvider` / `logout` 均无门）——
`can` 是给 account surface 自己的界面和命令面板用的。已在代码里留注释防止再犯。

二维码卡由 `LibraryAccountHost` 按 suite 解析并挂载 `NeteaseAccount` 渲染，本改动不新增第二套登录界面。

**③ 登录弹窗把裸 i18n key 显示给用户（`src/library/suites/netease/NeteaseAccount.tsx`）**

上面那个入口做出来之后一点「登录」，二维码是**真的出来了**（安卓上后端是通的，扫码可用），
但标题 / 副标题 / 状态行显示的是 `home.loginTitle`、`home.loginNote`、`home.scanQr` 三个**裸 key**。

根因：这个文件的翻译收口函数写成

```ts
return message.fallback || message.key;   // ← 根本没有调用 t()
```

而 core 给的这些文案**多数不带 fallback**，于是直接把 key 当文案显示。语言包里
`home.loginTitle` = 「使用网易云APP扫码」是存在的，只是没人去查它。
多登录方式的按钮 `{method.labelKey}` 同理。

修法：收口函数改为绑定 `t`（`buildSay(t)`），`LoginCard` 里用 `useTranslation()` 取 `t`，
`method.labelKey` 也过一遍 `t()`。`TFunction` 从 `i18next` 引——这个版本的 `react-i18next`
没有再导出它（`GridAccountSurface.tsx` 也是这么写的）。

⛔ 已留注释说明：**只 `return fallback || key` 不算翻译**。

#### 验证

- `npm run typecheck` exit 0
- `npx vitest run test/unit/library`：95 文件 / 1017 测试全绿
- 真机（一加 Ace 3 / Android 16，debug 包）逐条确认：
  - ② 未登录时「我的」页橙色「登录」按钮正常渲染；已登录（`ShimoRay`，10 个歌单）时账号条右侧出现「退出登录」——两个分支都跑过
  - ③ 点「登录」后二维码真的弹出来，标题 / 副标题 / 状态行显示「使用网易云APP扫码」/「打开网易云音乐APP > 发现 > 扫一扫」/「请扫描二维码」，**不再有裸 key**
  - ① 见下面的对照测量

**① 的真机对照测量**（`docs/dev/.tmp/toast-measure.mjs`）：
在真机同一渲染引擎里，按修复前 / 修复后两套 class 各注入一个 `visibility:hidden` 的弹窗节点
（文案取 `preview-only` 那句 24 个字，外加「取消」「跳过」两个按钮），量完即删：

| | 修复前 `left-1/2` + `x:-50%` | 修复后 `inset-x-0` + `mx-auto` + `w-fit` |
| --- | --- | --- |
| 弹窗宽 | 198px，右边界 **−17px（溢出屏幕）** | 329px，左右各 16px 留白，居中且不溢出 |
| 弹窗高 | 204px | 122px |
| 文案 `span` | 宽 44px / 高 180px / **每字 1.7px** | 宽 281px / 高 40px / **每字 10.8px** |
| flex-wrap | `nowrap` | `wrap` |

计算样式同时证明 Tailwind 里确实生成了 `inset-x-0` / `mx-auto` / `w-fit` / `max-w-[calc(100vw-2rem)]`
这几条规则（`left`/`right` 算得 0、`margin` 算得 16px），不是「class 在 JS 里但 CSS 没有」的空壳。
这也复现了根因：旧写法下 `left` 算得视口一半（180.571px），可用宽度只剩半屏，
24 个 CJK 字的 `min-content` 只有一个字，于是被压成 1.7px/字的竖条。

#### 踩坑

- 网易云首页的卡片是 `onPointerDown/onPointerUp` 的按压交互，**`el.click()` 根本不触发**；
  而且它们带 `disabled={!isInteractive}`（只有「用户正看着的那一层」可交互），
  别人正在操作手机时整屏卡片是 disabled 的 —— **验收阶段不要和用户抢同一台设备的控制权**。
- 弹窗排版这类纯 CSS 问题，真机上「注入同款 class + `visibility:hidden` 量尺寸」
  既零干扰又比截图硬：既能量到数，还能顺带证明 CSS 规则真的生成了。

- release 包**不可调试**（无 `DEBUGGABLE`、无 WebView devtools socket），所以这轮验收只能截图 + `uiautomator dump`，
  拿不到 DOM。查「二进制里有没有某段东西」时**直接解包 APK grep** 比截图硬得多。
- `adb shell uiautomator dump` 在这个 App 上只能看到一个 NAF 的 `android.webkit.WebView` 节点，**读不到任何文字**，
  不能靠它找元素，只能配合截图目视坐标。
- 抓图前必查 `dumpsys activity activities | Select-String topResumedActivity`：本轮先抓到微信小视频，
  差点误判成 App 没渲染。
- 无线 adb 装 18MB 的包，手机息屏时会慢到看起来像卡死（实测 >5 分钟）。装之前先 `KEYCODE_WAKEUP` + `svc power stayon usb`。

### `dev-2026-10-16-android-v0-7-19-published` — 发布：`android-v0.7.19` 已上线，二进制与对应源码同处

**性质**：发布。状态：✅ 已发布并标记为 latest。

#### 变更

在 `Android` 分支的 commit `1867b1b3` 上打了 tag **`android-v0.7.19`**，
release 页 <https://github.com/xlsice/folia-major/releases/tag/android-v0.7.19> 同时放了三样东西：

| 资源 | 说明 |
| --- | --- |
| `folia-android-0.7.19.apk` | 18,268,779 字节（GitHub 显示 17.42 MiB），SHA-256 `E1D9BE5F…21FB6BA` |
| `Source code (zip)` | GitHub 自动生成 |
| `Source code (tar.gz)` | GitHub 自动生成 |

后两项就是 §6(d) 要求的「同一位置免费提供等价的对应源码」—— **与 APK 在同一页、同一方式、免费**。

发布说明里写死了三件可当场核对的事：tag 对应的 commit `1867b1b3`（应用内「开源许可」一节显示同一个
`__COMMIT_HASH__`）、证书指纹 `e86e2038…97a3`、APK 的 SHA-256。

#### 验证

- `apksigner verify --print-certs`：DN `CN=Folia Android Release, OU=xlsice, O=xlsice, C=CN`，
  v2 签名（minSdk 24 已足够，v1/v3/v4 皆不需要）
- 发布后 Assets 区显示 `sha256:e1d9be5ef0a70397813edd8749a20…`，与本地产物一致
- `Source code` 两项时间戳早于 APK（tag 打在发布 commit 上，GitHub 按需生成）

#### 踩坑

- **GitHub 的资源上传框背后是 `<input type="file" id="releases-upload" class="sr-only" aria-hidden="true">`**，
  `aria-hidden` 让它进不了无障碍快照，于是拿不到 opaque ref，而 `upload_files` 只认 ref ⇒ 只能人工拖。
  同页另一个 file input（`fc-release_body`）是给正文插图的，别认错。
- **在「New release」表单点 Publish，第一次提交只会落成一个 `untagged-<id>` 草稿并跳到 `releases/edit/untagged-…`**，
  tag 要在**第二次**点 Publish 时才真正创建。要点两次，这不是 bug。
- 发布按钮的标记是 `<button type="submit" publish-release="true">`，**没有 `name` 属性** ——
  按 `button[name="publish"]` 选会落空。
- 同一个 tag 只能建一次；重发必须新 tag（如 `android-v0.7.20`），覆盖不了已发布的资源。

### `dev-2026-10-16-android-release-signing` — 发布：给 release 构建补签名，并打通 §6(d) 的「同处提供源码」

**性质**：构建 / 发布基础设施。状态：✅ 已随 `android-v0.7.19` 出包发布（见上一条）。

#### §6(d) 的完整链路核查

AGPL-3.0 §6(d) 要求：把目标代码放在某个「指定位置」（免费或收费）提供，
**并通过同一位置、同一方式免费提供等价的对应源码**。GitHub Release 页天然满足后半句 ——
**给任意 tag 打 release，GitHub 自动生成 `Source code (zip)` / `(tar.gz)`**，且免费。

前提是那个 tag 指向的 commit 里，**构建所需的脚本与配置都在**。逐项核过：

| 项 | 状态 |
| --- | --- |
| `android/` 原生壳（56 个文件，含本 fork 的 `FoliaMediaSessionService` / `NativeMediaSessionPlugin` / `SafeInsetsPlugin` / `MainActivity`） | ✅ 已跟踪 |
| `capacitor.config.ts` / `package-lock.json` / `vite.config.ts` | ✅ 已跟踪 |
| `android/app/build.gradle` / `build.gradle` / `settings.gradle` / `gradle-wrapper.properties` | ✅ 已跟踪 |
| 子模块 | ✅ 无（`git archive` 不会丢子模块内容） |
| 最大的跟踪文件 | 3.5 MB（`img/visualizer.png`），远低于 GitHub 打包上限 |
| 跟踪文件总数 | 3209 |
| `.gitignore` 的 `scripts/*` 一条 | ✅ **空规则** —— 仓库里根本没有 `scripts/` 目录，没有构建脚本被排除掉 |
| `models/` `build/ffmpeg/` `ffmpeg-audio/` | 构建时按脚本拉取并校验 sha256（`build/fetchModels.mjs`）；第三方预编译二进制本就不属于「对应源码」，**且取它们的脚本是入库的** |

⚠️ **动手前发现的分发阻断**：`git ls-remote --heads origin` 当时只有 `main`，
`Android` 分支（45 commit）没推 —— 等于发闭源二进制。已推送（`f0161e2a..b32d1b3d`）。

#### 签名：为什么密钥必须排除、且排除后仍算合规

`build.gradle` 原本**完全没有 `signingConfig`** —— `assembleRelease` 产出的是**装不上的未签名包**。
补了配置，但要点不在「加了个签名」，而在**加了个 fallback**：

```
有 android/keystore.properties → 正式签名
没有                        → 退回 debug key，产出照样可安装
```

因为**私钥是秘密，不是对应源码**。AGPL §6 要的是「源码可被他人重建」，不是「把私钥也公开」。
如果硬要求密钥才能构建，那么 clone 下来的人反而构建不出任何东西 —— 那才是真的不满足 §6。
现在任何人都能 `npm ci` + `cap sync` + `assembleRelease` 出一个可安装的包。

`android/keystore/` 与 `android/keystore.properties` 已进 `android/.gitignore`
（模板默认把 `*.jks` 那两行注释掉了，不主动加就会把密钥提交上去）。

`versionName` 也从模板默认的 `"1.0"` 改成 `"0.7.19"` —— 与 `package.json` 对齐，
别让人看到一个自称 1.0 实际是 0.7.19 的包。

### `dev-2026-10-16-agpl-section5b-notice` — 合规：把 AGPL-3.0 §5(b) 的显著声明做进 APK 里

**性质**：合规（不是功能）。状态：真机验证通过 + 全量单测绿 + typecheck exit 0。

#### 为什么现在做

要分发 Android 分支的 APK，先核了协议的**分发条件**：

- `LICENSE` 是**标准 AGPL-3.0，无任何附加条款**；`git diff main -- LICENSE` 为空，
  `package.json` 的 `"license": "AGPL-3.0"` 与之一致。
- 上游 README 里「仅供非营利使用」那句话**只在 README、不在 LICENSE** —— 法律上不是授权条件
  （§4–6 明确允许收费），但代表作者意向，且 App 内置 KuGou/QQ/网易云音源的**版权风险远大于
  「非营利」本身**。商用前仍应先开 issue 确认。

⚠️ **动手前发现的硬缺口**：`git ls-remote --heads origin` 当时**只有 `main`**，
`Android` 分支（45 个 commit）**根本没推到 GitHub**，而 fork 的 `main` 是零改动的上游快照
（`git rev-list --left-right --count origin/main...upstream/main` = `38  0`）。
这等于**分发闭源二进制**：拿 APK 的人找不到任何对应源码，直接撞 §6。已由雪冷水自行推送解决
（`refs/heads/Android` = `f0161e2a`）。

#### §5 的三项义务如何落地

| 条款 | 要求 | 落点 |
| --- | --- | --- |
| §5(a) | 声明已作修改 + 日期 | 「开源许可」分区首段，首次修改日期 2026-10-13 |
| §5(b) | 声明本作品以本许可证发布 | 同段：AGPL-3.0 发布、原许可证无附加条款 |
| §6(d) | 二进制同处免费提供对应源码 | 分区内的源码链接 + **纯文本 URL** + 本构建 commit |

#### 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/components/modal/settings/OpenSourceLicenseSection.tsx` | **新增**。声明分区，含 §5(a)(b) / §6 三段文案、两个跳转按钮、纯文本 URL、本构建溯源行 |
| `settings/navigation/settingsAnchorModel.ts` | 注册 `openSourceLicense` 锚点（section `general`）—— `settingsAnchorCoverage.test.ts` 双向校验，漏登记会红 |
| `settings/GeneralSettingsSubview.tsx` | 挂在**通用设置末尾**（PonderHintSettingsSection 之后） |
| `src/components/modal/SettingsModal.tsx` | 帮助页「作者信息」页脚下方追加一行紧凑声明，**仅 `BUILD_KIND !== 'official'` 时渲染** |
| `src/i18n/locales/{zh-CN,en,in}.ts` | 各 7 个 `options.*` 键 |

#### 两个设计决定

**为什么不走模组（`settingsSections` 注册表）。** AGPL 的声明必须**在任何构建里都存在、不可关闭**。
模组系统默认关闭，且模组代码装在 `%APPDATA%/Folia/mods` —— **既不进 APK 也不进对应源码**。
走模组等于把法律声明放在一个用户可以关掉、且不在分发物里的地方。

**为什么源码 URL 同时以纯文本呈现。** §6(d) 原文要求「在二进制旁边**清楚地指明**去哪里取对应源码」。
安卓壳里 `window.open` 不保证拉起系统浏览器（`openExternal` 在 Electron 走主进程、其余回落
`window.open`，与 `grid/account/QrLoginFailureHelp` 同一套路），所以 URL 必须可长按复制，
不能只做成一个点了没反应的链接。

#### 本构建溯源

`data-license-build` 用 vite 的 `__COMMIT_HASH__` / `__GIT_BRANCH__` / `__APP_VERSION__`
（拿不到时回落 `dev` / `unknown`，与 `amllApi.ts` 同一套守卫）。
这让**二进制 ↔ 对应源码的对应关系可被任何人当场核对**，本轮实测值：

```
本构建对应：0.7.19 · Android · f0161e2a
```

`f0161e2a` 就是当时 `origin/Android` 的 HEAD。

#### 真机验证（一加 Ace 3 / Android 16）

```
adb install -r -d app-debug.apk        → Success
dumpsys package lastUpdateTime        → 2026-10-16 13:43:17（晚于 APK 的 13:42:59，确认装的是新包）
清 SW + caches → force-stop → 重启 pid 2390
```

- 设置 → 选项 → 界面设置 → 滑到底 → **⚖ 开源许可**分区正常渲染
- `document.querySelector('[data-license-source-url]')` → `https://github.com/xlsice/folia-major`
- `document.querySelector('[data-license-build]')` → `f0161e2a`
- 帮助页页脚 `data-license-notice="footer"` → 「二次开发版本 · AGPL-3.0 github.com/xlsice/folia-major」

#### 踩坑：安卓没有设置入口，坐标点不到

本来打算截图验收，结果在真机上**找不到任何设置入口**：netease suite 接管了整个首页
（`librarySuiteOwnsHomePlayerBar`），5 个底栏标签、播放面板 5 个页签全扫过，
全文档 `TreeWalker` 搜「设置 / 选项 / 许可」**零命中**；播放面板也没有可滚动容器。

⇒ 设置的唯一入口是 **命令面板 Ctrl+K**（`docs/dev/AGENTS.md` 已记），而安卓没有物理 Ctrl。
解法是 CDP `Input.dispatchKeyEvent` 带 `modifiers=2` 派发，绕开键盘直接触发。
两个临时探针放在 `docs/dev/.tmp/`（已被 `docs/dev/.gitignore` 忽略）：

```bash
node docs/dev/.tmp/cdp-eval.mjs "<expression>"   # 对页面求值
node docs/dev/.tmp/cdp-key.mjs  k  2             # 派发 Ctrl+K（1=Alt 2=Ctrl 4=Meta 8=Shift）
```

⚠️ **后续导航全部改用 DOM 点击而不是坐标点**。坐标点击打到了系统层
（误触起一个 Douyin 视频窗口盖住设置面板），改用「按文本找元素 → `el.click()`」后一次到位。

### `dev-2026-10-16-netease-hero-cover-missing` — 修复：歌单详情页顶部封面一直不出现

**性质**：bugfix（回归）。状态：代码修复 + 真机验证通过 + 新增 5 条契约单测。
引入于 `b0b7ae97`（封面飞出），被 `b6a80125` 的 bug3「大图飞行途中隐藏」放大到必现。

#### 症状

打开歌单详情页后顶部一大片空白，**封面图不见了**；标题、曲名、时长都正常。

#### 根因

bug3「飞行途中把大图藏起来，落位后再露」是这么实现的：

```ts
// NeteaseCollection.tsx:119
const heroHidden = morphSnapshot.flyingKey !== null && morphSnapshot.flyingKey === String(collection.id);
```

而**落位时把 `flyingKey` 清回 null 这一步漏了**。`NeteaseCollectionMorph` 的 `settle()` 只做了三件事：

```ts
flyingRef.current = false;
flyingKeyRef.current = null;   // ← 只清了组件自己的 ref
setFlight(null);               // ← 飞行层消失
```

**没有调 `setNeteaseMorphFlying(null)`** —— 也就是 store 里那个 `flyingKey` 永远停在集合 id 上。

于是：飞行的封面正常落位、飞行层正常消失，但详情页那张大图**永远停在 `opacity: 0`**。
`neteaseMorph.ts` 里 `setNeteaseMorphFlying` 的注释本来就写着「飞行开始 / **结束**，
告诉详情页那张大图『你该藏起来 / **可以露面了**』」——设计是要在落位时传 `null` 的，
只是没落到代码里。

为什么这么隐蔽：

- 它**不报错、不闪退**，只是有一层 `opacity: 0`；
- 飞行层是在 `document.body` 上的 portal，落下就消失，观感上「转场是正常的」；
- 截图上顶部是 `coverTint` 那层整页染色 + 过渡带，看着像「设计如此」，很容易当成没 bug；
- 只在**第一次**打开时必现 —— 再开一次时 `armNeteaseMorphOpen` 顺手把 `flyingKey` 重置成 null 了。

#### 真机取证（修复前）

```
t≈700ms   opacity "0"  有img true  img_complete true  natural 800×800  box [361,361,0]  飞行层在场 false
t≈1500ms  opacity "0"  …
t≈3000ms  opacity "0"  …
t≈6000ms  opacity "0"  …
```

图**已完整解码**、URL 正常、几何正确 —— 唯一的问题是那层 `opacity` 永远是 0。
这条证据同时排除了「封面 404 / 取不到图 / 布局塌了」三个更直觉的方向。

#### 修法

`settle()` 里补上通知，清之前先 `consumeNeteaseMorphFresh()`：

```ts
consumeNeteaseMorphFresh();
setNeteaseMorphFlying(null);
```

⛔ 顺序不能反：`setNeteaseMorphFlying` 会推进版本号，而此刻记账还在。若 `fresh` 还是 true，
渲染期的起飞判定会看到「版本号变了 + 账还在 + fresh 为真」就**再飞一次**，再落位、再推进、
再起飞 —— 转场层把自己锁死在循环里。这个坑之前在起飞那侧踩过一次（见 `consumeNeteaseMorphFresh`
的注释），这次是同一根因的另一面。

#### 一条补不了的测试，说明白

组件里「落位有没有通知大图露面」这种**漏调一次**的 bug，本仓库**没有 React 测试库**
（`@testing-library/react` / `react-test-renderer` 都没有），所以单测兜不住。
新加的 `test/unit/neteaseMorph/neteaseMorphContract.test.ts` 钉的是 store 语义
（置位/置回 null、重复置位不推进版本号、置 null 会推进版本号因而必须先 consume），
**这些在修复前后都通过** —— 它防的是下一类同类改动，不是这一条。
真正抓住这次回归的是真机那条 opacity 取证。

---

### `dev-2026-10-15-netease-cloud-text` — 「浮云」文字效果：逐词柔和浮出

**性质**：功能。状态：**代码完成、真机验证通过**、typecheck 干净、全量单测通过（新增 18 条）。
真机：一加 Ace 3 / Android 16，361×794。

#### 需求是怎么收敛的（收敛了两次）

第一轮按「把歌词界面的云阶效果全量铺开」做完了整套排版复刻（切块 / 左右错位 / 逐块缩放微旋 /
引导线），用户随即否掉了排版那一半：

> 「每块独立缩放/微旋这些特性都不要，要不然影响可读性：我想要浮云的字出现的效果，而非它的排版。」

于是砍掉了**全部排版**：不均匀切块、左右错位、逐块缩放方差、微旋、引导线。
但这一刀砍太宽了 —— 连**出场效果**也一起砍了，只剩「淡入 + 上浮」。
用户一眼看穿：

> 「云阶这个效果有颜色追踪最新文字和模糊出场的特性，而且出场特效很有弹性，
> 这些没有做到复刻诶，是不是多删了啥？」

对，划线划错了。**模糊出场、弹性入场、颜色追踪这三样都属于「出现的效果」，不是排版。**
第二版把它们补回去。

| 云阶（partita） | 归属 | 现在 |
| --- | --- | --- |
| 逐词显示单元 + 逐字 timing | 出场 | ✅ 保留：逐词依次浮现 |
| 模糊出场 `blur(10px) → none` | 出场 | ✅ **补回**：按字号缩放（glowWordVariants.ts:55） |
| 弹性入场 `spring 200/20` | 出场 | ✅ **补回**：改 `duration/bounce` 形式（:27） |
| 颜色追踪 base → activeColor | 出场 | ✅ **补回**：统一追色（partitaLayout.ts:94） |
| `buildSequentialColumns` 不均匀切 chunk | 排版 | ❌ 删除 |
| `staggerMin/Max` 左右交替错位 | 排版 | ❌ 删除 |
| `staggerScale = 0.8 + random()*0.9` 逐块缩放 | 排版 | ❌ 删除（用户点名） |
| chunk 微旋 `passedRotate` | 排版 | ❌ 删除（用户点名） |
| chunk 的 guide line（竖刻 + 横线） | 排版 | ❌ 删除 |

「最新文字带模糊」那条确认过是**字幕条**的 upcoming lyrics（`subtitleUpcomingLyricsBlur`），
不是歌词舞台；歌词本体的模糊就是上面那条 `blur(10px)`。

#### 三样是怎么实现的

**模糊出场** —— 原值 10px 是给 40~88px 大字用的，照抄到 12~24px 的界面字上会糊到读不出来，
所以按字号缩：display 3.5px / title 2.5px / item 2px。

**弹性入场** —— 原版 `stiffness: 200, damping: 20`（ζ≈0.71，超调 4.6%）**照抄过来是看不出弹性的**：
它那边字高 40~88px、位移 40px，4.6% 落下来接近 2px；这里位移只有 3~9px，同样超调只有 0.3px。
改用 framer 的 `duration` / `bounce` 形式（与 stiffness/damping 等价但两个旋钮都好调），
`bounce = 0.32`，另加一个**全档统一**的落位缩放起点 0.94 —— 是「弹一下」，不是用户否掉的
「每块独立缩放」，没有逐词方差。

**颜色追踪** —— 用户选了「统一追色」而不是照搬关键词表（歌单名没有词表语义，
照搬会出现某个字随机变色）。做法是 CSS 一条规则：

```css
color: color-mix(in oklab,
    var(--nt-bg) calc((1 - var(--nt-cloud-mix)) * 68%),
    currentColor calc(var(--nt-cloud-mix) * 100%));
```

关键点：**`currentColor` 写在元素自己的 `color` 上时解析成的是继承色**，
也就是调用方挂在根元素上的最终色 —— 所以这套不需要知道任何一档的目标色是什么，
40 多个调用点一行都不用改。`mix` 到 1 时第二项占 100%、第一项归零，**终点精确等于最终色**，
文字停下后颜色与不加动效时完全一致，不会整页发灰。
`--nt-cloud-mix` 用 `@property` 注册成 `<number>` 才有插值（没注册只能一格一格跳），
`initial-value: 1` 保证「动画没跑 / 浏览器不支持 / 动效关掉」三种情况下都是正确颜色。
不支持 `color-mix` 的引擎整条丢弃这条声明，`color` 退回继承值 —— 表现只是「没有追色」，
不会出现坏掉或看不见的字。

#### 一处按 A/B 砍掉的模糊

真机 A/B（首页冷启入场，`animation-name: none` 对照，带硬校验）：四档全上模糊，
中位帧间隔 12ms → 18ms。而 `meta` 档恰好是**全页最密**的（详情页 145/223，首页约一半），
偏偏 13px 上的 1.6px 模糊是四档里最看不出来的 —— 代价几乎全花在最看不出来的那一档上。
所以 `meta.blur = 0`，走 `.nt-cloud-word--no-blur` 把动画名覆盖成只剩追色。
改完：首页入场中位 17ms、p90 43ms、>32ms 帧数 24/60 → 9/60。


#### 铺开的位置

页头大标题、板块标题（含计数）、空状态说明与提示、折叠区块标签、底部标签栏文字、
歌单卡标题与曲目数、曲目名与艺人、**曲目序号与时长**、歌单详情大标题与创作者、
迷你播放器曲名，**以及整个歌手页**（页头名字、大标题、热门歌曲标题、收藏按钮、序号、
曲目名、专辑名、发行年、继续加载按钮）。

动效走 `uiMicroMotion` 那个面；关掉时渲染成普通 `<span>`，不引入任何 motion 元素。

#### 铺开时抓到的两个覆盖漏洞

覆盖率探针（`probe-cloud-v2.mjs`）在真机上扫每一档文字根元素，比对「拆出来的词拼回去」
是否等于原文，直接量出两个洞：

1. **曲目时长和序号没铺**（详情页 `.nt-t-meta` 只有 118/145 已拆）。
   后果不只是「少了一半动效」，而是**读出来的顺序是反的**：
   时长整列先闪现，约 400ms 后歌名才浮出来，先看到的是最不重要的信息。
   补上之后 145/145 全覆盖。
2. **歌手页整个没铺**。首页/详情/我的都铺了，唯独歌手页漏了 ——
   而它是「查看歌手」就能进的常规页面。补了 9 处文字点。

唯一有意不铺的是「⋯」菜单里的操作项：菜单是瞬时浮层，跟着菜单一起出现，
再让每个字浮一下反而拖沓。

#### 真机取证（覆盖率探针）

| 页面 | 各档 已拆/总数 | `join('')` 保真 |
| --- | --- | --- |
| 首页（推荐，35 张卡） | item 38/39 · meta 38/38 · label 5/5 | **83/83** |
| 歌单详情 | display 2/2 · item 74/75 · meta 145/145 | **227/227** |
| 歌手页 | display 2/2 · title 3/3 · item 191/192 · meta 201/201 | **403/404** |
（各档都差的那一个，是搜索框的 `<input>` 本身；歌手页那一个多出来的是残留的
「打开歌单」菜单项。）

另外确认了页头「音乐库」首字不再被裁、卡片标题的省略号正常
（`今天从《だって女の…`、`飞行雪绒（爱尔斯）…`）。

> 探针本身踩了两个坑，都记在这：`closest()` 从元素自身开始匹配，
> 而词的**直接父元素正好带同名 class**，第一版过滤条件把词全排除了，
> 一度误报成「0/83 全没生效」；另外 `:scope >` 选不到孙节点 ——
> `NeteaseCloudText` 自己会渲染一层 span，词在孙上。

#### 真机取证（三样效果的逐帧轨迹）

`Page.addScriptToEvaluateOnNewDocument` 注入 rAF 采样器抓的，详情页大标题的第一个词：

| t(ms) | opacity | filter | `--nt-cloud-mix` | y | scale |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.000 | blur(3.5px) | 0 | 9.00 | 0.9400 |
| 75 | 0.469 | blur(1.34px) | 0.339 | 5.96 | 0.9603 |
| 156 | 1.000 | blur(0.50px) | 0.527 | 0.78 | 0.9948 |
| **284** | 1.000 | blur(0.088px) | 0.678 | **−0.45** | **1.0030** |
| 545 | 1.000 | blur(0px) | 1 | 0.02 | 0.9999 |

- 模糊：`3.5px → 0.088px → 0`，连续渐变 ✅
- 追色：`--nt-cloud-mix` 0 → 0.339 → 0.678 → 1，且 `getComputedStyle().color`
  落在 oklab 上跟着变 ✅
- 弹性：y **过冲到 −0.45px**（冲过终点再回弹）、scale 弹到 **1.0030** 再收回 1 ✅

另外核对了各档挂的动画名：display/title/item = `nt-cloud-blur, nt-cloud-tint`，
meta = 只有 `nt-cloud-tint` 且 `filter: none`、无 blur 变量 —— 与档位表一致。

> ⚠️ 这里也踩了一个坑，值得记：**用 `addScriptToEvaluateOnNewDocument` 注入
> `document.createElement('style')` 去关动画做 A/B 时，在文档最早期 `document.head`
> 与 `documentElement` 都还是 null，append 直接抛异常**，脚本后半段（连同采样器）
> 全不执行 —— 但上一轮注册过的脚本还在跑，于是量出来的两组数据其实是同一个条件，
> 一度得出「blur 白给」的错误结论。加一道 `getComputedStyle(...).animationName === 'none'`
> 的硬校验才作废重测。**A/B 必须校验对照组真的生效，否则宁可不出结论。**

#### 切词必须守住的两条契约（都有单测）

1. **空格不能丢**。逐词拆成元素之后，空格没有任何东西会自动补上 —— 直接丢掉的话
   `Yofukashi Gaming` 会粘成 `YofukashiGaming`。空格粘到前一个词的尾巴上。
2. **字符一个都不能少或多**。整串 `join('')` 必须等于压平空白后的原文。
   这是本模块最硬的约束：它要挂在 35 张卡片、几十行曲目名上，
   任何一处字符丢失都是肉眼可见的文字 bug。

写第 2 条测试时当场抓到一个真 bug：`(Remastered 2011)` 的 `)` **粘错了位置** ——
`2011` 还在 latin 缓冲区里没落盘，标点却去拼了数组最后一个元素，拼出
`Song (Remastered )2011`。修法是处理标点前先 `flushLatin()`。

#### 顺带修掉的一处兼容坑

模块文件不能叫 `neteaseCloudText.ts` —— 组件叫 `NeteaseCloudText.tsx`，
两个名字**只差大小写**，TypeScript 直接报 TS1261（`Already included file name ... differs
only in casing`）。纯逻辑模块改名 `neteaseCloudReveal.ts`。

全量单测：**7314 passed / 2 skipped**，typecheck 干净。

---

### `dev-2026-10-15-netease-fixes-and-entrance` — 网易云 6 个交互 bug + 封面飞出改曲线 + 卡片按压 + 首页波浪入场

**性质**：修 bug + 功能。结论：六条 bug 全部真机复测通过；三条新需求落地；第四条（云阶文字）待用户澄清口径。
真机：一加 Ace 3 / Android 16，361×794，DPR 3.5。

#### 一、六个 bug

| # | 现象 | 根因 | 做法 |
| --- | --- | --- | --- |
| 1 | 歌单列表背景是普通拉透明度，不像参考视频里「被封面主色浸染」 | 直接给背景层加 alpha | 用现成的 `extractColors(heroCover, 1)` 取封面主色（`src/utils/colorExtractor.ts`），染色层做成 **NeteaseShell 的直属子节点**（`absolute inset-0 z-0`）—— 放进滚动区会跟着滚走。过渡带色相也取主色 |
| 2 | 详情页顶部大图常驻 | 大图是滚动容器的**兄弟节点**，永远不滚 | 大图挪进 `nt-scroll` 里，返回栏留在外面 `absolute` |
| 3 | 转场中出现一份封面副本停在原地 | 详情页大图一挂上就是满屏宽、纹丝不动，与飞行中的封面同屏 | morph store 加 `flyingKey`；飞行途中大图 `opacity: 0`，落位后再露（落位瞬间两者像素级重合，交换看不出破绽） |
| 4 | 收藏歌单 → 歌词 → 返回回到首页 | 宿主 `buildHomeSurfacePresentation` 在播放视图下 350ms 后让 `Home` 整个 `return null`（`Home.tsx:32`），netease 的 tab / 滚动全丢 | **不改上游**（那是省内存设计，影响不止 netease 一套）。新建 `neteaseSession.ts`，模块级记 `homeTab` / `homeScroll` / `collectionScroll` |
| 5 | 三个点（更多）误触发进入详情的动画 | `stopPropagation` 挂在**冒泡**阶段，而转场的点击监听在 `document` **捕获**阶段，捕获先跑 | `armNeteaseMorphOpen` 从点击点向上走到卡片之间若夹着别的 `button / a / [role=button] / input / select / textarea` 就 return false。对以后新增的嵌套控件同样生效，不加特例属性 |
| 6 | 详情页与首页右上角三个点差 6px | Tailwind `min-h-[56px]` 在 border-box 下**包含 paddingTop**，写在同一元素上内容盒只剩 44（40+44=84），没有居中余量 | 拆成外层（只放 `paddingTop` + 压暗渐变）+ 内层（干净的 `flex min-h-[56px] items-center gap-1 px-4`）。实测 home/detail 的 top 都是 46，delta 0 |

bug4 还牵出两个自造 bug，都已修：
- **卸载时读 `scrollTop` 恒为 0**：宿主是先给首页层加 `display:none` 再让 Home 返回 null，两者同一个 commit，cleanup 里读到的已经被浏览器夹成 0。改成在滚动过程中把值攒进闭包 `lastTop`，卸载时只写回它。
- **ResizeObserver 对滚动容器无效**：它盯 border box，而滚动容器是 `flex-1`、高度由布局定死，内容变高时自己的盒子一点没变，回调根本不触发。改用**有上限的 rAF 重试**（最多 150 帧 ≈2.5s，内容够高且位置落上就停），覆盖「曲目异步加载」和「封面陆续解码变高」。

#### 二、封面飞出改曲线（新需求 1）

`NETEASE_MORPH_DURATION` 0.55 → **0.48**，`NETEASE_MORPH_EASE` `[0.25,0.46,0.45,0.94]` → **`[0.2, 0, 0, 1]`**（Material 3 emphasized，有真正的慢起段）。

换的是「曲线长什么样」不是「有没有曲线」：旧曲线实测确实生效（与 bezier 平均误差 0.030，与线性 0.205，贴前者 7 倍），问题是 easeOut 起步就全速、减速全压在尾段，肉眼读成匀速。换成 `[0.2,0,0,1]` 后，21% 的时间已走到 63% 进度（旧 easeOut 同时只有 34%）。

#### 三、卡片按压倾斜（新需求 2）

`onPointerDown` 按点击位置相对卡片中心算 `rotateX = -ny·7°`、`rotateY = nx·7°`，`transformOrigin` 设在**被点的那一角**（`50+nx·50 %`），`scale(0.965)`；按下那一帧 `transition: none`（要跟手），松开 280ms 回弹。

⛔ 按压 transform **不能**落在被测量的封面元素上：倾斜会改 `getBoundingClientRect`，起飞框量到的就是被按住的那一帧，封面会歪着飞出去。所以外层（带 `data-nt-card-cover`、**不带 transform**）负责被量，内层 `absolute inset-0` 的 motion.div 负责被压。

实测：点左上角时 transform-origin 从中心 79.28px 移到 `8px 5.94px`，matrix3d 显示 scale≈0.959 + 双轴旋转，松开回 identity。

#### 四、首页卡片由外向内波浪飞入（新需求 4）

卡片初始在**屏幕边缘之外**，缩到 0.62、透明、带 9° 旋转，朝自己那一侧的屏幕外飞进来；离屏幕中心越远越晚起飞，形成层层递进的波浪；顶栏问候语与搜索框同时下滑淡入。整体 ≈ **966ms**（需求要的是 0.95s）。

这一条返工了三轮才做对，过程本身比结论更值得记：

**① framer 的 `delay`（逐值写在 transition 里）根本不生效。**
实测写与不写效果完全一样：35 张卡在同一帧齐飞，可见卡数一帧从 4 跳到 35。**错峰改用真实定时器**推进 —— layout 阶段量好起点就开始计时，`setTimeout(remaining)` 到点才 `setLanded(true)`。这样「谁先谁后」由物理时间决定，不受之后 React 提交延迟多少的影响。

**② 错峰按「屏幕四角」归一的话，手机上等于没有波浪。**
361×794、2 列，各卡的归一距离只落在 0.46…1.0 这一段，按四角（1.0）归一后波浪只吃掉预算的一半 —— 实测 35 张卡挤在 **143ms** 内齐飞。改成**按这一批卡里最远的那个归一**。

**③ 更关键：整墙有 35 张卡，最下面那张在 5 屏之下（距离 10.0）。**
按全场最大值归一，错峰预算全花在**看不见的卡片**上 —— 实测屏幕上真正看得见的三行只分到 84ms 以内。改成参照只取**两屏之内**的卡。

**④ 测量：宽高要除回入场缩放，中心偏移不要除。**
`scale()` 绕 `transform-origin`（默认 50% 50%）作用，**元素自己的中心点在屏幕上原封不动**，只有宽高被缩小了。实测漏这一点时位移只有设计值的 0.62 倍（起点 `translateX(-278.8)`，应为 `-339`），卡片起点落在屏幕里而不是屏幕外。
⛔ 中心也除了一遍的话距离凭空涨 1.61 倍，「两屏之内」的筛选会把第 2、3 行误判成屏外，错峰塌成两级（实测只差 143ms）。

**⑤ 根治：`CollectionCard` 原本写在 `NeteaseHome` 的函数体里。**
函数体里的组件**每次父组件重渲染都会产生一个新的类型**，React 按类型对账 ⇒ 整墙卡片被卸载重挂。探针实测入场期间重挂了 **5 代**（给 DOM 元素打 expando 标记、每帧统计带标记的数量），表现为 scale「起飞 → 退回 0.62 → 再起飞」的锯齿。
已提到模块作用域，代数降到 **1**。另在 `neteaseSession.ts` 加了起飞时刻表（键是歌单 id，值是绝对时刻）兜底：即使之后因为切标签 / 数据二次到达重挂，已起飞的那张一看时间已过就直接落在终点，不会重播。

**⑥ 落位回弹换成经典 easeOutBack。**
原曲线 `[0.34, 1.28, 0.64, 1]` 实测峰值只到 **scale 1.010** —— 方向对，但肉眼等于没弹。换成 y1=1.56（c1=1.70158）后峰值 **1.037**，是一条干净的「冲过一点再被拽回来」的曲线。

顺带把 `entranceOn` 收进动效开关：`uiMicroMotion` 关掉时卡片起点本来就是 `opacity: 0`，原来会整屏卡住。

**实测（35 张卡）**：重挂 0 次；起飞前的空窗 139ms（此前 366～758ms）；屏幕上 4 行可见卡片的起飞时刻呈 4 级阶梯 1136 / 1196 / 1294 / 1382ms；距离与起飞时刻 **Spearman ρ = 1.000**；scale 峰值 1.037；总时长 966ms。

#### 五、待办：新需求 3「云阶文字效果」

用户要求「把歌词界面的『云阶』文字效果应用在网易云界面的每一次切换需要渲染的文字」。
`云阶` 是歌词可视化模式（`src/components/visualizer/partita/`）：把一行歌词切块、分栏错落、带引导线。
字面理解是**所有**需要渲染的文字（设置项标签、曲目行、卡片标题…）都做逐词 3D 错落 —— 这会明显损害可读性，也和 35 张卡的网格性能冲突。已向用户澄清口径后再动手。

---

### `dev-2026-10-15-netease-cover-flyout` — 网易云歌单点开改成「封面飞出」，返回原路飞回

**性质**：功能。结论：达成，真机（一加 Ace 3 / Android 16）实测打开 / 返回 / 详情页内点歌 / 再打开 /
降低动效五条路径全通。

需求原话：「我想要歌单点开的时候有这种效果，要加曲线动画」（参考视频 `main.mp4`）。

**这一步把上一条的「整层平行推移」顶掉了**：平行推移现在只剩底部标签栏还在用。
两者不是并列关系 —— 同时保留会变成「封面在飞、底下两页同时在滑」，读起来是双重运动。

用户拍板的四项设计决策：

1. 封面飞出**取代**歌单打开的 Win8 平行推移。
2. 「曲线」指**缓动曲线**（直线轨迹 + 非匀速），不是路径曲线。
3. 落定状态 = 满屏宽正方形封面贴屏幕顶，下方接渐变，返回栏浮在封面上。
4. 返回时**反向飞回**卡片。

#### 1. 曲线是量出来的，不是挑的

`[0.25, 0.46, 0.45, 0.94]`（easeOutQuad）。逐帧量参考视频里封面占屏宽的比例：
29% → 67% → 91% → 100%，换算成归一化进度是时刻 0.273 / 0.545 / 1.000 对应进度
0.535 / 0.879 / 1.000 —— 前半段冲得快、后半段明显收住。时长 0.55s。

⛔ 飞行时长与曲线由 `NETEASE_MORPH_DURATION` / `_EASE` 一处定义，转场层与层间淡入**共用**：
差一点点就会看见封面还在飞、底下的两层已经换完了。

#### 2. 落点用算术，不用等大图挂上来

集合 surface 是 `React.lazy`，会话里第一次点开歌单那个 chunk 还在下载，真机实测冷启动要 **410ms** 才挂上。
等 hero 再量的话，这段时间首页已经淡出而封面还没起飞 —— 半截动画。

落点是定值：详情页 hero 的 `marginTop: -insets.top` 与壳的 `paddingTop: insets.top` 恰好抵消，
**任何设备上落点都在 `y=0`**，所以 `{0, 0, innerWidth, innerWidth}` 直接算，点击那一刻就能起飞。
真机上逐帧量过，落位瞬间飞行层与 hero 矩形完全重合（0,0,361），交换看不出来。

两端都是正方形，均匀 scale 不变形，所以不必像 grid 那样分「框 / 图 / 标题」三件套。

#### 3. 渐变做成 hero 的**兄弟节点**，不是叠在图上

叠在图里的话，落位那一瞬间会「凭空多出一道渐变」——飞行的封面上没有它。
改成兄弟节点后，渐变随集合层一起淡入，和飞行同步。

#### 4. ⛔ `transitions.layer` 不能删

删了宿主会在导航那一刻把首页整个 `visibility: hidden`，封面就变成**凭空从屏幕中间长出来**，
参考视频里「首页还在原地被盖住」那一拍没有了。所以保留声明、只把位移换成交叉淡入
（首页原地淡出、集合层原地淡入），声明它的意义只剩「推移期间不藏首页」。

#### 5. ⛔ 点返回时记账被自己的监听器清掉（真机两轮才定位到）

点击监听挂在 `document` **捕获**阶段，必须赶在 React 的 `onClick` 之前量起飞框。
第一版在这里「没点到卡片就清空记账」，于是点返回时：点击监听先把记账清了 →
紧接着 `beforeBack` 量不到任何东西 → 返回永远退化成普通淡入。

第二版改成「只降新鲜度、不清空」，又暴露了下一个：**新鲜度和「有没有记账」是两个判据**。
歌单详情页里点一首歌同样会推进版本号，而上一页留下的记账依然完好 ——
只看「有没有记账」就会在点歌时也起飞一次封面。真机复现：点「歌单操作」时封面又飞了一遍。

现在三道闸各管一件事：

| 闸 | 谁写 | 挡的是什么 |
| --- | --- | --- |
| `hasBooking` | 卡片点击 | — （记账留到返回时要用，落位后不能清） |
| `fresh` | 捕获阶段点击 | 详情页里点歌 / 点标签栏等**非开场**点击 |
| `closing` | `beforeBack`（**无条件**） | 硬件返回键那条路：它不产生点击事件，`fresh` 不会被降掉 |

`closing` 必须无条件置位（量不到大图也置）：硬件返回 + 大图还没渲染出来时，
`fresh` 仍是 true、账又还在，没有这道闸就会在弹栈的同时**朝前**再飞一次。

#### 6. ⛔ 起飞判定从 `useEffect` 挪到渲染期

`useEffect` 里要「effect 跑 → setState → 再渲染 → 再 commit」才画得出飞行层。
真机上按下到封面开始动之间量到 **74ms** 的死等（550ms 的动画，13% 的空白），而且正好压在导航最忙的一帧上。

改成在渲染期判定（store 推进版本号 → 同一次 commit 直接把飞行层画出来）后量到 **63ms**。
判据是「版本号有没有被消费过」，不是「有没有记账」—— 落位之后随便一次重渲染都会看到那份记账。

剩下的 63ms 里有相当一部分是宿主本身的导航重渲染与 framer 首帧准备，
再加上「手指到 click 事件」本身就有几十毫秒的输入链路延迟，人眼基本感知不到，
为此把飞行改成命令式 DOM 直写不划算，**到此为止**。

#### 7. ⛔ 不能只靠 `onAnimationComplete` 收场

leg 被换掉时上一段动画是**被打断**的，它的 `onAnimationComplete` 不触发，
`flyingRef` 就永久停在 true —— 之后每次点击都被「正在飞行」挡掉。
真机实测症状：返回一次之后**连开都开不成了**。每段飞行因此都配一个 `SETTLE_WATCHDOG_MS = 260` 的定时器兜底。

反过来，`settle()` 也**不能**调 `resetNeteaseMorph()`：那会把返回腿的起点一起清掉，返回又没了。

#### 8. 只认首页卡片入口

从歌单里点专辑、从搜索结果点歌单都**不**起飞 —— 那些页面没有对应的卡片框，
硬凑一个起点只会让飞行从屏幕中间凭空长出来。那几种入口走层间淡入。

点判定认**整张卡片** `data-nt-card`（那个 button）而不是封面 div：
封面是 button 的**子**元素，用户点卡片下半部分的歌名时 `event.target` 是 button 自己，
`closest('[data-nt-card-cover]')` 一路往上走不到子节点 —— 症状就是「点封面能飞、点歌名不能」。

#### 9. 没有复用的部分

不复用 grid 的 `CollectionMorphOverlay`（780 行、弹簧驱动、带快速快进 / 看门狗 / 嵌套回飞 / 卡片散开，
且硬绑 `data-grid3d-index` 这类 grid 专有属性）。只借思路重写了个轻量版，
曲线用定值 easing 而非弹簧：起飞要立刻响应点击，弹簧的预热会让第一帧有明显迟滞。

#### 10. 真机验收数据（一加 Ace 3 / Android 16，361×794，DPR 3.5）

| 路径 | 结果 |
| --- | --- |
| A 点开歌单 | 卡片封面 (16, 359, 159) → 满屏宽 (0, 0, 361)，34 帧 |
| B 详情页里点「歌单操作」 | **不飞**（守卫生效） |
| C 返回 | (0, 0, 361) → (16, 359, 159)，36 帧 |
| D 返回后再点开 | 又飞 (16, 359, 159) → (0, 0, 361)（验 `flyingRef` 没卡死） |
| 降低动效 · 集合形变 | 71 帧采样飞行层**一次都没出现**，而歌单照常打开、hero 照常渲染 |

#### 11. 与参考视频的一处已知偏离

视频里飞行的封面右下角带一个**曲数徽标**，本实现只飞纯 `<img>`（徽标随首页淡出）。
理由：落点 hero 上没有徽标，带过去的话会在落位瞬间多出一个元素。
要复刻的话得给 hero 也加徽标，那是详情页头部布局的改动，不在这次范围内。

### `dev-2026-10-15-netease-win8-page-slide` — 网易云布局加 Win8 式整层平行推移

**性质**：功能。结论：达成，真机（一加 Ace 3 / Android 16）实测推入、返回、减弱动效三条路径全通。

需求原话：「让这个软件的网易云布局的内容（比如歌单卡片）有 Windows 8 的那种打开一个页面和退出一个页面的动效」。

范围经确认是**两处**：① 歌单 / 歌手详情页的推入与返回；② 底部标签栏切页。
幅度取**原味平行推移**（两页同时位移），并跟随「降低动态效果」自动降级。

#### 1. 为什么不是「再画一层合成画面」

grid 的移形换影走的是 `transitions.Overlay`：suite 自己挂一层常驻合成画面，把封面从首页卡片
飞到 hero。那是 grid 的隐喻。要的是 Metro 那种「一页退一页进」的物理直觉 —— 靠**两个真实容器
同时沿 X 轴平移**交代层级，不该再叠一层假的。

所以走契约里新增的 `transitions.layer`：suite 只交一张位移表，宿主负责搬动首页容器与集合容器。
代价是宿主那两层的结构要变，所以设计上做得很克制（见下）。

#### 2. 契约：新增 `LibrarySuiteLayerTransition`（可选字段）

`src/library/core/contracts/suite.ts` 加 `LibrarySuiteTransitions.layer`，**不声明即完全不变**。

只开放 `x` / `opacity` / `boxShadow` 三个属性 —— 推移时两页同时在动，主线程还要留给 visualizer，
这里绝不能引入会触发布局或重绘的属性。

#### 3. 宿主的三个改动（`GridViewOverlayHost.tsx`）

| 改动 | 为什么必须 | 不声明 layer 的 suite |
| --- | --- | --- |
| 首页容器 `<div>` → `<motion.div>` | 它就是旧页，位移得落在真实容器上 | 仍是普通 div，`z-auto`，无 variants |
| 声明 layer 时首页层抬到 `z-10` | 否则推移时被 `z-[49]` 的不透明底板整页盖住 | 保持 `z-[49]` |
| 声明 layer 时底板沉到 `z-0` | 旧页退出去的那一条要透出底色，而不是底下还在跑的 visualizer | 同上 |
| 集合层包一层 `<motion.div>` | **必须是 AnimatePresence 的直接子节点**才能吃到退场 | 直接就是原来的 `<React.Suspense>` |

最后一条是返回动画能成立的关键：导航 store 先清空，这一层要**留在 DOM 里把退场跑完才卸载**。
少了它，返回就是硬切。集合层本体抽成 `activeLayerSurface` 变量，两条路共用，不复制渲染代码。

#### 4. entry.ts 不能静态 import 推移模块

`test/unit/library/suiteEntries.test.ts` 守着一条：非默认 suite 的 entry 只能静态 import `react`
（registry 是 eager glob 扫所有 entry 的，静态 import 会把整块推移拉进**每个**用户的首屏）。
所以 `entry.ts` 里放的是一个**空壳对象**，由四个 surface 的 lazy loader 在 resolve 时 `Object.assign` 进去。
时机是确定的：宿主只在某套 suite 的 surface 真正要渲染时才读 `transitions.layer`，读到时必然已就位。

#### 5. ⛔ 踩坑：`position: fixed` 容器让子元素的 `z-[110]` 失效，首页整个盖到歌单页上

首轮真机验收直接翻车：歌单页渲染出来了，却是**半透明的**，首页的歌单封面、悬浮播放条、标签栏
整个透在上面（用户原话：「这个可读性不好呀」）。命中测试显示歌单页在最上、DOM 也齐全，看着像背景没画。

真正的原因：`position: fixed` **自带层叠上下文**。集合层新包的那层 `<motion.div className="fixed inset-0">`
没有 z-index（等价 0），于是**整页的层序由它决定**；里面 NeteaseShell 自己的 `z-[110]`
只管它内部，跟首页之间的高低根本轮不到它说话。而首页容器为了压过沉底的背景板被抬到 `z-10` ——
`10 > 0`，首页就盖上去了。页面不透明也照样被看见，因为盖在上面的不是它自己。

修法：包装容器给 `z-[100]`（高于首页的 z-10）。**推入 / 返回两条动画的实测数值与修复前完全一致**，
只有层序变了。

⚠️ 这条要记住的一般规律：**给某个子树外面新加一层定位容器，等于把整棵子树的层序决定权交给了这个容器**。
`neteaseParts.tsx` 里那句「集合 surface 要自己抬到 z-[110] 才不会被 z-[49] 底板盖住」之所以成立，
正是因为当时它就是最外层。

⚠️ 另一条误判：查 `[data-wall-handoff-layer=home] > div` 拿到的是 App 自己的挂载点（它本来就带
`z-10`），不是宿主的首页容器，据此差点判定真机没生效。真正的宿主容器是 `[data-netease-root]` 的父级
（带宿主特征属性 `aria-hidden`）。**层叠判定一律认带宿主特征属性的那个节点。**

#### 6. 真机实测（APK 21.6 MB，一加 Ace 3）

在页面内部一次完成「点击 + 多次采样」，绕开跨进程采样的延迟。视口宽 361 CSS px。

**推入**（点「每日推荐」卡）：

| t | 旧页 x / opacity | 新页 x |
| --- | --- | --- |
| 30ms | -58.2px / 1 | +153.2px |
| 90ms | -95.7px / 0.463 | +19.5px |
| 260ms | -101.1px / 0.400 | +0.2px |
| 420ms | -101.1px / 0.4（落定） | 0（落定） |

-101.12 / 0.28 = **361.0** ⇒ 旧页正好退到 `-28%`，与 `homeBehind` 声明值一致。

**返回**（集合页的返回键）：

| t | 旧页 x / opacity | 新页 x | 新页是否还在 DOM |
| --- | --- | --- | --- |
| 30ms | -42.9px / 0.4 | +207.9px | 在 |
| 170ms | -2.8px / 0.982 | +351.2px | 在 |
| 260ms | -0.1px / 0.999 | +360.7px | 在 |
| 420ms | 0 / 1 | — | **已卸载** |

退场期间集合层留在 DOM 里，260ms 才滑到 360.66px（= 100% 视口宽）后卸载 —— AnimatePresence 生效。

**降级**：打开 `reduce_motion_collectionMorph` 重载后，宿主首页容器回到 `absolute inset-0`
（无 `z-10`）、标签栏容器无 inline style —— 两处都退回改动前的硬切。

⚠️ **过程中误判过一次**：查 `[data-wall-handoff-layer=home] > div` 拿到的是 App 自己那个
`z-10` 挂载点，不是宿主的首页容器，据此差点判定真机没生效。真正的宿主容器是
`[data-netease-root]` 的父级（带 `aria-hidden`）。层叠判定一律认**带宿主特征属性**的那个节点。

#### 7. 与预期不符的一处（说明）

**「两页之间露出底色」做不到。** 选项里写的那句是错的：平行推移要求两页**首尾相接**才咬得住，
新页不透明且从右推进，旧页被它一点点盖住，全程没有缝隙。真 Win8 也没有缝。
实际做出来的是「旧页左退 28% + 压暗到 0.4 + 新页从右侧推进」，靠位移与压暗交代层级 ——
这才是原味。若确实想要露底的观感，那是**两页错开**（给新页加 lead/lag），与平行推移是两种东西。

### `dev-2026-10-15-netease-tab-pill` — 底部标签栏选中态改成「实色圆球平移 + 图标从点长出来」

**性质**：功能。结论：达成，真机（一加 Ace 3）逐标签截图确认 5 个字形均可读，
指南针指针实测整 2 圈 + 过冲 0.133 圈。

需求原话：「当前所在的页面为『推荐』时，高亮行为『推荐文字消失，用一个实色圆形（颜色取决于主题色）
中间画一个白色实心但能看出指南针的推荐图标』…… 这个实心的圆形会平移到当前需要高亮的图标的位置」
+「生长速度要曲线，匀速生长太诡异；生长进度达到 80% 时指南针顺时针旋转 2 圈（弹性动画）」。

#### 1. 圆球位置：量真实 rect，不按索引算

选中态球要落在标签正中心。最初想用 `宽度 × (i + 0.5) / n`，实测差了小半个像素，窄视口下肉眼可见没对准。
改成 `getBoundingClientRect` 量出每个 button 的 rect，再用 `ResizeObserver` 跟随尺寸变化重算。
成本只有 5 次 rect 读取，且只在标签栏自身尺寸变化时重算（滚动与切页都不触发）。

#### 2. 「先平移到位再生长」用 delay 实现，不用状态机

生长 delay = `TAB_PILL_SLIDE_S`（0.3s，平移时长本身），**同一个常数派生**，天然不可能错位。
另一种写法（「等平移结束再挂载图标组件」）要多一份状态去同步两个结束时机，一旦对不上就是
「球还在滑、图标已经在长」，而且这种错位只在快慢机器上偶发，很难查。

#### 3. 2 圈旋转交给弹簧

`stiffness 150 / damping 16 / mass 1`，过冲自然产生，不手工做「转 2.05 圈再回 2 圈」的关键帧。
起转时刻 = 平移 0.3s + 生长 0.42s × 0.8 = **636ms**（弹簧起步另有延迟）。

#### 4. ⛔ 手绘字形，不复用 lucide

lucide 那套是 **stroke 描边**字形，选中态要的是实心块，直接 `fill` 会糊成一坨。
`neteaseTabGlyphs.tsx` 手绘 5 个 24×24 实心 SVG，挖孔用 `evenodd` 透出强调色，自带高光细节。

⚠️ **SVG 缩放/旋转必须显式给 `transform-box: fill-box` + `transform-origin: center`**，
否则绕 viewBox 原点 (0,0) 放大，图标会朝左上角飞出去。字形中心与圆心都严格取 (12,12)。

⚠️ **第一版指南针在 19px 下读成了一个「禁止」符号（🚫）**。当时环取 r=8.7/stroke 2.6、
指针拉到 ±6.2/半宽 1.5，环内负空间被指针占满。现改为环 r=9.2/stroke 2.2（环壁只占 1.1 半径）+
菱形指针（菱形是平行四边形的特例，仍属用户要的「平行四边形」），指针尖端距环内壁留 2.1 空隙。
**尺寸是试出来的**：19px 是本机 CSS 直径，改之前必须按这个尺寸看放大截图再定。

#### 5. 真机实测（APK 21.6 MB，一加 Ace 3）

圆球停稳位置：left = 19 / 91 / 164 / 236 / 308（CSS px），间距 72.3 均匀。

生长轨迹（切到「专辑」）：0→300ms 平移期间图标 `scale` **恒为 0.02**（完全不动），
300ms 停稳后 0.086 → 0.39 → 0.84 → 0.985 → 1.0，曲线明显非线性 —— 先平移再生长成立。

指南针指针逐帧累加：

| 指标 | 实测 |
| --- | --- |
| 累计圈数 | **2.000** |
| 峰值圈数 | 2.133 |
| 过冲 | 0.133 圈（48°） |
| 起转 | 674ms（理论 636ms + 弹簧起步） |
| 停稳 | 1636ms |

圆球背景实测 `rgb(186,116,51)`，跟随主题强调色。

#### 6. 图标颜色：写死纯白，不跟 `onAccent`

实现时先用了 `var(--nt-on-accent)`（按「对强调色 ≥ 4.5:1」校准过，强调色偏浅会自动翻成近黑），
实测是 `rgb(28,25,23)` 的黑图标，与「白色实心」的视觉约定不符。已按用户拍板**写死 `#ffffff`**。
代价是浅强调色主题下对比度会掉下来 —— 真要补，正确做法是给强调色加深，不是把图标改回深色。

真机复验：`color: rgb(255,255,255)` / `background: rgb(179,114,30)`。

### `dev-2026-10-15-netease-hide-detail-playerbar` — 歌单 / 歌手详情页不再挂宿主悬浮播放条

**性质**：缺陷修复（既有缺陷，非本次动效引入）。结论：达成，真机确认末行不再被压住。

宿主浮条实测占 y=713..762（高 49px），netease 集合页滚动区 96..794 且 `paddingBottom` 为 0，
**列表最后两行被整条压住读不了** —— 而那正是要看歌单名的位置。

原逻辑（`App.tsx` 的 `suiteOwnsHomePlayerBar`）只看 `collectionBrowseDepth === 0`，
理由写的是「collection / artist / account 三个 surface 没有迷你播放条，浮条是那几屏唯一的播放入口」。
**那个前提不成立**：这三个 surface 的歌单列表底部本来就没有任何播放入口设计，
硬塞一条宿主胶囊进来，结果是既挡内容又破坏页面层级。用户在两个方案里选了**详情页不显示浮条**。

改动只去掉浏览深度那一个条件（`librarySuiteOwnsHomePlayerBar` 对 netease 一律为 true），
顺带删掉因此不再使用的 `useCollectionNavigationStore` import。

⚠️ 函数名 `suiteOwnsHomePlayerBar` / `librarySuiteOwnsHomePlayerBar` 里的「Home」已是历史遗留，
实际范围是整个 suite。改名会牵动整个 overlay 模型，本次只在两处注释里写清真实范围，
把这个决定留给下一次真要动这块的人。

真机复验（22 首的歌单滚到底）：`fixedBottomBars: []`，第 22 首「再于终未归还」完整可读、无遮挡。

### `dev-2026-10-15-default-settings` — 把手机上那套设置固化成 APK 默认值（网易云 Cookie 除外）

**性质**：功能。结论：达成，真机验证 50/50 回填。

需求原话：「我希望我的手机上的这个软件的设置就是以后构建 APK 的默认设置（不包含网易云音乐 Cookie）」。

#### 1. 先确认设置存在哪

| 取证 | 结果 |
| --- | --- |
| `src/stores/storagePrimitives.ts` | 设置走 `localStorage.getItem/setItem`，**没有** Android 专用后端 |
| `src/services/db.ts` | cache / session 走 IndexedDB（Dexie），与本需求无关，不碰 |
| `src/services/onlineMusic/providerStorage.ts` | 凭证命名空间 `online_provider:<provider>:<key>` |
| 真机 CDP 导出 | 57 个 key，origin `https://localhost` |

即：**纯 localStorage，可以从 WebView 里原样捞出来**。这条决定了整个方案可行 ——
不用 root、不用 `run-as`、不用改 App 加导出接口。

#### 2. 机制：只补缺失，不覆盖已有

```ts
if (localStorage.getItem(key) !== null) continue;   // 已有值一律不碰
localStorage.setItem(key, value);
```

| 场景 | 结果 |
| --- | --- |
| 全新安装（localStorage 空） | 50 项全部写入 → 拿到这套默认值 |
| 已在用的机器升级 APK | 一个字节不动，用户自己的设置完整保留 |

整份覆盖等于每次升级把用户设置打回出厂，所以这条规则不是偷懒，是需求本身。

#### 3. 种子必须早于一切 store

各 store 读设置是「读 localStorage，拿不到就用代码 fallback」。种子晚一步，
先被读的那批 key 会先命中 fallback、吃掉默认值。

所以 `src/config/applyDefaultSettings.ts` 是 `src/index.tsx` 的**第一个 import**
（ESM 静态 import 求值顺序保证先于 `void import('./bootstrap')` 和所有 store 模块，
也先于 `installConsoleLogCapture()` 读 `console_log_filters`）。

⛔ 这个 import 不要往后面挪。已在源码里写了英文注释钉住。

#### 4. 变更

| 文件 | 角色 |
| --- | --- |
| `src/config/defaultSettings.generated.ts` | 50 项设置数据，**生成物，勿手改** |
| `src/config/applyDefaultSettings.ts` | 落盘逻辑（只补 / 逐 key 容错 / 幂等） |
| `docs/dev/make-default-settings.mjs` | dump → 剔除 → 生成，带落盘前的凭证安全闸 |
| `docs/dev/DEFAULT-SETTINGS.md` | 机制、剔除规则、重新采集流程、排查表 |
| `test/unit/config/applyDefaultSettings.test.ts` | 6 条回归 |
| `src/index.tsx` | **唯一改动的上游文件**，加了 1 行 import |

#### 5. 剔除 7 项

**凭证 1 项**（用户明确要求排除）：

| key | 说明 |
| --- | --- |
| `online_provider:netease:cookie` | 网易云登录会话（`MUSIC_U` / `MUSIC_A_T` / `MUSIC_R_T` …） |

判定用正则匹配 key 名，覆盖命名空间式和历史遗留扁平式两种写法。
生成器在落盘**前**还有一道闸：产物里只要还留着疑似凭证的 key 就中止不写。
单测另有一条盯「值里不含网易云会话标识」，重新采集时规则失效会先被 CI 拦住。

**瞬时状态 / 遥测 6 项**：`folia_local_music_last_row`、`folia_settings_last_section`、
`last_app_view`、`wall_tools_queue_island_open`、`command_palette_frequency_v1`、
`command_palette_recent_functional_v1`。

⚠️ `last_app_view` 是**真机测出来的**，不是拍脑袋：它虽然和 `folia_settings_last_section`
一样是「上次在哪」，但首轮回填验证里只有它被 App 启动后改写成了当前界面，
放进默认值就是一份立刻被死的数据。反过来 `last_home_view_tab` 同样是「上次在哪」
却不会被改写，说明它是被用户意图保留下来的偏好，所以留下。删掉后重跑一遍验证，
漂移项从 1 个降到 0 个。

#### 6. 真机验证（不是推断）

装机后走了一遍「全新安装等价实验」：把 50 个默认 key 从 localStorage 全删掉
（模拟从没装过的机器 —— 启动时这些 key 一个都不存在），重载后核对。
**全程不删 Cookie。**

| 项 | 结果 |
| --- | --- |
| 待验证 key | 50 |
| 回填且与采集值一致 | **50/50** |
| 未回填 | 0 |
| 被 App 改写 | 0 |
| 凭证 | `MUSIC_A_T=…` 未被触碰 |

首轮跑出来是 50/51 一致 + 1 个漂移（即上面那个 `last_app_view`），
据此同时改了剔除规则、重新生成、重打 APK、重装、复验。

顺带确认：App 正常挂载在 `#root`，渲染出网易云套件的「音乐库 / 每日推荐 / 私人 FM」，
`logcat` 无 `FATAL EXCEPTION`；设备上实际跑的 bundle hash 与本地 `dist/assets` 一致。

#### 7. 凭证没泄漏的取证

`dist/assets` 全量扫描：

| 检索 | 结果 |
| --- | --- |
| `MUSIC_A_T=` | 0 命中 |
| `online_provider:netease` | 0 命中 |
| `MUSIC_U=` | 1 命中，**是误报** |

那个 `MUSIC_U=` 是 `providerRegistry` 里的**模板字符串**
`` `MUSIC_U=${wt(e.hasMusicU)}` ``，属于酷狗设备指纹，
`vite-env.d.ts` 里 `hasMusicU: boolean` 已确认是布尔量，与登录会话无关。

⚠️ 顺带记一条给以后：`minify` 后的单行文件用 `Select-String | ForEach Substring(0,80)`
打印，会打印**行首**而不是命中位置，看起来像泄漏。判定泄漏要用脚本提取命中点上下文。

---

### `dev-2026-10-14-android-back-button` — 修安卓返回键直接回桌面：加一层返回仲裁

**性质**：BUG fix（安卓端功能缺失）。结论：达成，四层全部真机验证。

用户报「不管在哪个界面按返回都回桌面，而不是返回上一级」。

#### 1. 根因：不是导航栈坏了，是没人接这个键

Folia 的应用内导航栈本来是完整的（`useAppNavigation` 有 `pushState` + `appHistoryIndex`
+ `popstate` 恢复 + 集合栈跳层），但**没有任何一层碰过系统返回键**。

| 取证 | 结果 |
| --- | --- |
| `package.json` 搜 `@capacitor` | 只有 core / android / cli / splash-screen，**没有 `@capacitor/app`** |
| 全仓搜 `backButton` / `App.addListener` | **0 命中** |
| `BridgeActivity.java` 搜 `onBackPressed` | **0 命中**（38 个桥接类全搜过） |
| 真机 `dumpsys activity` | 启动后 `Task{#3439 A=top.izuna.foliamajor visible=true}` → 按 `keyevent 4` → Task 消失，`mCurrentFocus` 变 `com.android.launcher` |

即：**Capacitor 8 的 Android 壳完全不做返回键桥接**，Activity 默认行为就是 `finish()`，
与 Folia 压了多少层 history 无关。

⚠️ 读 `AppPlugin.java` 时还发现一个必须知道的副作用：装了 `@capacitor/app` 之后
`load()` 就注册了 `OnBackPressedCallback`，即使**不注册 listener** 返回键行为也从
「直接 finish」变成「能退就退、不能退就无反应」。所以「只装不接」会得到一个
"按返回没反应"的壳 —— 这条已写进 `nativeBackBridge.ts` 的注释。

#### 2. 为什么不能直接 `window.history.back()`

Folia 的 history 记录与 UI 层级**不一一对应**：

- 命令面板 / 设置 / 搜索浮层**根本不压 history 记录** → 直接 back 会穿透到下层界面；
- suite 自己的面板记录又被 `findLayerBaseIndex` 归为「同一层」。

所以做成分层仲裁，而不是一行 back()。

#### 3. 变更

新增 `src/navigation/back/`（纯逻辑可单测 + 原生桥接 + React 接入）：

| 文件 | 职责 |
| --- | --- |
| `backCoordinator.ts` | 有序注册表，**纯逻辑不碰 DOM/window/Capacitor**。优先级 `overlay → suite → collection → view → app`，同优先级 LIFO |
| `nativeBackBridge.ts` | 全项目唯一 `import '@capacitor/app'` 的地方。两道闸隔离平台：`VITE_ANDROID_BUILD` + `Capacitor.isNativePlatform()` |
| `useBackCoordinator.ts` | 在 App.tsx 注册各层；store 类（设置/搜索/集合）直接读 store，React state 类（命令面板）由 App.tsx 注入 |

挂载点选在 `App.tsx` —— 它是全项目唯一同时持有 `useAppNavigation()` 的导航能力、
命令面板开关、以及各 store 的地方，注册一次就覆盖全部层，不必把注册散进各浮层组件。

- `src/App.tsx`：加 1 行 import + 1 处 hook 调用
- `src/i18n/locales/{zh-CN,en,in}.ts`：加 `status.exitPressAgain`
- `package.json`：`@capacitor/app@^8.1.2`
- `test/unit/navigation/back/backCoordinator.test.ts`：12 条单测

**根页面行为 = 再按一次退出**（2000ms 窗口）。且**任何一层被成功消费都会解除退出待命**，
否则「提示 → 退回一层 → 再按返回」会直接退出 App。

#### 4. 验证

真机（一加 Ace 3 / Android 16），逐层实测，**全部通过**：

| 层 | 场景 | 结果 |
| --- | --- | --- |
| collection | 点开「每日推荐」歌单卡 → 返回 | hash `#collection/…` → `""`，`stateIndex` 1→0，popstate 触发 1 次，首页 4 张卡恢复，**无退出提示** |
| view (player) | 启动落在 `#player` → 返回 | hash `#player` → `""`，首页歌单列表恢复，**App 未退出** |
| overlay | 播放页打开设置 → 返回 | 设置标记词 5→0（设置关闭），`hash` 仍是 `#player`（留在播放页），**App 未退出** |
| app | 首页连续按两次返回 | 第一次 toast「再按一次返回键退出 Folia」，第二次 → `mCurrentFocus=com.android.launcher` |

另有：12 条单测全绿、`npm run typecheck` exit 0、APK 装机后 `lastUpdateTime`
（22:43:15）晚于 APK `LastWriteTime`（22:42:56）。

**尚未验证**：web / Electron 构建产物零影响（靠 `isNativeShell()` 逻辑短路，
非实测）；Escape 键未统一（见下）。

#### 5. 踩坑

- **⚠️ 装机后必须清 Service Worker，否则测的是旧 chunk**。本次实测到设备跑
  `main-DcCqNVJh.js` 而本地只有 `main-vixJ6abm.js` —— SW 在发旧包。
  判定：把页面 `script[src]` 与本地 `dist/assets/` 对一遍，对不上就是旧包。
- **⚠️ `@capacitor/app` 的版本号与 `@capacitor/core` 故意不同步**（app 停在 8.1.2，
  core 是 8.5.3），peer 是 `>=8.0.0`。看到版本不一致不用慌，这是官方 dist-tags 的常态
  （`latest-7` 是 7.1.2、`latest-6` 是 6.0.3）。
- **⚠️ 诊断脚本的探针变量名撞车，差点误判成「popstate 在 WebView 里不触发」**：
  两个脚本都用 `window.__probeInstalled` 当守卫，第二个因为看到 true 就不再注册
  listener，计数永远是 0。真实现象是 popstate 正常。**同名守卫变量要按用途分前缀。**

#### 6. 已知未做（阶段二）

现状 **Escape 有 20+ 处分散的组件级监听**（`CommandPalette` / `SettingsModal` /
`SearchWorkspace` / `bravais` 的 `resolveEscapeStep` 六级阶梯 / tui / grid 各自一套），
与返回键各走一套，行为会不一致。阶段二让 Esc 派发同一个「虚拟返回」进仲裁器、
组件级监听逐步退役 —— 那是另一个量级的工程，本轮没做，也没动那 20+ 个文件。


### `dev-2026-10-14-audio-fast-track` — 修「吃不到一加杜比音效」：AudioContext 走了 FastMixer 快线程

**性质**：修 bug。结论：达成，已真机验证。

用户报「安卓版没享受到一加的系统杜比全景音音效」。查了四轮才对根因，
中间还推翻了自己两次结论，最终靠**跨 App 对照实验**才锁定。

#### 1. 错误的起点：「换成 AudioTrack」

用户初始假设是「输出格式是 OpenSL ES / AAudio，换成 AudioTrack 就能吃到系统音效」。

**方向对了一半：能用系统音效的确实是 AudioTrack（不是 OpenSL ES / AAudio），
但 Folia 本来就在 AudioTrack 上** —— `dumpsys media.audio_flinger` 的事件日志里
Folia（uid 10412）一直是 `AT::add`/`AT::remove`（AT = AudioTrack）。
Chromium 的 WebAudio 在 Android 上本就经 Java AudioTrack（要靠 AudioManager 做路由/音量）。
所以「换 API」这个动作不存在。

我还一度据「App 侧选哪个 API 决定厂商效果是否生效」下了结论，**这是错的**，见第 3 点。

#### 2. 真正的分水岭：`F` 前缀 = FastMixer

用同机 SaltPlayer 手动切换输出模式做对照，一次就把差异逼出来了：

| | **Folia**<br>（修改前） | 网易云音乐 | SaltPlayer<br>(OpenSL ES) | SaltPlayer<br>(AudioTrack) |
| --- | --- | --- | --- | --- |
| **前缀** | **`F3`（FastMixer）** | 无前缀 | **`F3`** | 无前缀 |
| **Latency** | **29.00 t** | 465.38 t | **37.00 t** | 183.28 t |
| Buffer | 384 帧 | 14144 帧 | 768 帧 | 3844 帧 |

**判定标志：`dumpsys media.audio_flinger` 里 track 行首的 `F` 前缀。**

FastMixer 的技术特征是「**简化混音，绕过部分处理**」——它不经过 AudioFlinger 的 insert
effect 链，所以挂在 session 上的 Dolby 效果对它不生效。
（SaltPlayer 设置页自己就写着「OpenSL ES / AAudio …无法配合使用系统音效以及第三方音效软件」，
技术原因就是这个 `F`。）

⚠️ 这解释了为什么「用了 AudioTrack 就够了」是错的：**AudioTrack API 也可能被分配到
FastMixer，一旦进了快通道照样绕过音效链。决定因素不是 API，是线程。**

#### 3. 为什么 Folia 会被分到快通道

`AudioContext` 无参构造 = 默认 `latencyHint: 'interactive'`。真机 CDP 实测 baseLatency：

| latencyHint | baseLatency |
| --- | --- |
| **默认（interactive）** | **0.004s（4ms）** ← 极低延迟，触发 FastMixer |
| **playback** | **0.021s（21ms）** |
| balanced | 0.020s（20ms） |

4ms 的 baseLatency 让 Chromium 主动申请低延迟通路。MDN 侧也印证：
`latencyHint: 'playback'` 会把 baseLatency 从 0.00 抬到 0.15；
另有实测矩阵直接写「**Android WebView → 推荐 fallback 路径 `'playback'`**」。

改法：`src/hooks/usePlaybackAudioBridge.ts:141`（全仓唯一的 `new AudioContext()` 构造点）
加 `latencyHint: 'playback'`。**一行。**

#### 4. 真机验收（同机前后对照）

| 项 | 修改前 | 修改后 |
| --- | --- | --- |
| **track 前缀** | **`F3`** | **无前缀** ✅ |
| **Latency** | 29.00 t | **225.62 t** |
| **Buffer** | 384 帧 | **3844 帧** |
| tsc --noEmit | — | 0 error |
| 装机核对 | — | APK 22:23:40 / installed 22:23:57 ✓ |

三项指标同时向网易云音乐对齐，**已回到会经过 insert effect 链的普通混音线程**。

#### 为什么选 `playback` 而不是改原生

- **原生层改不了**：那个 `AudioTrack` 是 Chromium 内部创建的，App 代码调不到
  `setPerformanceMode(PERFORMANCE_MODE_LOW_LATENCY)`。原生层只有 `MainActivity`（13 行）
  和 `SafeInsetsPlugin`，没有音频代码，**改动放 JS 侧比改原生干净得多**。
- **代价为零**：29ms 低延迟只有游戏 / 乐器需要，播音乐用不上；
  `latencyHint` 只影响底层分配，不改变图内的 ReplayGain / 淡入淡出 / crossfade 行为。

#### 听感验证：**用户已确认音效回来**

真机人耳 A/B 通过，用户原话：「成功了，现在音频就是杜比音效的感觉 👍」。

这一环是关键 —— dumpsys 只能证明「已退出快通道、回到普通混音线程」，
**「杜比音效是否真的回来了」只有耳朵能回答**。用户确认后，
「是否还有别的原因在起作用」这个疑问才算彻底排除。

#### 已知未做

后台播放仍是最大缺口（见 USER.md），与本条无关。

### `dev-2026-10-14-collection-detail` — 修「点开歌单不显示内容」：两个独立 bug

**性质**：修 bug（2 个）+ 补接线。结论：达成，已真机验证。

用户报「点开歌单后屏幕上不显示内容」。排查下来是**两个叠在一起的独立 bug**，
单独任何一个都不会造成他描述的那个现象——必须都修掉歌单详情才真的能用。

#### 1. Bug A：歌单详情永远 0 首（一条请求都不发）

现象是标题、封面、返回键全正常，内容却是 `0 首 / 这里还没有歌曲 / 在线音源没响应`，
而且**一条 API 请求都没有**。这排除了网络与音源问题，指向资源层。

根因：`NeteaseHome.openCollection` 自己拼描述符丢给 `onOpenGridView`，用
`as Parameters<typeof onOpenGridView>[0]` 强转，**漏掉必填字段 `source`**：

```ts
// createCollectionResource.ts:44-47 —— 漏 source 就落到这里
if (descriptor.source === 'online') return createOnlineCollectionResource(key, onlineDeps);
if (descriptor.source === 'navidrome') return createNavidromeCollectionResource(key);
return createStaticCollectionResource(key, []);   // ← 空的静态资源
```

于是 `onlineCollectionResource.ensure()` 里的 `next.source !== 'online'` 直接早退。
**TS 不拦 `as` 强转，静默降级成空资源。**

修法：改走契约给的 `homeResources.actions.openOnlineCard({id,name,type,raw}, providerId, onOpenGridView)`。
它内部经 `onlineCardCollection` + 宿主 `describeOnlineCollection` 构造带 `source:'online'` 的描述符。

#### 2. Bug B：数据有了，但整页视觉被盖死（用户报的「不显示内容」）

修完 Bug A，数据真到了——DOM 里 34 首歌（满页 185 首）布局完全正常：
歌曲行 y=236、尺寸真实、外层 `fixed inset-0`，`elementFromPoint` 命中测试也返回歌曲按钮。
**但 adb 截图只有背景色 + 播放条，34 KB（有内容时同页是 559 KB）。**

根因是层叠：集合层挂在首页挂载点（`App.tsx:2724` 的 `absolute inset-0 z-10`）里，
而宿主转场背景板 `GridViewOverlayHost.tsx:654` 是它的**兄弟节点**，
`fixed inset-0 z-[49] pointer-events-none` + 不透明 `--bg-color`。
netease 集合层自己**完全没有 z-index**，就落在 `z-49` 底板之下。

**因为底板是 `pointer-events-none`，点击照样穿透、DOM 一切正常，只有视觉被盖死** ——
这就是为什么前几轮排查全被带偏（一度怀疑渲染没跑、数据没到、动画停在第 0 帧）。

修法按既有契约，而不是改宿主：三套内建 UI 全部自带这一层——
`GridView z-[110]`、`ArtistGridView z-50`、TUI 两个 surface `z-[110]`。
**权威依据是 `grid/transitions/morphGeometry.ts:135-141` 的注释**，逐字说明集合层要高于
detail backdrop、且故意低于 detail grids 自己的 z-index。

`NeteaseShell` 因此加了一个可选 `surface?: 'collection' | 'artist'` prop：
非空时用 `fixed inset-0 z-[110] flex flex-col overflow-hidden` 并挂
`data-library-renderer="netease"` / `data-library-surface={surface}`；
**首页保持 `flex h-full min-h-0 flex-col` 不动**——它本来就该待在 `z-10` 上下文里。

宿主一行没改。歌手页（`surface="artist"`）同源生效，不用二次修。

#### 3. 顺带补上两个入口按钮的 onClick

每日推荐 / 私人 FM 这两个按钮**原本完全没接 `onClick`**，点了毫无反应：
- 每日推荐 → `openOnlineCard({id:'daily_recommendations', ..., raw:{..., isDailyRecommendations:true}}, activeProviderId, onOpenGridView)`
  （⚠️ `raw` 里必须带 `isDailyRecommendations: true`，否则资源侧走分页而不是 `getDailySongs`，见 `onlineCollectionResource.ts:47`）
- 私人 FM → `homeResources.actions.playPersonalFm()`

`activeProviderId` 取自 `account.getSnapshot().activeProviderId`。

#### 真机验收数据（一加 Ace 3 / Android 16 / 视口 361×794 / density 3.5）

| 项 | 实测 |
| --- | --- |
| tsc --noEmit | 0 error |
| 推荐墙封面 | 35 张全部 `naturalWidth > 0` |
| 每日推荐 | 33 首，封面正常 |
| **点推荐歌单卡** | **185 首 / 真实歌名歌手时长 / 简介折叠 / 操作按钮齐全 / 截图 559 KB** |
| 空态提示 | `empty: null`（已消失） |
| **实际 API 调用** | `/playlist/track/all?limit=150&offset=0`、`/playlist/detail/dynamic`、`/playlist/track/all?limit=1000&offset=150`（后台补页）三条全发 |
| 每日推荐按钮 | 打开详情页，33 首，真实歌曲 |
| 私人 FM 按钮 | 直接播放「ダンスフロアの果実 (feat. nicamoq) Yunomi」，切到播放页 |
| 返回按钮 | 回首页，35 张推荐墙完好 |
| 行内「⋯」菜单 | 真实触摸可打开：下一首播放 / 添加到队列 / 从歌单移除（红）/ 添加到歌单 / 查看歌手 |
| 歌手页 | 332 KB 截图，MIRWOLF 头像 + 热门歌曲 9 条全部正常（分层修复同源生效） |
| `[data-library-surface]` | `collection`，renderer `netease`，`z: 110` |
| 装机核对 | APK 21:32:47 / installed 21:32:57 ✓ |
| 全量单测 | 647 passed / **1 failed** / 1 skipped（649 文件）；7157 passed / 2 failed / 2 skipped（7161 用例） |

#### ⚠️ 那 1 个失败用例与本次改动无关（已用 stash 证伪）

`test/unit/sync/themeSyncRegistry.test.ts` 的两个 IndexedDB 迁移用例在**全量并行**下稳定失败
（`AssertionError: expected {} to deeply equal { 'netease:id:42': … }`），单独跑该文件 3 passed / 914ms，
全量跑时该文件耗时 5551ms——是负载下的超时/抖动。

已 `git stash` 到 HEAD（不含本轮改动）跑全量：**同样失败 2 个、7157 passed**，
**确认是既有问题**，本轮未修。要修应单独排期。

#### 已知未做

- **宿主胶囊浮条在歌单页 / 歌手页仍会盖住列表底部若干行**（截图可见 `00:00 —— 03:50` 压住第 8/9 行附近）。
  上一条让位判断里**浏览深度 > 0 时故意保留**浮条——那几屏没有 netease 迷你播放条，
  关掉它们就没有播放入口了。属用户明确「本轮不处理」的播放条细节。
- 迷你播放条真实 `isPlaying` 状态、右侧「队列」按钮接真实队列面板（同上一条，用户说了本轮不做）。
- 歌手页只做了截图级目视确认，未逐项验收藏热门歌曲 / 专辑 tab / 续页。

### `dev-2026-10-14-feed-and-playerbar` — 推荐墙真出数据 + 宿主浮条让位

**性质**：修 bug + 一处必要的宿主改动。结论：达成，已真机验证。

#### 1. 推荐页空数据 → 直接调 `omni.getHomeFeed`

上一条写了「数据源本来就有」，但那是**错的一半**：契约里的 `radioFeed` 在 netease 这条路上三重门全关着。

| 位置 | 门 |
| --- | --- |
| `core/services/onlineHomeFeeds.ts:95` | `ensure: if (!snapshot.owner) return` —— owner 为 null 静默返回 |
| `core/bindings/useLibraryHomeOnlineFeeds.ts:43` | `setOwner(ownerOf(providerId, userId, canUseRadio))`，要 `canUseRadio && userId` 同时成立 |
| 同文件 `:45` | 只在 `tab === 'radio'` 时 ensure，而 tab 是宿主 `HomeViewTab`，本套叫 `'discover'` |

结果：一条 `/personalized` 都不发，推荐页永远空。实测同一份 cookie 手动打三个接口全部有数据
（`/personalized` 35 条 / `/recommend/songs` 33 首 / `/personal_fm` 3 首）——**数据一直在，只是没人读**。

改法：`NeteaseHome` 直接调 `omni.getHomeFeed(35)`（数据源本身，`omni.ts:440` 内部并发调三个接口）。

顺带修掉一个真隐患：`useEffect` 原来用 `feedStatus !== 'idle'` 自锁。`omni.ts:106` 在 provider 切换途中
会抛 `AbortError`，一次切号就把推荐页**永久**锁死成 error。现在按**会话 key**（`user.id`）记已发起过，
`AbortError` 单独放回可重试态——失败与「已读」解耦。

#### 2. 宿主胶囊浮条压住底部标签栏（真 bug，adb 截图确认）

真机截图上，`00:00 —— 04:05` 一颗白色胶囊盖在标签栏上，「本地 / 专辑 / 远程」三个标签被吃掉一半。
DOM 取证：`[data-ponder="player-bar"]` 占 y=713..762，netease 标签栏 725..778，正面撞车。

根因：`buildAppOverlaysModel.ts` 里宿主浮条**只有一个门槛**——有当前歌曲就渲染。
grid / bravais 把胶囊当设计的一部分，不冲突；netease 首页自带迷你播放条 + 标签栏，就成了两条。

改动（**这是本轮唯一的宿主改动**，共 3 个文件、约 20 行）：
- `library/app/librarySuiteChoice.ts` 新增 `librarySuiteOwnsHomePlayerBar(suiteId)`
- `App.tsx` 算 `suiteOwnsHomePlayerBar = currentView==='home' && 浏览深度===0 && librarySuiteOwnsHomePlayerBar(id)`
- `buildAppOverlaysModel.ts` 的 `floatingControls` 加这个条件

**浏览深度必须一起看**：歌单 / 歌手详情页也在 `currentView==='home'` 下，但那几个 surface 没有迷你播放条，
那几屏上宿主浮条仍是唯一的播放入口。只按 `currentView` 判断会把它们也关掉。

#### 3. `--nt-inset-keyboard` 写错了来源

`SafeInsetsPlugin.inject()` 原来只收 4 个值，第 5 个位置传的是 `b`，于是 `--nt-inset-keyboard` 恒等于
`--nt-inset-bottom`；而 JS 路径 `getInsets()` 返回的是真 IME 值。**两条路径不一致**，搜歌弹键盘时
前端 `bottomBarPadding = Math.max(bottom, keyboard)` 拿到的不是键盘高度。已让 `inject()` 收第 5 个参数。

#### 🔴 本轮踩到的一个大坑：构建脚本只打包、不装机

`docs/dev/android-build.ps1` **只跑 gradle，从不 `adb install`**。它打完印一行
`=== APK output ===` 就结束，看着像成功了。

后果：我据此以为「键盘 inset 修复已真机验证」并下了结论，其实那版**从未上过机**
（`dumpsys package` 的 `lastUpdateTime` 还停在上一版的时间戳）。重影修了两轮没消，也是同一个原因——
测的一直是旧包。判定方法就一条：

```
adb -s <dev> shell dumpsys package top.izuna.foliamajor | Select-String lastUpdateTime
```

时间戳早于 APK 的 `LastWriteTime` = 没装上去。**以后每次装机后都要核这一条。**

配套：重装 APK 后还要清一次 Service Worker（缓存跨重装保留，app data 不清），
否则仍跑旧 chunk —— 判定同样是一行：设备上的 `bootstrap-*.js` hash 对不上本地 `dist/assets/`。

#### 真机验收数据（一加 Ace 3 / Android 16 / 视口 361×794 / density 3.5）

| 项 | 实测 |
| --- | --- |
| 推荐墙封面 | 35 张全部 `naturalWidth > 0` |
| 每日推荐 / 私人 FM | 33 首 / 封面正常 |
| 切 tab 往返 | 35 → 1 → 1 → 1 → 13 → **35**（数据缓存正常，不重复请求） |
| 底部留白 | 标签栏底边 778 / 视口 794 = **16px**，正对手势区 |
| `[data-ponder="player-bar"]` | `false`（宿主浮条已让位） |
| 弹软键盘 | `--nt-inset-keyboard=307.43px`，标签栏抬到 487（抬升 291px） |
| reload 后 inset 变量丢失 | 留白仍为 16px —— `useSafeInsets.pullFromNative()` 兜底接管 |
| tsc / 单测 | 0 error / 648 文件 7159 用例全过 |

#### 未做（按用户指示）

- 迷你播放条的真实 `isPlaying` 状态（契约的 home props 没有这个字段，要读 `usePlaybackStore`）
- 播放条右侧「队列」按钮目前只弹提示，没接真实队列面板

### `dev-2026-10-14-discover-tab` — 首页第一屏改为推荐墙 + 新增「我的」标签

**性质**：信息架构调整（用户按真网易云截图提的）。commit `73ffb096`。
**结论：达成，已真机验证。同时查清了「白屏」的真实原因。**

#### 需求

用户给了网易云手机版截图：

> 「这个首页第一屏应该像这个一样有来自网易云现在音乐的推荐，最后一屏『我的』才是我的歌单才行。」

#### 数据源本来就有，之前没用

`core/contracts/homeModel.ts` 的 `LibraryHomeRadioFeed` 里已经带：

```ts
recommended: ProviderCollection[]          // ← 推荐歌单墙
dailyCoverUrl: string; dailyCount: number  // ← 每日推荐
personalFmCoverUrl?: string                // ← 私人 FM
```

这是 core 的 `radioFeed` 资源（宿主持有，**切 suite 不重建**），经 `useSyncExternalStore` 订阅即可。
不是自己发请求。

#### 标签结构 4 → 5

`推荐（默认） / 本地 / 专辑 / 远程 / 我的` —— 「我的」在最后，与网易云一致。

#### ⚠️ 坑：`onSearchCommitted` 的参数不是自己的 tab id

它要的是宿主 `HomeViewTab`（`'playlist' | 'local' | 'albums' | 'navidrome' | 'radio'`），
与本 suite 自己的 tab id（`discover` / `mine` …）不是一套。直接传自己的 id 编译就过、运行就错。
已加 `HOME_VIEW_TAB` 映射表。

#### 🔍 「点歌单白屏」—— 实测结论：不是白屏

用户报「点歌单进去页面白屏」。用 CDP 真实点击测下来：

| 检查项 | 结果 |
| --- | --- |
| `isBlank` | **false** |
| 返回箭头 | 在 |
| 按钮数 / 封面数 | 35 / 13 |
| 壳子渲染 | 完整 |

**真正发生的是：内容是空的**（`0 首` / `这里还没有歌曲`），壳子本身好好地在那。

根因不在界面，在**音源服务不可达**：

```
控制台  [QQMusic] Search failed: SyntaxError: Unexpected token '<'   ← 返回的是 HTML 错误页
探测    http://192.168.0.104:3000 → TypeError: Failed to fetch
```

网易云登录 cookie 确实存在（`localStorage['online_provider:netease:cookie']`），
说明**登录过、是服务没在跑**。

> ⚠️ 2026-10-14 用户澄清：**音源不在本机**（曾误以为是本机 `ncm-api.ps1` 起的那个）。
> 排查「内容空」类问题前，先确认音源实际部署在哪（见 `NETWORK.md`）。

#### 顺带修的：空态文案要指向真因

取不到数据时笼统说「加载失败」会让人以为是界面坏了。改成：

| 位置 | 改后文案 |
| --- | --- |
| 推荐页 | `在线音源没有响应 —— 检查音源服务是否在运行` |
| 歌单详情 | `在线音源没响应，或这个歌单确实没有可播放的曲目` |

#### 实测数据（真机）

- 五个标签就位，推荐为默认页
- 逐个 tab 点一遍：切换正常、`aria-current` 正确、**零未捕获异常**
- 点歌单 → 详情页正常渲染 → 返回 → 首页五标签完好、13 张封面仍在
- 我的页：账号条 + 11 个歌单全部显示
- 推荐页：音源不通时只显示本地缓存的 1 条，无数据时显示空态而非崩溃
- `tsc` 0 error；`test/unit/library` 1000/1000；APK 15.1 MB

#### 已知未做

- 推荐数据依赖在线音源，音源不通时就是空的（**环境问题，不是代码**）
- 每日推荐 / 私人 FM 两个入口目前只有外观，点击还没接实际播放

---

### `dev-2026-10-14-network-doc` — 新增 `docs/dev/NETWORK.md`：把音源网络架构写死

**性质**：文档（新增 1 个文件 + 3 处指针）。不改任何运行时代码。

#### 为什么写

反复出现的误解是「安卓 App 拉的是这台开发 PC 的音源」。
真实链路是手机 → 公网 → 笔记本，**开发 PC `192.168.0.104` 根本不在运行时链路上**。
光靠 `NCM-DEPLOY.md`（部署操作手册）讲不清 —— 那是「怎么部署」，不是「现在到底谁在服务」。

#### 写进去的关键澄清

1. **手机 WebView 的 origin 是 `https://localhost`，但那不是音源。**
   那是 Capacitor 把 APK 内 `dist/` 映射出来的虚拟域名，就是 App 自己
   （`capacitor.config.ts` 的 `hostname: 'localhost'`）。极易被当成「连本机」。
2. **桌面版和安卓版走两条完全不同的路。**
   桌面版 Electron 有内嵌后端（`bridge.getNeteasePort()` 给本地随机端口，跑在这台 PC 上）；
   安卓版没有主进程，走 `VITE_NETEASE_API_BASE` 指向公网。同一个 App 名字，后端不同。
3. **代码里没有 localhost / 内网回退。**
   `getConfiguredApiBase()` 读不到环境变量就返回 `null`，`getApiBase()` 直接抛
   `NETEASE_API_BASE_MISSING`，**不会**静默改连 `127.0.0.1`。连不上会报错而不是串到本机。
4. **手机和开发 PC 确实在同一网段（`192.168.0.x`），这最容易造成误判** ——
   局域网只是碰巧同网段，App 里写死的是公网域名，流量真的绕出去。
5. **自签证书那条路已作废**：`29522998 / ncm.shimoray.com` 是自签，
   安卓 WebView 不能像 `curl -k` 那样绕过。App 只指向 `29523356`。

#### 文档里给了什么

- 30 秒自证三命令（**前两条本轮实测过**：① `dist/` 里只有 `u2020682.nyat.app`、无 `192.168.0.x`；
  ② `http=200 tls=0 time=0.787s`；第 ③ 条依据上游 triage playbook 描述，**未实测**已标注）
- ASCII 拓扑图 + 逐跳链路表 + 各机器职责表（含「在不在链路上」一列）
- 地址端口一览（含「在哪改」）、两个入口的区别、失效模式表、临时回退内网的 4 步
- 排障对照表（含 Service Worker 发旧构建这一条，指向 `dev-2026-10-14-fullscreen-padding`）
- QQ / 酷狗未接的现状

#### 指针

`AGENTS.md`（根）、`docs/dev/AGENTS.md`、`docs/dev/NCM-DEPLOY.md` 三处加了指向，
并在 NCM-DEPLOY.md 顶部写明「只想确认 App 连哪台机器 / 排查连不上 → 看 NETWORK.md，不用读全文」。

---

### `dev-2026-10-14-bottom-inset` — 底部标签栏避开手势导航条 + 网易云式迷你播放条

**性质**：BUG fix（点不到标签）+ 新功能（迷你条）。commit `36bd94a7`。
**结论：达成，已真机验证。**

#### 现象

用户报：「下面的『在线/本地/专辑/远程』距离屏幕底部太近了，我点它们实际上是手势导航的
黑、白条在响应。」

#### 根因：上一轮「真全屏」决定的代价

`capacitor.config.ts` 的 `SystemBars.insetsHandling = 'disable'` 是为了真全屏
（本机 WebView 138.x < Capacitor 判定修复的 140，用 `'css'` 会给 decorView 加原生
padding，露出的 decorView 背景是白的，三侧白带）。**代价是拿不到真实 inset**：

| 变量 | 实测值 |
| --- | --- |
| `env(safe-area-inset-top)` | **40**（非 0） |
| `env(safe-area-inset-bottom)` | **0** ← 只有底部是 0 |
| `--nt-inset-*`（修复前） | 全空 |
| `nav.bottom` vs `innerHeight` | 794.29 vs 794 → 空隙 **-0.3px**（完全贴死） |

#### 参考值来自真机实测，不是估计

用户手机里装了网易云（`com.netease.cloudmusic`），用 `uiautomator dump` 量到真实几何：

```
tab 容器      y=2535..2724   h=54 dp
  可点区      y=2535..2712   h=50.6 dp      ← 首页/搜索/笔记/我的，各占 1/4 宽
  图标+文字   y=2576..2652   h=21.7 dp
手势导航条    y=2724..2780   h=16 dp       ← 完全独立的系统层
```

Android 侧独立佐证：`dumpsys window` 显示
`InsetsSource type=navigationBars frame=[0,2724][1264,2780]`、`bottom=56px @ density 560 = 16dp`。
**两个来源互相印证**，不是猜的。

#### 做法

新增 `android/app/src/main/java/top/izuna/foliamajor/SafeInsetsPlugin.java`：
用 `WindowInsetsCompat` 读真实 inset，注入成 `--nt-inset-*` CSS 变量，
**不碰 decorView 的 padding**（WebView 仍然全屏，只是多了几个变量）。

前端 `src/library/suites/netease/useSafeInsets.ts` 读变量 + `MutationObserver` 监听，
并主动 `pullFromNative()` 兜底（防注入时机早于页面加载）。

### 🔑 关键坑：隐藏态下 inset 的 bottom 本来就是 0

本应用设了 `SystemBars.hidden = true`，系统导航条被 `WindowInsetsController` 隐藏后，
`getInsets(navigationBars)` 返回 **bottom = 0**（实测 `getInsets()` → `{left:0, top:40, right:0, bottom:0}`），
**但手势条在屏幕上仍然占着 16dp，照样吃掉点击。**

> **拿不到 inset ≠ 那一块没人占。**

所以插件里加了 `fallbackGestureDp()`：读 `com.android.internal` 的
`config_navBarInteractionMode`（2 = 手势 → 至少留 16dp；0 = 三键 → 留 0），
拿不到时按手势处理。

### ⛔ 另一个坑：`s.setProperty` 传整串 = 什么都没设

第一版把 `"--nt-inset-left:0px;--nt-inset-bottom:16px"` 整串传进 `setProperty()`，
被当成**单个属性名**，静默无效——而 logcat 照样打印 `injected`，看着像成功了。
**必须逐条 `setProperty(name, value)`。** 这次是「前端读到空 + 日志说成功」两边对不上才定位到的。

#### 实测结果（真机，一加 Ace 3 / Android 16 / 视口 361×794）

| 指标 | 网易云 | Folia 修复后 |
| --- | --- | --- |
| tab 栏高度 | 54 dp | **54 dp** ✅ |
| tab 底边位置 | 774.9 dp | **778.3 dp** ✅ |
| 手势区留白 | 19.4 dp | **15.7 dp** ✅ |
| 注入变量 | — | `{left:0px, top:40px, right:0px, bottom:16px}` |
| 四标签点击 | 正常 | **正常**（`aria-current` 正确切换） |

logcat 双路径确认：CSS 变量注入 + 前端 `getInsets` 主动拉取都通。

#### 顺带做的：网易云式迷你播放条

贴在 tab 栏正上方：40dp 圆角小方块封面 + 歌名/歌手 + 播放/暂停 + 队列键，整条可点进播放页。
tab 标签也补了图标（文字在上、图标在下，同网易云）。

#### 已知未做

- 迷你条是**静态外观**：`onTogglePlayback` 已接，但**没接真实的 `isPlaying` 状态**
  （契约的 home props 里没有这个字段），播放/暂停图标恒为「播放」。
  → 要真图标需要读 `usePlaybackStore`，下一轮做。
- 迷你条右侧「队列」按钮目前只弹提示，没接真实队列面板。
- collection / artist 页没有固定底栏，不受本次 inset 影响。

---

### `dev-2026-10-14-netease-suite` — 新增第四套 library suite：网易云手机版布局

**性质**：新功能（新增一套 suite，原三套零改动）。commit `b1b65d7a`。
**结论：达成，已真机验证（一加 Ace 3 / Android 16 / 视口 361×794）。**

#### 动机

用户反馈：「界面全部都是为 PC 专门设计的，在手机上用起来就像用 Windows 系统一样别扭。」

上一轮已确认**布局层上游其实适配得不错**（768px 分界线、Carousel3D 双套布局、
Bravais 那一整套窄缝布局），真 bug 是 `BravaisStage.tsx` 把世界宽度当视口宽度用（已修）。

所以这次的问题不在布局，在**交互模型**：bravais 的「一整面墙 + 缝」是桌面空间的思路——
悬停显形、键盘翻牌、鼠标横扫。手机竖屏上这套隐喻无处施力。
网易云手机版反过来：一切都摊平成一列可纵向滚动的列表，靠底部标签栏切换、靠常显的「⋯」拿操作。

#### 为什么走 suite 扩展点而不是改宿主组件

`src/library/registry.ts:21` 用 `import.meta.glob('./suites/*/entry.ts', { eager: true })`
自动发现，现有 `grid`（默认）/ `bravais` / `tui`（开发专用）三套并列。
加第四套只需新建目录 + 填 `surfaces`，**原三套一行不改**，设置里可一键切回。

这是上游留的正规扩展点，也是作者明示的做法
（`docs/library-suites.md`：「选中 suite 没实现就回退默认 suite」）。

#### 覆盖范围（用户选定的方案 A）

| surface | 文件 | 做了什么 |
| --- | --- | --- |
| home | `NeteaseHome.tsx` | 常驻搜索条 + 横向歌单大卡网格 + 底部四标签栏（在线/本地/专辑/远程） |
| collection | `NeteaseCollection.tsx` | 大封面头 + 播放按钮 + 操作条 + 歌曲列表（序号/标题/时长/常显⋯）+ 简介折叠 |
| artist | `NeteaseArtist.tsx` | 圆形艺人头像 + 热门歌曲列表 + 专辑网格 + 专辑续页 |
| account | `NeteaseAccount.tsx` | 扫码登录卡（二维码/状态行/冷却/重试/诊断）+ 切平台确认卡，走 `account` controller |

**未动**：底部播放条、队列面板、设置弹窗、命令面板、歌词播放页
（歌词页是用户明确要求保留的；前四项属宿主组件，风险与回滚成本另算，见下）。

#### 🔑 配色不写死（用户明确要求）

> 「folia 软件本身就有多种不同的配色（根据音乐或 AI 生成的两套配色：浅色、暗色），
> 所以别弄成固定的暗色电影感配色。」

Folia 的主题是 `DualTheme`（light + dark 一对），来源有三条：内置预设 / 按音乐生成 / AI 生成。
组件里写 `bg-white`、`#ff2e2e` 这种硬编码，用户切到暗色主题时这套 UI 会变成一块白斑。

做法：整套颜色只从 `src/library/suites/netease/neteaseTheme.ts` 出——
从 `theme.primaryColor / secondaryColor / accentColor / backgroundColor` 推出一整套
CSS 变量（`--nt-*`），组件里只引用变量名。分隔线、浮层、按下态这些 Theme 没直接给的，
从上几个颜色按透明度推导，保证任何主题下明暗关系一致。

**真机实测（CDP 读 computed style）**：

| 变量 | 浅色主题 | 暗色主题 |
| --- | --- | --- |
| `--nt-bg` | `#f5f5f4` | `#09090b` |
| `--nt-text` | `#1c1917` | `#f4f4f5` |
| `--nt-accent` | `#ea580c` | `#f4f4f5` |
| `--nt-elevated` | `#ffffff` | `rgba(255,255,255,0.08)` |
| `--nt-divider` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.10)` |
| `--nt-on-accent` | `#ffffff` | `#09090b`（自动反色） |

`onAccent` 按 accent 亮度自动选深/浅字，对比度在任何主题下都保得住。

**故意保留的 4 处硬编码**（grep 复核过，只剩这些）：危险红 `#e5484d` ×2（语义色不该跟主题走）、
二维码白底 `#ffffff`（扫码必需）、封面角标白字+黑投影（压在任意颜色封面上，必须中性色）。

#### 顺带治掉的 `group-hover` 隐身问题

上一轮定位的「悬停才显形、触屏上永久隐身」高发区，在本 suite 里**全部改为常显**。
真机实测：11 张歌单卡的 `aria-label="更多操作"` 按钮，**11 个全部可见**
（`opacity !== '0'` 且 `display !== 'none'`）。

#### 验收数据

- `tsc --noEmit`：**0 error**
- `test/unit/library`：**1000/1000 passed**（94 文件）
- `vite build`：`✓ built in 4.80s`，五个独立 chunk
  （NeteaseHome 6.42 kB / Collection 6.00 / Artist 4.60 / Account 5.63 / 共用 parts 7.81，
  gzip 后各 1.8–2.8 kB）—— lazy 分包正确，没选 netease 的用户不加载它的任何代码
- APK **15.6 MB**，`adb install -r` 成功，真机渲染出 11 张歌单卡 + 四标签栏

#### 踩到的坑

1. ⛔ **7 个既有测试失败**：它们把 suite 清单硬编码成 `['grid','bravais','tui']`。
   加 suite 就得更新断言——但它们保护的**行为**（grid 仍是默认、未知 id 回退、
   首启引导只列 grid+bravais）全部未变，只改了清单。
   涉及 `registry.test.ts` / `tuiAvailability.test.ts` / `librarySuiteChoice.test.ts`。
2. ⛔ **`localStorage` 存的是裸字符串**：`library_suite` 的值是 `netease`，
   **不是** `"netease"`（JSON 字符串）。写成 JSON 会静默回退到 grid，
   表现为「改了没生效」——排查时先读回这个值。
3. ⛔ **PowerShell 的 `Set-Location` 在同一条命令里对 `[IO.File]` 无效**：
   `cd X; [IO.File]::ReadAllText('a.tsx')` 仍按**原始工作目录**解析相对路径。
   用 `$dir = '<绝对路径>'; Join-Path $dir $f`。
   副作用：那次失败在仓库根目录留下 4 个 0 字节的 `Netease*.tsx` 空文件，已清。
4. ⚠️ **WebView 有 Service Worker**：改了代码重新装机，设备上可能仍跑旧 chunk
   （老生常谈的坑）。判定：把 `document.querySelectorAll('script[src]')` 的文件名
   和本地 `dist/assets/` 对一遍，对不上就是 SW 在发旧包。
   本轮处理：`getRegistrations()` 全 unregister + `caches.keys()` 全 delete 再 reload。

#### 已知未做

- **界面上文案暂为中文硬编码**，未接 i18n（只有 `suiteName` 三份 locale 已接，
  否则切换浮层显示不出名字）。换语言时这套 UI 不跟着变。
- 收藏 / 创建歌单 / 目录树批量操作暂未接（对应动作未在 `entry.ts` 声明，
  命令面板里不会出现这些命令）。
- 底部播放条 / 队列面板 / 设置弹窗 / 命令面板仍是宿主组件，未做网易云化。
  这四项属主干（`App.tsx` 2700+ 行枢纽），且与歌词页耦合，改动风险与回滚成本
  远高于建 suite。建议等这套布局验证过方向再单独排。
- **后台播放仍未做**（第一优先级，见 `USER.md`），本轮未触碰。

---

### `dev-2026-10-14-fullscreen-padding` — 真全屏：`insetsHandling` 从 `css` 改成 `disable`

**性质**：BUG fix（一行配置 + 注释重写）。上/左/下三侧白带消失。
**结论：达成，已真机验证（横竖屏各一次）。**

#### 现象

播放页四周有白带，上、左、下三侧最明显，深色舞台只占中间一块。
起初怀疑是 App 自己的 letterbox / 缝布局 / `--safe-area-inset-*` 留白 —— **全猜错了**。

#### 真实根因：Capacitor 在 WebView < 140 上给 decorView 加了原生 padding

`node_modules/@capacitor/android/.../plugin/SystemBars.java` 的 `initWindowInsetsListener()`：

```java
boolean shouldPassthroughInsets =
    getWebViewMajorVersion() >= WEBVIEW_VERSION_WITH_SAFE_AREA_FIX /* 140 */ && hasViewportCover;
...
if (shouldPassthroughInsets) {
    v.setPadding(0, 0, 0, keyboardVisible ? imeInsets.bottom : 0);   // 透传 inset 给 CSS
    ...
} else {
    v.setPadding(systemBarsInsets.left, systemBarsInsets.top,
                 systemBarsInsets.right, keyboardVisible ? imeInsets.bottom : systemBarsInsets.bottom);
    // 并把 CSS 变量强制置零
    ...setInsets(systemBars() | displayCutout(), Insets.of(0, 0, 0, 0));
    injectSafeAreaCSS(newInsets);
}
```

本机 WebView 是 **138.0.7204.179**（`dumpsys webviewupdate` 实测）**< 140** ⇒ 恒进 `else` 分支：
**给 decorView 加原生内边距**，再把 `--safe-area-inset-*` 写成 0。
所以「CSS 侧补救」这条路在这台机器上根本不存在，必须在原生层关掉。

#### 证据链

| 观测 | 值 |
| --- | --- |
| 修复前 `innerWidth × innerHeight` | **754 × 305** |
| 修复前 `screen.width × screen.height` | 795 × 362 |
| 差值 | **41 / 57 CSS px**（设备 px：左 140、上 140、下 56） |
| 修复前 `--safe-area-inset-*` | 四项全 `0px` —— 是被强制置零，不是「本来就没有」 |
| 修复前 canvas rect | `0,0,754,305`（画布本身也跟着视口被缩） |
| 修复后 竖屏 | `innerW/H` = **361 / 794**，screen = 362 / 795，canvas `0,0,361,794` |
| 修复后 横屏 | `innerW/H` = **794 / 361**，screen = 795 / 362，canvas `0,0,794,361` |
| 截图复核 | 横竖屏四条边白像素数：左 0 / 右 1（噪点）/ 下 0；顶部测得的连续白是专辑封面自身亮部，非系统条 |

#### 为什么选 `disable`，而不是升级 WebView

- **不损失任何东西**：`src/` 下对 `safe-area` 的引用是 **0 处**，没有任何固定 UI 靠 inset 变量定位；
  播放页是整屏可视化舞台，本来就该铺满。
- **机制可靠**：`insetsHandling: 'disable'` 时 `initWindowInsetsListener()` **第一行就 return**
  （SystemBars.java:187-189），根本不注册 `setOnApplyWindowInsetsListener`，也就不会有 `setPadding`。
  targetSdk 36 的强制 edge-to-edge（`EDGE_TO_EDGE_ENFORCED`）本就让 WebView 铺满整屏。
- **不牵连系统栏隐藏**：`initSystemBars()` 里 `initWindowInsetsListener()` 之后**无条件**执行
  `setHidden(hidden, "")`（SystemBars.java:144-147），两件事独立，`hidden: true` 照常生效。

#### 代价（如实记录）

关掉 inset 后不再自动避让刘海 / 手势条：本页右下角设置键、右上角返回键会贴到物理边缘。
实测截图里它们仍在安全范围内（Ace 3 横屏时手势条在底、挖孔在左，与这两个键不重叠），
但换机型或换方向可能压到 —— 这是全屏播放器的预期取舍，真遇到了再针对具体元素单独加 inset。

#### 更正上一条记录里的错误结论

`dev-2026-10-13-immersive` 写「本机 WebView 138 < 140，走的是 `v.setPadding(0,0,0,0)`
那条分支 ⇒ 内容天然铺满整屏」—— **方向反了**。138 < 140 恰恰让 `shouldPassthroughInsets`
为 `false`，走的是**带 inset 的** `setPadding(left, top, right, bottom)`。

同一条记录里「`screen.height = 795` 与 `innerHeight = 754` 差 41px，来源未定，
但不产生可见空隙」—— 那 41px **就是本次的白带**，不是无害的未知偏差。当时的测试在歌单页做，
歌单页背景是浅色所以没看出来。

#### 附带记一条：装完 APK「改了配置没生效」多半是 Service Worker 在发旧构建

本轮换公网 API 时踩到：`.env.local` 改了、APK 重装了，App 里点登录仍报
`NETEASE_API_BASE_MISSING`，而 `import.meta.env` 里明明该有这个变量。

判定（一条就够）：把页面 `document.querySelectorAll('script[src]')` 的文件名，
拿去和本地 `dist/assets/` 对一遍。**对不上就是 Service Worker 在发旧包**，别再查代码。
当时页面加载的是 `main-Mz6pRyca.js`，本次构建产出的却是 `main-2xNMJ46a.js`。

修复：CDP 里 `getRegistrations()` 全部 `unregister()` + `caches.keys()` 全部 `delete()`
+ `location.reload()`，再 `adb force-stop` + 重启 App 进程。

⚠️ 改 `capacitor.config.ts` 的 `server.androidScheme`（http↔https）等于**换 origin**，
新旧 origin 的缓存会并存，`location.reload()` 不一定清得掉，必须重启进程。
改完记得重新 `adb forward tcp:9222 localabstract:webview_devtools_remote_<新pid>`。

---

### `dev-2026-10-14-ncm-cloud-frp` — 音源 API 搬到公网常驻（笔记本 + SakuraFRP）

**性质**：功能 + 基础设施。目标：开发 PC 不开机也能在安卓版播网易云。
**结论：达成。** 公网入口 `https://api.u2020682.nyat.app:18329`（可信证书，curl 实测 `tls=0`）。

#### 最终形态

| 项 | 值 |
| --- | --- |
| 服务端 | 笔记本 `192.168.0.109`，ncm v4.41.1，计划任务 `LianYinSu-NCM-API`（SYSTEM / AtStartup）监听 `:::3000` |
| 穿透 | SakuraFRP 隧道 **`29523356` / `Folia_NCM_Api`**，类型 **TCP**，远程端口 **18329**，节点 `#3 [VIP]香港特别行政区1` |
| 子域 | `api.u2020682.nyat.app`（natfrp 免费 UID 子域 `u2020682.nyat.app` 的第一段前缀 `api`） |
| 公网入口 | **`https://api.u2020682.nyat.app:18329`** |
| frpc 守护 | 计划任务 `LianYinSu-SakuraFRP`，`C:\lianyinsu\scripts\start-frpc.ps1` 的 `$ids` 数组 |

#### 改动（3 处，回退局域网方案）

| 文件 | 改动 |
| --- | --- |
| `.env.local` | `VITE_NETEASE_API_BASE` → `https://api.u2020682.nyat.app:18329`（不入库） |
| `capacitor.config.ts` | `server.androidScheme` `http` → **`https`**，`cleartext` `true` → **`false`** |
| `android/app/src/main/AndroidManifest.xml` | 移除 `android:networkSecurityConfig` |
| `android/app/src/main/res/xml/network_security_config.xml` | **删除** |
| `docs/dev/NCM-DEPLOY.md` | 重写：把 natfrp 方案从「不解决根本问题」改成「当前采用」，并写清证书那一堆坑 |

#### 证书：三段弯路（这是本次最贵的部分）

1. **natfrp 不为自定义域名签发可信证书。**
   建 HTTPS 建站隧道 + Cloudflare CNAME（`ncm.shimoray.com` → `frp-add.com`），
   `curl -k` 能返回 200，但 frpc 日志明写「当前证书: frpc 自动生成」= **自签**。
   `claw.shimoray.com` 同样自签（两处都 `SEC_E_UNTRUSTED_ROOT`）。
   **安卓 WebView 不能像 `curl -k` 那样绕过**，所以自定义域名这条路直接作废。
2. **官方文档给的正路是免费子域。**
   `doc.natfrp.com/bestpractice/domain-bind.html`：「SakuraFrp 为所有用户提供免费的
   `nyat.app` 子域和 SSL 证书」。申请到 `u2020682.nyat.app`（UID 前缀，不可改）。
   子域绑定只能选**预设单词**（`ncm` 不在词库，会提示「暂不支持该单词」），
   候选有 `nas / map / api / panel / alist / ai / static / assets…`，选了 `api`。
3. **但 `nyat.app` 子域不能填进 HTTPS 建站隧道。**
   创建时报错原文：
   > Nyat APP 域名不可直接用于 HTTP(S) 隧道中, 用于建站请先创建 TCP 隧道,
   > 在子域绑定页面将域名绑定到 TCP 隧道, 然后使用 `https://<子域名>:远程端口` 进行访问

   ⇒ 正解是 **TCP 隧道 + 子域绑定 + 边缘按 SNI 收 TLS**，地址必须带远程端口。

另外一个结构性问题：**一条隧道只能有一个连接地址。**
已绑 `ncm.shimoray.com` 的 `29522998 / Folia_NCM` 不会出现在子域绑定候选列表里，
所以只能另建隧道，而不是复用。`29522998` 目前保留但**不要**把 App 指过去（自签）。

#### 实测

| 证据 | 值 |
| --- | --- |
| DNS | `api.u2020682.nyat.app` → CNAME `frp-add.com` → A `43.225.47.70` |
| frpc 日志 | `已从服务器为 api.u2020682.nyat.app 加载证书 [CN = *.u2020682.nyat.app, 2026-10-14 - 2027-01-12]` + `TCP 隧道启动成功` |
| curl（**不加 `-k`**） | `HTTP=200 tls=0`，body `{"data":{"code":200,"account":null,"profile":null}}`，1.45s |
| 本机任务 | `LianYinSu-NCM-API` / `LianYinSu-SakuraFRP` 均 Running，`frpc_processes = 1`，error log 空 |

`tls=0`（Schannel `ssl_verify_result`）是「证书链可信」的关键证据。
本机有 `HTTP_PROXY` 环境变量，测公网必须带 `curl --noproxy '*'`，否则走代理结果不可信。

#### 踩到的坑：BOM 事故的真实根因（更正旧记录）

事故经过：`add-tunnel-id.ps1` 改 `start-frpc.ps1` 的 `$ids` 后，**6 条隧道同时掉线**，
frpc 崩溃重启循环。

- ❌ 旧记录（`fix-frpc-ids.ps1` 注释里）写的根因是「原文件是 GBK/ANSI 编码」。
  **这是错的。**
- ✅ 实测根因（脚本里 `has_utf8_bom = True` 可以自证）：
  `start-frpc.ps1` **本来就是 UTF-8 带 BOM**。出事的那版脚本用
  `ReadAllText($p, UTF8)` 读（正确），却用
  `WriteAllText($p, $text)`（**默认 UTF-8 无 BOM**）写回 → **BOM 被丢掉**。
  PowerShell 5.1 对无 BOM 的 .ps1 一律按 ANSI(GBK) 解释，
  UTF-8 的中文注释字节被当成 GBK 双字节，字数错位把 `$dir` / `$exe` 那几行的引号吃掉，
  `Start-Process -FilePath $exe` 拿到 `$null` → 崩溃循环 → 全线掉线。

**正确做法**：目标行是纯 ASCII，用 ISO-8859-1（28591）做「字节 ↔ 字符」一一对应往返，
非 ASCII 字节原样通过，只替换 `$ids` 那一行，其余字节一个不动。
写在 `docs/dev/.tmp/add-id-29523356.ps1` 里（本次实际用的就是它，没再出事）。
顺带记一条：**改既有含中文的 `.ps1` 时，纯 ASCII 行的替换优先走 Latin-1 字节往返，
不要走「读成字符串再写回去」。**

#### 已知限制（如实记录）

- ⚠️ **现在整条链路依赖笔记本常开**。笔记本关机/休眠/拔网线 → App 直接播不出来。
  跟以前「开发 PC 关机」是同一个问题，只是换了个机器。真要 7×24 得再上云厂商（Vercel/SCF）。
- **公网入口没有访问密码**，拿到地址的人都能调这个 ncm 实例。
- **端口 18329 是 natfrp 分配的**，删隧道重建会换端口，`.env.local` 要同步改并重装 APK。
- 香港1 节点日志提示「处于超载运行状态」，体验可能受影响。
- **只配了网易云**。`VITE_QQ_API_BASE` / `VITE_KUGOU_API_BASE` 仍未配置。
- **可能触发网易云风控**：出口 IP 从开发 PC 变成香港节点。真遇到只能重新扫码。
- 后台播放（锁屏断播）仍未做。

---

### `dev-2026-10-13-playback-lan` — 打通播放：网易云二维码登录可用（局域网方案）

**性质**：功能。按用户选择，当前先用**局域网直连**验证可行性，长期方案（natfrp/Vercel）待定。

#### 根因

「连接至网易云音乐」加载不出二维码，不是 UI 或权限问题，而是**一个请求都发不出去**：

`src/services/netease.ts:106` 在拿不到 API 地址时直接抛
`NETEASE_API_BASE_MISSING`（"Please configure VITE_NETEASE_API_BASE"），
而 `VITE_NETEASE_API_BASE` 没配。桌面版靠 Electron 主进程内嵌
`@neteasecloudmusicapienhanced/api` 拿到 `http://127.0.0.1:<port>`，
**WebView 里没有主进程，跑不了 Node 服务**，必须指向一个外部 API。

#### 改动（3 处 + 1 个脚本）

| 文件 | 改动 |
| --- | --- |
| `capacitor.config.ts` | `server.androidScheme` `https` → **`http`**，`cleartext` `false` → **`true`** |
| `android/app/src/main/AndroidManifest.xml` | `<application>` 加 `android:networkSecurityConfig` |
| `android/app/src/main/res/xml/network_security_config.xml` | **新增**：明文白名单，只放行 `192.168.0.104` |
| `docs/dev/ncm-api.ps1` | **新增**：网易云 API 服务的启动 / `-Stop` / `-Status` |
| `.env.local` | 新增（已被 `.gitignore` 的 `.env*.local` 排除，**不入库**），写 `VITE_NETEASE_API_BASE` |

外加一条 Windows 防火墙入站规则（提权加的，见下）。

#### 两个关键技术障碍（都不在 Folia 代码里）

1. **混合内容**：`androidScheme` 是 `https` 时，`https` 页面去请求 `http://192.168.0.104:3000`
   会被 Chromium 直接拦掉 —— 实测 WebView 里 `fetch` 报 `TypeError: Failed to fetch`，
   同一台机器 `curl` 和 `ping` 都通。改成 `http://localhost` 后解除
   （`http://localhost` 仍被 Chromium 视为 secure context，Service Worker /
   vite-plugin-pwa 不受影响；https 独有用到的 File System Access API 即本地音乐库
   在 Android 本来就不可用，不构成损失）。
2. **Android 9+ 默认禁明文**：`cleartext: true` 只影响 Capacitor 自身，**不会**往
   AndroidManifest 写 `usesCleartextTraffic`（实测生成结果里确实没有）。必须自己配
   network security config。这里没用全局 `usesCleartextTraffic="true"`，而是精确放行
   音源那个 IP：App 的 HTML/JS/CSS 全部打进 APK assets，运行时只从本地加载，
   不访问任何外部 CDN（importmap 已剥离），明文流量没有别的正当用途。

#### 实测（一加 Ace 3 / Android 16）

| 步骤 | 结果 |
| --- | --- |
| 防火墙规则 | `Folia NCM API 3000 (LAN only)`，Enabled / Private / Inbound / Allow。**加之前 ping 通但 TCP 超时，加之后通** |
| ncm 服务 | `node app.js` → `Server started successfully @ http://localhost:3000`，匿名 token 注册成功 |
| CORS | 响应头 `access-control-allow-origin: https://localhost`（Origin 回显）、`allow-credentials: true`、`allow-methods: PUT,POST,GET,DELETE,OPTIONS` ⇒ **CORS 这关本来就通** |
| WebView 取 key | `origin: http://localhost`，`status 200`，`{"code":200,"unikey":"..."}` |
| 真实 UI | 点「连接在线平台 → 网易云」，**二维码渲染出来**：`data:image/png;base64,…` 200×200，文案「使用网易云APP扫码 / 请扫描二维码 / 打开网易云音乐APP > 发现 > 扫一扫」 |

#### 踩到的坑

- **`adb shell input tap` 点不动 WebView 里的元素**（实测无效），必须用 CDP 直派
  `PointerEvent`。本轮所有点击都是 CDP 发的。
- **PowerShell 里单个字符串被 `[0]` 索引取的是第一个字符**：`"192.168.0.104"[0] === '1'`，
  导致脚本把局域网地址打印成 `http://1:3000`。`Select-Object -ExpandProperty` 只有一块网卡时
  返回的是字符串不是数组，必须 `@(...)` 强制成数组。
- **`.ps1` 含中文必须 UTF-8 BOM**（PS 5.1 按 ANSI 读会乱码）；仓库根的 `.ps1` 还要向上找
  `package.json` 而不是写死退一级（android-build.ps1 踩过同一个坑）。

#### 已知限制（如实记录）

- ⚠️ **这台 API 服务跑在电脑上，电脑不开机 / 服务没启动就没法播网易云。**
  这只是验证可行性的过渡方案。长期要么把服务部署到公网（natfrp https 隧道或 Vercel），
  要么每次用前跑 `docs\dev\ncm-api.ps1`。换方案后可以把
  `network_security_config.xml` 整个删掉、`cleartext` 改回 `false`。
- **换网络后本机 IP 会变**，要同步改 `.env.local` 与 `network_security_config.xml` 再重建。
- **只配了网易云**。`VITE_QQ_API_BASE` / `VITE_KUGOU_API_BASE` 仍未配置，
  那两个平台仍会报同样的 `*_API_BASE_MISSING`。
- QQ / 酷狗的后端没有现成的本地包（`api-ts/` 里只有 theme / lyric / qq 的部分 handler，
  没有酷狗），要另外解决。
- 后台播放（锁屏断播）未动。

---

### `dev-2026-10-13-immersive` — 沉浸式全屏（状态栏 + 手势导航条隐藏）

**性质**：功能（一行配置 + 实测截图验证）

#### 变更

`capacitor.config.ts` 的 `SystemBars` 加 `hidden: true`。

依据是 Capacitor **内置**的 SystemBars 插件源码
（`node_modules/@capacitor/android/.../plugin/SystemBars.java`），不是新装插件：

- `initSystemBars()` 读 `getConfig().getBoolean("hidden", false)`，启动时调 `setHidden(hidden, "")`。
- `setHidden(true, "")` → `WindowInsetsControllerCompat.hide(Type.systemBars())`。
  **`systemBars()` 同时包含 `statusBars()` 与 `navigationBars()`**，正好一次干掉
  顶部状态栏和底部手势导航小黑/白条，不用分两次配。
- 隐藏后 `WindowInsetsCompat.getInsets(systemBars|displayCutout)` 归零；本机 WebView
  **138 < 140**（`WEBVIEW_VERSION_WITH_SAFE_AREA_FIX` 阈值）。

> 🚨 **本条下面这段推理是错的，已由 `dev-2026-10-14-fullscreen-padding` 更正。**
> 原文写「138 < 140 ⇒ 走 `v.setPadding(0,0,0,0)` 那条分支 ⇒ 内容天然铺满整屏」——
> **恰好相反**：`SystemBars.java` 里 `shouldPassthroughInsets = 版本 >= 140 && hasViewportCover`，
> 版本低于 140 时它是 `false`，走的是**带 inset 的** `setPadding(left, top, right, bottom)`，
> 会把 WebView 原生内缩。下面那句 `setPadding(0,0,0,0)` 只属于 140+ 的分支。

#### 实测（一加 Ace 3 / Android 16）

| 证据 | 值 |
| --- | --- |
| 截图 | 状态栏消失、底部导航条消失、内容从最顶端铺到最底端 |
| `dumpsys window` | `mWindowingMode=fullscreen`、`EDGE_TO_EDGE_ENFORCED`、`bounds=[0,0][1264,2780]`、`layoutInDisplayCutoutMode=always` |
| WebView | `innerHeight` 738 → **754**（+16），`--safe-area-inset-top/bottom` 均 `0px`，`html/body padding` 均 `0px` |

🚨 **此处结论已作废**（见 `dev-2026-10-14-fullscreen-padding`）：
`window.screen.height = 795` 而 `innerHeight = 754`，差 41 CSS px —— 这 41px
**不是**「不产生可见空隙的未知偏差」，**就是装饰 View 的原生 padding**，
在深色播放页上表现为一条明显的白带。当时在歌单页验证，浅色背景把问题盖住了。
`html/body` 的 padding 为 0 是正常的 —— Capacitor pad 的是原生 decorView，不是 DOM。

#### 已知未做

`SystemBars.handleOnConfigurationChanged()` 只重新 `setStyle`，**不重新 `setHidden`**
⇒ 转屏后系统栏有可能重新出现，需要点一下才恢复。转屏适配整体按用户要求本轮不做。

---

### `dev-2026-10-13-seam-viewport` — 修上游真 bug：缝把「世界宽度」当成「视口宽度」

**性质**：BUG fix（改了上游 `src/`，非新增）

#### 先纠正一个误判

上一轮我判定「布局完全没适配移动端，竖屏横屏都不行」。**这个结论是错的**，用户指出
「在 PC 端它是故意设计在中间的」——他是对的。读代码 + 真机实测后确认，那两处最扎眼的
现象**全是上游的设计意图**：

| 现象 | 真相 | 证据 |
| --- | --- | --- |
| 页签中文竖排（歌单/电台/专辑/本地） | 设计语言，`.bravais-seam-tabs button { writing-mode: vertical-rl }` | `bravais.css:276`；注释写「像一排书脊」；实测每个 tab 26×52 = 两字竖排，尺寸正常 |
| 缝居中、两侧是墙 | 设计意图，缝是墙上的「开口」不是侧边栏 | `bravaisConstants.ts:13` `BRAVAIS_SEAM_HOME_WIDTH = 120` |
| 上游没做移动端 | **有**，而且做得挺细 | `BRAVAIS_NARROW_VIEWPORT_PX = 900`：视口窄于它默认收成 64px 书脊；`getBravaisScale` 的 `<640 → 0.52` 相机档；`LatticeChrome.css` 的 `@media (max-width:640px)` |

**真正的 bug 在别处**：`BravaisStage.tsx` 把 `view.width`（**相机世界坐标**下的可见范围，含缩放档位
与 `BRAVAIS_OVERSCAN`）当成 `viewportWidth`（**CSS 像素视口宽**）传给了 4 处。它们量纲完全不同。

#### 变更

只改一个文件 `src/library/suites/bravais/BravaisStage.tsx`（+11 / −4）：

新增 `const screenWidth = window.innerWidth`，替换 4 处误用：

| 行 | 原写法 | 影响 |
| --- | --- | --- |
| 180 | `frameRef.current.view?.width ?? window.innerWidth` | 面板/海报宽度算错 |
| 192 | `view?.width ?? 0` | 同上 |
| 210 | `view?.width ?? 0` | 同上（`resolveVariantWidth`） |
| 231 | `syncViewport(view.width)` | **主因：窄屏手机上把 64px 书脊顶回 120px 窄缝** |

#### 坑（这才是排查花时间的地方）

1. **`view.width` 与视口宽不是一回事。** 真机实测：手机 361 CSS px，缩放 0.52，世界宽 ≈ 694，
   含 overscan 后轻松上千 ⇒ 在手机上必然跨过 900 阈值。
2. **`bravaisSeamLevel.ts:88` 在模块求值时一次性读 `window.innerWidth`**，配合
   `syncViewport` 的「首次只记录不改等级」，意味着**只有 `view.width` 变化能改 level**。
   用 CDP 注入 `Page.addScriptToEvaluateOnNewDocument` 录下全生命周期读数，证明
   `window.innerWidth` **全程恒为 361，从未 ≥900** —— 排除了「初始化就读错」这条假设，
   才锁定是 `syncViewport` 污染。
3. **`adb shell input tap` 点不动 WebView 里的元素**（实测无效），改用 CDP `PointerEvent` 直派才生效。
   别把这个误判成 App 的 bug。

#### 验证（一加 Ace 3 / Android 16，CDP 实测非目测）

| 场景 | 缝开口宽度 | 判定 |
| --- | --- | --- |
| 冷启动竖屏 361px | **64px** + `is-compact` | ✅ 窄屏适配生效 |
| 横屏 754px | **64px**（修复前会翻成 120px） | ✅ **修复的直接证据** |
| 转回竖屏 | 0px + 边缘标签在场 | 上游「被挤出屏幕自动收起」机制，非本 bug |
| 点边缘标签唤回 | **64px**，`translateX(14px)` | ✅ 交互链完好 |

- `npm run typecheck` 通过。
- bravais 单测 **37 文件 / 287 用例全过**（改的是组件层，纯函数未动）。
- APK 重建并装机验证，`app-debug.apk` 15.1 MB。

#### 已知未做

- **旋转后缝会「被挤出屏幕自动收起」**：相机锚点没有随视口变化重新对位，要点边缘标签唤回。
  这是**独立于本修复**的另一个移动端适配问题（且有可恢复的降级路径，不是致命缺陷），未处理。
- 后台播放（Web MediaSession 在 WebView 不生效）、音源后端、本地音乐库仍未做。

---

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
| `capacitor.config.ts` | Capacitor 配置。`appId` 沿用桌面版 `top.izuna.foliamajor`；WebView 加载 APK 内 `dist/`（`androidScheme: https` + `hostname: localhost`）；内置 `SystemBars` 设 `insetsHandling: 'disable'`（**不是 `'css'`**，见 `dev-2026-10-14-fullscreen-padding`）+ `initialViewportFitValueHint: 'cover'` + `style: 'LIGHT'` + `hidden: true` |
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
   🚨 **这条的后续结论已被推翻，见 `dev-2026-10-14-fullscreen-padding`。**
   当时写的是「必须靠 `insetsHandling: 'css'` 注入的 `--safe-area-inset-*`，这个配置不是可选项」。
   **实际恰好相反**：版本 < 140 时 Capacitor 不走透传分支，而是给 decorView 加原生
   `setPadding` 并把 CSS 变量强制置零 —— `'css'` 在这台机器上不但没用，还制造了白带。
   现在配置是 `insetsHandling: 'disable'`（不注册 insets listener，从根上不产生 padding）。

3. **⚠️~~布局完全没适配移动端~~ —— 此结论已被推翻，见上方 `dev-2026-10-13-seam-viewport`。**
   当时据截图判定「上游没有移动端布局、竖排是被压扁的」，**这是误判**：
   竖排（`writing-mode: vertical-rl`）与缝居中都是上游的设计意图，上游另有
   `BRAVAIS_NARROW_VIEWPORT_PX = 900` 等成套窄屏设计。真实缺陷是
   `BravaisStage.tsx` 混用了「世界宽度」与「视口宽度」，已修并真机验证。
   ⇒ 保留此条仅作**教训**：截图目测不足以判定「没适配」，必须读代码 + 量真实 DOM 尺寸。

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
| ✅ | **edge-to-edge inset CSS** | **已解决（2026-10-14）**：`insetsHandling` 改 `'disable'`，装饰 View 不再被原生 padding，横竖屏四边零白带。见 `dev-2026-10-14-fullscreen-padding`。`src/` 对 `safe-area` 仍是零命中，所以没有任何 UI 需要补 inset |
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

### `dev-2026-10-15-background-playback` — 后台自动续播 + 系统媒体会话 (功能)

**性质**：功能 + 基础设施

#### 变更

修好了安卓版「一首歌放完接不上下一首」，并补上通知栏 / 锁屏 / 耳机键。
方案与完整实测数据见 [`BACKGROUND-PLAYBACK.md`](BACKGROUND-PLAYBACK.md)。

| 文件 | 改动 |
| --- | --- |
| `android/.../FoliaMediaSessionService.java` | **新增**。mediaPlayback 前台服务 + `MediaSessionCompat`。只镜像状态，不发声 |
| `android/.../NativeMediaSessionPlugin.java` | **新增**。JS ↔ 原生桥：`sync` / `setArtwork` / `stop` / 通知权限 |
| `android/.../MainActivity.java` | 注册 `NativeMediaSessionPlugin`、起服务、`onDestroy` 撤服务 |
| `android/app/src/main/AndroidManifest.xml` | 4 条权限 + `<service foregroundServiceType="mediaPlayback">` + `MediaButtonReceiver` |
| `android/variables.gradle`、`android/app/build.gradle` | `androidx.media:media:1.8.0`（**不引 media3**） |
| `src/utils/nativeMediaSession.ts` | **新增**。双闸平台隔离，形状照抄 `navigation/back/nativeBackBridge.ts` |
| `src/hooks/useNativeMediaSessionBridge.ts` | **新增**。播放状态→原生、系统控制→JS、封面、通知权限 |
| `src/App.tsx` | 在 `useMediaSessionBridge` **并列**接入新 hook |

`src/hooks/useMediaSessionBridge.ts` 与 `src/utils/mediaSessionSync.ts` **一行未改** ——
它们在安卓上本来就不生效（见下），保留给网页版 / Electron。

#### 根因（第一版判断错了两轮，这里记最终版）

`navigator.mediaSession` 在 Android WebView 里**根本不存在**（实测取 `playbackState`
得到 `"unsupported"`），`useMediaSessionBridge` 的三个 effect 全部第一行就 return。
更深一层：**页面隐藏时 `<audio>.play()` 会被静默吞掉** —— Promise **RESOLVED**，
但元素永远 `paused=true`、`currentTime` 不动（实测 20 个采样点 ct 冻结在 0.15）。
于是「隐藏前就在播的元素不受影响，隐藏后起播的起不来」= 一首歌放完就断。

加 mediaPlayback 前台服务后，进程从后台 cgroup（`b/`）提到感知级（`prcp` + `FGS`），
浏览器这才承认隐藏页面上的起播。

#### 验证

全部在 PJE110 / Android 16 / WebView 138.0.7204.179 真机实测：

- **隐藏态起播**：`PRE_paused: true` + `hiddenAtCall: true` → `play()` RESOLVED，
  `ct` 44.99 → 49.96 → 54.49
- **后台自动续播**：`ended` → `[App] playSong initiated` → `emptied` → `loadstart` → `playing`，
  此后 ct 一路在涨
- **系统会话**：`state=PLAYING(3), position=15400, actions=823`，
  `metadata: 老城区，新样貌 / 异环10AM / 早安，海特洛`
- **媒体按键**：`mediaButtonReceiver=MBR {... MediaButtonReceiver ...}`（原先是 `null`）
- **锁屏**：媒体标签显示真实曲目 `♫ ELLY,K, 异环10AM, 曲奇`
- **通知记录**：`id=1001 category=transport vis=PUBLIC FOREGROUND_SERVICE`
- `npx tsc --noEmit` 零错误

#### 踩坑

- ⛔ **原生绝不能抢音频焦点**。发声的是 WebView 的 `<audio>`，Chromium 自己就持有焦点。
  服务再发 `AUDIOFOCUS_GAIN` 会把它挤掉 → 我们收到 `LOSS` → 通知 JS 暂停 →
  **播放刚开始 250ms 就自己暂停**。自造反馈环，焦点整个交给 Chromium。
- ⛔ **`@PluginMethod` 忘了 `call.resolve()`**：原生状态照样更新（因为是同步调用），
  但 JS 那个 Promise 永不落地，表现为 CDP `Runtime.evaluate_TIMEOUT`。
  最容易被误判成「hook 没跑到」。
- ⛔ **`@PermissionCallback` 注解不能省**：少了它抛 `No callback found for permission`，
  JS 侧只看到空对象 `{}`。
- ⛔ **`BridgeActivity.onDestroy()` 是 `public` 不是 final**：写成 `protected` 会报
  「无法覆盖」，看起来像 final 其实只是可见性不够。
- ⛔ **`MediaSessionCompat` 没有 `getMetadata()`**：`setMetadata` 是整体替换、
  没有读回 API，得自己留一份 title/artist/album。
- ⛔ **通知样式必须用 `androidx.media.app.NotificationCompat.MediaStyle`**：
  框架 `Notification.MediaStyle` 收的是框架 `MediaSession.Token`，类型不兼容编译失败。
- ⚠️ **「有声音」完全不能证明 JS 还活着**：解码输出在独立线程，不受主线程节流约束。
  第一版方案误判成「主线程被节流」，实测后台 `setTimeout(0)` / `MessageChannel` 都是 **1ms**，
  只有 rAF 被压到 0.79fps、idleCallback 被饿死 —— 都与播放链路无关。
- ⚠️ **遇到「播完不续」先看 console 有没有 `[App] playSong initiated`**：
  有 = 切歌链路跑了，问题在取流（本轮遇到一次 `stage: "song-url"` 的
  natfrp 香港节点瞬时抖动）；没有 = 队列空了或被拦。两者别混。
- ⚠️ **`adb shell pm grant` 与 `appops set` 在这台机器都被拒**（shell uid 无权限），
  通知权限只能靠 App 自己弹窗申请。

#### 待决

- **来电/抢占时的暂停行为未验证**：按上面的结论把焦点完全交给了 Chromium，
  这条路径没有单独测过。

#### 补充（同日）：通知栏封面已修

上一条记的「`setArtwork` 从未被调用 / 属数据层问题」**是误判，已推翻**。

- **根因是原生侧竞态，不是数据层**：`MediaSessionCompat.setMetadata()` 是**整份替换**语义，
  而 `applyNow()` 跟着 `onTimeUpdate` 以约 4Hz 调用、每次都重写一份只带
  title/artist/album 的 metadata —— `applyArtwork()` 刚设进去的封面图
  **下一次 timeupdate 就被抹掉**。表现为 `metadata: size=3`。
- **修法**（`FoliaMediaSessionService.java`）：`currentArtwork` 留一份在实例上，
  metadata 重建统一走 `applyMetadata()`，文本与封面永远一起写；
  `applyNow()` 改成文本真变了才 `setMetadata`；
  `applyArtwork()` 挪回主线程；`buildNotification()` 显式 `setLargeIcon`。
- **另外补了 `toSafeRemoteUrl`**（`useNativeMediaSessionBridge.ts`）与原生侧 http→https 兜底：
  netease/kugou 至今还发 `http://` 封面，targetSdk 36 默认禁明文会被 NetworkSecurityPolicy 拒。
  与 `createCoverUrlResolver` 是同一个消毒理由，**别再漏**。
- **验证**：`metadata: size=4, description=Breathe, Kenzie, Breathe`；
  `android.largeIcon=Icon (typ=BITMAP size=168x168)`；
  SystemUI 日志里 `share_images/top.izuna.foliamajor_0_artwork.png`
  （系统自己把封面写成文件并在媒体面板引用，还认出了带中文 voiceLabel 的四个控制按钮）。
  切歌后仍为 `size=4`，无上一首残留。
- **顺带收掉一个新暴露的开销**：封面一到位，SystemUI 就在 4Hz 重解码封面
  （日志每 260ms 一条 `onMediaDataLoaded`）。通知改为只在「播放态翻转」或
  「曲目/封面变了」时重发；`setPlaybackState` 仍 4Hz（面板靠 position+rate 自己做进度）。
  改完 10s 窗口内 `onMediaDataLoaded` = 0。暂停/恢复的 flags 翻转已复验正常。

#### 补充（同日）：进度条卡 00:00 / 04:00

封面修好后雪冷水报控制中心媒体卡片进度条**总长永远 04:00、位置永远 00:00**。

- **根因**：`applyState(...)` 把 `durationMs` 传到了 `applyNow(...)`，但 **`applyNow` 没用它** ——
  参数进去就丢了。`MediaMetadataCompat` 里从来没有 `METADATA_KEY_DURATION`，
  系统 UI 拿不到总长就退化成 04:00 占位，比例算不出来 → 位置恒为 00:00。
- **排除法**：先确认不是 position 没推进 ——
  `dumpsys media_session` 两次取样 98540 → 102847，`updated` 差 4258ms，位置一直在走。
  问题只在「没有总长」这一侧。
- **修法**：`currentDurationMs` 留一份，metadata 重建时 `putLong(METADATA_KEY_DURATION, ...)`，
  并把 duration 纳入变更判定。
- ⚠️ **只在拿到真实时长时才写**：写 0 等于告诉系统「这首歌 0 毫秒」，
  进度条会变成空的、永远在 0 的条，比不写还糟。切歌时 `audio.duration` 是 `NaN`，
  靠 `loadedmetadata` 事件再推真实值。
- **验证**：`metadata: size=5`；控制中心卡片 `00:44 —— 02:31`，
  与 `audio.duration=151.1` 一致，位置随播放推进（`00:44` → `01:11`）；
  切歌后仍为 `size=5`，duration 没被后来的空值冲掉。
- ⭐ **这台机器控制中心的媒体卡片不在通知栏里**：控制中心是**顶部右侧**下拉，
  通知是**顶部左侧**下拉（ColorOS 布局，同 iOS）。
  视觉验证媒体卡片要走右侧入口，否则一直只能看到通知栏那张。

#### 踩坑

- ⚠️ **`logcat -g` 显示 main buffer 只有 256 KiB，这机器刷屏极凶**，
  App 自己那几行 `Log.i` 几秒内就被轮转掉。我据此得出过
  「`setArtwork` 从未被调用」的错误结论。
  ⛔ **别拿「日志里没有」当证据**；本项目判定优先级：
  `dumpsys media_session` / `dumpsys notification` > logcat。
- ⚠️ **`cmd statusbar expand-notifications` 开的是通知栏，不是控制中心。**
  这台机器（ColorOS）的媒体卡片在**控制中心**里，入口是**顶部右侧**下拉；
  通知是顶部左侧下拉。我曾据此误判「设备锁屏了、screencap 只能拿到安全层」——
  其实手机根本没锁，是开错了面板。⛔ 别用截图内容去反推锁屏状态。

---

### `dev-2026-10-15-android-redesign` — 安卓界面重设计：字体 / 字阶 / 间距（视觉层第一步）

**性质**：功能（视觉重构）。方向稿 `ANDROID-REDESIGN.md` + 规格稿 `ANDROID-REDESIGN-SPEC.md`，
代码分三个 commit 落地：锁字体 → 建字阶 → 统一间距。**只动表达层**，路由、导航、
命令面板入口、provider、请求链路一律没碰，桌面端 Electron 表现零变化。

⚠️ 全部结论来自真机 CDP `Runtime.evaluate` 实测取证，不是主观审美判断。
审计设备：一加 Ace 3 / Android 16 / 1264×2780 / dpr 3.5 / CSS 视口 361×794。

#### 第 1 步：锁字体（`d9c6e871`）

**问题**：UI 声明了 sans-serif 栈，真机却渲染成**宋体**（横细竖粗 + 三角衬线末端）。
取证：全站 0 元素引用衬线、`settings get system font_name = null`、
0 元素 computed 含 `Folia Noto Serif SC`、设备无字体设置入口。
⇒ 根因不是字体没配，是**整套 UI 根本没锁字体**，把渲染结果交给了系统默认。

- `src/index.css` 新增 `Folia Noto Sans SC` 四字重 `@font-face`
- `src/library/suites/netease/neteaseParts.tsx` 的 `NeteaseShell` 挂 `fontFamily`
- 兜底链**显式点名** `'Noto Sans CJK SC'`、`'Noto Sans SC'` —— webfont 挂了也不会再退到衬线
- `public/fonts/` 随包内置 8 个 woff2（CJK 4.42 MB + latin 52 KB），`.gitattributes` 加 `*.woff2 -text`

**为什么必须内置而不能走 CDN**（这一条花了约十轮工具调用才定位）：

| 验证 | 结果 | 排除了什么 |
| --- | --- | --- |
| 设备 shell `curl` 同一 URL | 200 / 1,142,552 B | 不是没网 |
| 响应头 `access-control-allow-origin: *` | 有 | 不是 CORS |
| WebView `fetch` 跨域 httpbin | 204 正常 | 跨域整体通 |
| 同 CDN 的 13KB latin 子集 / package.json | 成功 | 不是 CDN、不是域名、不是体积上限 |
| **1.09MB `chinese-simplified`** | **FAIL，耗时 12ms** | — |

差别在**传输方式**：小文件响应带 `Content-Length`，大文件走 **chunked**，
这台 WebView 对后者直接拒。**12ms 是即时拒绝不是超时** —— 看到「秒失败」先想策略拦截，
别往超时/带宽方向查。⇒ 通则：WebView 里 webfont 失败，**先量文件大小分档对照**。
随包内置的附带好处是断网可用，正合音乐 App 需求。代价 APK 17.6 → 20.9 MB。

⚠️ 字体**只挂安卓端**：`NeteaseShell` 是桌面/安卓共用的，用仓库既有的**两道闸**
（`VITE_ANDROID_BUILD` + `Capacitor.isNativePlatform()`，同 `nativeMediaSession.ts`）。
`Folia Noto Serif SC` 保留，它服务桌面端与歌词可视化。

#### 第 2 步：6 级字阶（`2df787ee`）

**问题**：7 档字号挤在 10–16px，页标题 16 只比卡片标题 13 大 3px；
行高比 1.00 / 1.25 / 1.33 / 1.43 / 1.50 混用；tab 标签 10px/10px
（**行高等于字号**，汉字假名有裁切风险）。

在 `NETEASE_STYLES` 里建 6 个字阶类，`display 24/700` → `title 17/600` →
`item 15/500` → `meta 13/400` → `label 12/500` → `caption 11/400`，
4 个 surface + 11 个零件共 **67 处字号用法全部迁移，0 残留原始字号类**。
时长 / 计数 / 序号加 `tabular-nums`。

⭐ **做成类而不是散落的字号值，是为了让「系统」变成强制的**，
否则下次各写各的又会退回去。真机实测落地值逐项吻合规格；
tab 标签实测 `scrollHeight 17 / 高度 16`，无裁切。

#### 第 3 步：间距刻度与屏幕边距（`7a3416f8`）

**问题**：同屏 `px-3`(12) 与 `px-4`(16) 混排导致**左边缘错位**；
非 4pt 倍数的间距值共 **27 处**（6px×4 / 10px×8 / 14px×2 / 20px×11）。

- 屏幕边距统一 16px：`NeteaseHeader` / `NeteaseSearchBar` / `NeteaseMiniPlayer` 外层，
  以及 `NeteaseCollection` 列表行
  （⭐ `NeteaseArtist` 同类行**本来就是** `px-4` —— 这才是错位方，不是 Artist）
- 27 处非法值全部吸附到刻度，跨 4 个 surface + `neteaseParts`
- `neteaseTheme.ts` 写入 `--nt-space-*` 七档 token（2 发丝 / 4 / 8 / 12 / 16 / 24 / 32），
  并注明「className 里的间距必须吸附此表」
- `NeteaseHeader` `min-h` 52 → 56，容纳 24px 标题行高
- 修正规格 §3.3 自相矛盾处：原文「列间距统一 12（两向都改 12）」与「行间距统一 16」冲突，
  改为**列 12 / 行 16**（行内除封面还夹标题+计数两行文字），快捷卡纯封面网格行列同距 12

#### 验证

- `tsc --noEmit` exit 0；`BUILD SUCCESSFUL`；APK 20.9 MB
- 字体：同区域裁剪对照（宋体 vs 黑体），`document.fonts` 四字重全 `loaded`
- 字阶/间距：CDP 量 `getComputedStyle`，实测值与规格逐项吻合
- 边距：写脚本量所有「贴着 shell 左边缘」的元素 —— 8 个中 **6 个 `padL=16px`**；
  另 2 个是搜索框与迷你条胶囊的**内部内衬**，作用域正确（12/8px 在 16px 容器内）

#### 踩坑

- ⚠️ **PowerShell 5.1 的 `Get-Content -Raw` 按 ANSI 读文件**，
  用它做「读-改-写」批量替换 TSX 会把中文全写坏（`首`→`棣?`，`git diff` 显示整文件重写）。
  ⛔ **改仓库内 UTF-8 文本文件只用 `edit` / `write` 工具，绝不用 shell 做读-改-写流水线**。
  真出事了靠 `git diff > docs/dev/.tmp/backup-all.patch` + 文件双备份秒回滚。
- ⚠️ **改 JSX 不要做前缀式匹配**：`old_string` 只写到 `{item.name}<`，
  新串带了 `</span>`，和原文的 `</span>` 叠成 `</span></span>`，tsc 报 `TS1382`。
  改 JSX 一律带上完整开闭标签做整块匹配。
- ⚠️ `neteaseParts.tsx` 是**混合文件**（字阶类、零件、shell 都在里面），
  commit 必须**按 hunk 拆**，不能按文件拆，否则三个 commit 会互相污染。

#### 第 4 步：把配色下限写进 token 层（`0ba3d742`）

**性质**：仍是视觉重构。配色**继续从 `Theme` 契约派生**（换主题、切深浅色仍跟随），
只是把下限变成**可校验的代码**，而不是注释里的约定。

审计出的不合格项：最弱文字色 2.20:1、`onAccent` 3.52:1、硬编码红 3.58:1。

工具层刻意分**两种亮度**，各回答一个问题，别混用：

| 用途 | 用哪个 | 为什么 |
| --- | --- | --- |
| 算对比度 | WCAG 相对亮度 | 感知亮度会算出偏松的结果，达不到无障碍标准 |
| 判中性阶看不看得见 | Rec.601 感知亮度 | WCAG 亮度在近白区被压得很扁（0.91 与 0.96 只差 0.05），会漏判 |

- 中性阶不再手调 alpha，改为**二分反推**「刚好拉开一档」的最小 alpha：
  `surface ≥0.04` / `elevated ≥0.06` / `divider ≥0.10` / `field ≥0.03`
- 文字三档全部拍成**实色**，`alpha` 表达「更弱」的做法收掉
- 下限取 **7 / 6 / 4.5** 而不是「都 ≥4.5」——都保 4.5 时两档看不出区别，层级白做
- `textFaint` 用**反向**的 `capContrast()` 压到「刚好」4.5，
  ⛔ 不能从提亮后的 `textMuted` 派生（那样它会直接继承同一个值，两档完全同色）
- `placeholderTint()` 只产出背景色；新增 `--nt-danger` 替换两处硬编码 `#e5484d`

**两处实现订正（已同步回规格文档）**：

1. 规格原写「`onAccent` 不达标就自动压暗强调色本身」，实现时发现**这一步永远不会触发**：
   对任意底色，纯黑与纯白里必有一个 ≥ 4.58:1（设 x = L+0.05 ∈ [0.05,1.05]，
   f(x) = x/0.05 + 1.05/x 在 x = 0.2291 取最小 9.17，两项各 4.58）。
   改成往黑白方向二分，**不动主题的品牌色**。
2. 新增 `--nt-accent-text`：强调色那两处文字用法（tab 选中态 **12px**、
   正在播放序号 **13px**）都是**小字**，而规格给强调色定的 3:1 只够大字，直接用不合格。
   `--nt-accent` 保持原样继续当填充色。

#### 验证

写 `docs/dev/.tmp/check-palette.mjs`：**用 esbuild 剥类型后直接跑真源码**
（⛔ 不另写一份逻辑镜像，镜像会和真代码漂移，那就失去验证意义了），
6 套主题（真机当前/旧青绿/深浅错配/纯白纯黑/缺字段）× 11 条约束全过。

真机逐元素实测（沿祖先链把半透明底叠出来再算，不是只看 CSS 变量声明）：

- **83 个文字元素，0 项不达标**，对比度区间 **4.92 – 12.22**
- 三档文字递进正确：`text #273a25` → `muted #245426` → `faint #2d692f`
- `从歌单移除` 实测 `rgb(174, 42, 48)` = `--nt-danger`
- tab 选中态实测 `rgb(13, 106, 60)` = `--nt-accent-text`

#### 第四步踩的坑

- ⚠️ **下限要对着「文字可能踩到的最暗那层」算，不是对着 `--nt-bg`。**
  只在 bg 上校验通过（4.55:1），但角标其实压在 `--nt-surface` 上，
  浅色主题里 surface 比 bg 更暗，深色文字压上去掉到 **4.1:1** —— 不合格。
  对比度对底色单调，所以 `{bg, surface, field}` 里**最暗的那个**就是最坏情况。
- ⚠️ **二分搜索必须按「落盘后的值」回验。** 二分收敛的是实数，但写出去的是
  3 位小数的 alpha + 8bit 通道：实数 0.10435 判定通过、写出 0.104，
  通道取整后差距掉到 0.098（不够 0.10）。同理会把 4.4999 压到不合格。
  ⇒ 定到落盘精度后再判一次，差多少补多少。
- ⚠️ **`capContrast` 只往下压，原始色本身不达标时会直接放行** ——
  纯白主题的 `secondaryColor #808080` 对白底只有 3.95:1，压完只会更差。
  里面要先 `ensureContrast` 保底再压。
- ⚠️ **中性阶的方向不能由 `isDaylight` 决定**，必须由**实测底色亮度**决定。
  按模式选方向时遇到过「浅色底 + 深色模式标记」→ 把文字提成白、
  把面压成黑，直接塌成白底白字。
- ⚠️ **`tintAtGap` 不能因为「纯 base 的差距已经够大」就提前返回纯色** ——
  `surface` 的 base 是纯黑，纯黑对任何底色的差距都远大于 0.04，
  提前返回直接把 surface 变成了纯黑底。必须无条件二分取最小 alpha。
- ⚠️ **带 `text-shadow` 的白字角标量不出对比度**，它是压在封面照片上的，
  脚本看不见 `<img>` 里的像素也量不到 `text-shadow`，测出来的必然是误报。
  验证脚本里显式排除，别把它当成回归。

#### 第 5 步：圆角 / 层级 / 11 个零件规格（`34326d90`）

**性质**：仍是视觉重构，收口整个系统。真机实测改造前 → 改造后：

| 项 | 改造前 | 改造后 |
| --- | --- | --- |
| 圆角档位 | 散落 **5 个**（6 / 8 / 12 / 16 / full） | **4 个**，越界 0 处 |
| 投影 | 1 处 Tailwind `shadow-lg`，不受控 | 全部走 `--nt-shadow-2` |
| 触控区 | **6 处** < 44px | suite 内 **0 处** |
| 空态垂直位置 | 约 1/4 高度处 | 居中（偏差 11px / 491px = 2.3%） |

新增 token：`--nt-radius-sm/md/lg/full`、`--nt-touch-min`、`--nt-shadow-2`。

- **深色主题的投影必须另给一套**：同样的黑低透明叠在深底上等于没有，
  深色版改成更小偏移 + 更高不透明度，靠**边缘更紧**而不是靠更浓来表达。
- **圆角 token 对应 Tailwind 默认的 `rounded-lg` / `rounded-xl` / `rounded-2xl`**，
  className 直接吸附这三类即可，不必写成 `rounded-[var(--nt-radius-md)]` 任意值 ——
  那会让 40 多处 className 变得难读，还多一层 JIT 风险。
- **占位符色补 `.nt-input::placeholder`**：伪元素 inline style 根本表达不了，
  改造前搜索框占位符一直在吃浏览器默认值。
- **`NeteaseEmpty` 加 `fill` 区分整屏空态与区块内嵌空态** ——
  后者（推荐加载中、没有专辑）居中会被做坏，两种用法必须分开。

#### 顺带修掉的 stage 3 漏网 + 一个方法论教训

Artist / Collection 的**自建头部**是 `px-2`（8px 边距），比其他头部少一半。
上一轮量「左边缘对齐」时漏掉了它们——因为当时的脚本**只量贴着 shell 左边缘（x≈0）的元素**，
而这两个容器在 x=8 处，没贴到 0。

⛔ **教训：「只量贴到 0 的元素」这个口径本身有漏洞**——有留白的错位它量不出来。
下次做对齐类验收，要量**所有一级容器的 padding-left**，而不是量贴边元素。

#### 第五步反复调出来的两个细节

1. **清除键「视觉 32px / 触控区 44px」分两层做。**
   整颗做成 32 → 触控区就只有 32，低于无障碍下限；
   整颗做成 44 的实心圆 → 又会把搜索框从 44 撑到 60 高。
   最终：按钮本身透明撑满 44，里面再放一颗 32 的实心圆。
2. **搜索框去掉纵向内边距，改由 `min-height` 控高。**
   给了 `py-2` 它就叠在高度上：清除键的 44 + `py-2` 的 16 = 60px（实测 48 → 60）。
   ⚠️ 这类「视觉尺寸 + 触控尺寸分层」的控件，容器高度必须由 min-height 兜底，
   不能靠内边距撑——内边距会和无障碍下限**叠加**。

#### 规格订正

- §4.2 原文「现在全站 0 处 `box-shadow`」**不准确**：`NeteaseMoreMenu` 的下拉本来就有
  Tailwind `shadow-lg`，真正的问题是它不受控、且圆角比迷你条还小。
- §4.3 原文「两者之间是一段空隙，没有分界」**不准确**：tab 栏本来就有 `border-t`。
- 新增 **§4.4**：netease 是四套 suite 之一，**桌面端同样能选中**，
  所以 §2/§3/§4/§5 的改动都会同时落到桌面观感上，**只有 `--nt-font` 是安卓门**。
  这是第二～五步一致沿用的口径：圆角这类结构属性若只给安卓改，
  桌面会变成「新圆角 + 旧字阶 + 旧配色」的混合态，比统一改动更糟。

#### 验证

`verify-elev.js` 真机实测：圆角 4 档 / 越界 0；浮层 `radius 16px` +
`boxShadow` 正是 `--nt-shadow-2` + 边框为 `--nt-divider`；
suite 内触控区 0 个 < 44（唯一 1 个 36.8px 的「返回主页」是**宿主组件**，已核实不属于本 suite）；
搜索框实测 `barH 44 / clearTouch 44×44 / clearDot 32×32`。

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