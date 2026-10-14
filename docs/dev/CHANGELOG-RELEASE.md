# Folia 二开 — 变更流水

> 记录**我们这个 fork** 的里程碑。上游 Folia 自己的版本发布看 GitHub Releases，
> 本文件只记我们的二开状态。
> 格式参照 yunyun-ecosystem 的 `CHANGELOG-RELEASE.md`。

---

## ⚡进行中（next release）

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