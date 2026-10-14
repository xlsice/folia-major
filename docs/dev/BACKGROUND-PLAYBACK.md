# Folia 安卓版 — 后台播放与系统媒体集成方案

> **状态：路线 A 已验证成立**（2026-10-15 真机实测，PJE110 / Android 16 / WebView 138.0.7204.179）。
> 仓库里已落一个**实验版最小实现**，验证了「mediaPlayback 前台服务 + 活跃 MediaSession」
> 能治好后台自动续播，并让系统播放器认得本应用。
>
> ⚠️ **但当前实现是探针级 stub，不是可用实现** —— 状态写死 PLAYING、不接真实播放链路、
> 没有 JS 桥、没有通知权限申请。日常使用前必须做完 §五 的收尾工作。

---

## 一、实测结论（先看这个）

### 1.1 现象复述

| # | 现象 | 实测判定 |
| --- | --- | --- |
| 1 | 后台/锁屏**音频能继续播** | ✅ 真实现象 |
| 2 | 一首播完**不自动接下一首** | ❌ 根因在下 |
| 3 | 通知栏/系统播放器**看不到本应用** | ❌ API 根本不存在 |

### 1.2 ⛔ 被推翻的假设：不是「主线程被节流」

第一版方案断言「进程被降级 → Chromium 节流渲染进程主线程 → 切歌的 `setState` 提交不出来」。
**实测证明这个假设是错的。** 后台 30 秒内的对照数据：

| 指标 | 前台 | 后台 30s | 判读 |
| --- | --- | --- | --- |
| `timeupdate` 频率 | 3.83 Hz | **3.74 Hz** | ✅ 媒体事件照常派发 |
| `setTimeout(0)` 实际延迟 | 21 ms | **1 ms** | ✅ **完全没被节流** |
| `MessageChannel` 往返 | 21 ms | **1 ms** | ✅ React 调度器通道畅通 |
| `requestAnimationFrame` | 60.57 fps | **0.79 fps** | ⚠️ 被压制（正常，不可见页面不渲染） |
| `requestIdleCallback` | 450 ms | **2001 ms**（撞 timeout） | ⚠️ 被饿死 |
| CDP 连接 | 通 | **通** | ✅ 渲染进程没被冻结 |

> 结论：**主线程完全健康**。被压制的只有 rAF（不可见页面不渲染）和 idle callback（没有空闲时间），
> 这两条都不影响播放链路。第一版方案据此推出的「加前台服务把 WebView 从节流里捞出来」是**错的**。

### 1.3 ✅ 真正的机制：页面隐藏时 `play()` 是空操作

打桩 `HTMLMediaElement.prototype.play` / `pause` 抓到的完整时间线（单位 ms，相对装桩时刻）：

**后台跑（问题复现）**
```
8744  play()          → Promise RESOLVED
...    元素却停在 ct=0.09, paused=true, readyState=4
```
- `pause()` **一次都没被调用** —— 不是应用代码停的
- `play()` 的 Promise **RESOLVED** —— 不是被拒绝/被 autoplay 策略拦
- 连续观察 10 秒：`ct` 冻结在 0.09、`paused: true`、`readyState: 4`，**一动不动**

**后台直接对元素调 `play()`（排除「只有新元素会死」）**
```
result: RESOLVED
20 个采样点（10 秒）：ct=0.15 恒定，paused 恒为 true
```
→ **不是「新建元素」的问题，是页面隐藏时任何 `play()` 都不生效。**

**前台跑（对照组，完全正常）**
```
8190  pause → 8199  ended → 8316  emptied → 8337  loadstart → 8365  playing
之后 ct 9.1 → 11.6 一路正常，paused=false
```
→ **应用代码没有 bug。**

**后台时切歌链路其实完整跑完了**（console 日志证实）：
```
[App] playSong initiated: 漸近線上の恋 ...
[Cache] ReplayGain recovered ...
[Lyrics] read-head reset ...
[autoMatchBestLyric] Initiating best lyric auto-match ...
[Prefetch] Starting prefetch for: Deja Vu
```
取流、ReplayGain、歌词、预取**全都正常完成**。唯独最后一步让声音出来的 `play()` 被系统吞掉。

### 1.4 ✅ `navigator.mediaSession` 在本 WebView 里根本不存在

```
navigator.mediaSession === "unsupported"
```

所以 `src/utils/mediaSessionSync.ts` 在安卓上是一段**彻底的空操作**——它写的
`navigator.mediaSession.*` 全部写到 undefined 上。这不是「不生效」，是「API 都没有」。

`dumpsys media_session` 佐证：只有一条 package 条目（因为 manifest 里链了媒体库），
**没有任何带 playbackState 的会话**。音频焦点栈也是空的。

### 1.5 提权实验：不是普通进程优先级问题

```
adb shell dumpsys deviceidle whitelist +top.izuna.foliamajor
adb shell am set-inactive top.izuna.foliamajor false
→ 隐藏态 play() 依然被拒（ct=0.15 恒定，paused=true）
→ 进程仍在 Proc # 4: cch  b/ /LAST
```

> ⚠️ 这条**不能**推论成「前台服务也没用」——加白名单并没有真的把进程挪出 `b/` cgroup，
> 而真正的 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 会改变 oom adj。
> **「原生前台服务能否让 WebView 的 `<audio>` 在隐藏态起播」这一点仍未验证**，是方案里的头号未知项。

---

## 二、由此得出的硬约束

1. **JS 侧无解。** 不是写法问题，是平台行为：`play()` 在隐藏页被静默吞掉，且
   `navigator.mediaSession` 不存在，没有任何 JS 能声明「这是有意的媒体播放」。
2. **必须原生。** 通知栏/锁屏/耳机键需要一个真实的 `MediaSessionService`，没有替代品。
3. **不要改 `App.tsx` 的切歌逻辑。** 它是对的（前台实测完全正常），改它只会引入新 bug。
4. **不要试图「绕过」**（后台偷偷起可见 Activity、切回来再续播等）。那是 hack，且治不了通知栏。

---

## 三、方案

### ✅ 路线 A：原生 `MediaSessionService` —— 已验证成立

**验证实验（2026-10-15 已完成）**

实现是最小 stub：`FoliaMediaSessionService`（`androidx.media` 的 `MediaSessionCompat`，
状态写死 PLAYING，无 JS 桥）+ Manifest 4 权限 + service 声明 + `MainActivity` 里
`startForegroundService`。APK 17.6 MB。

装到真机后，系统侧实测：

| 项 | 实验前 | 实验后 |
| --- | --- | --- |
| 进程 oom 分组 | `cch  b/ /LAST`（后台） | **`prcp  F/S/FGS`（前台服务）** |
| `dumpsys media_session` | 只有 package 条目 | **`Media button session is top` + `state=PLAYING`** |
| 通知 | 无 | **已发布**（`id=1001 category=transport FOREGROUND_SERVICE`） |
| `media_session_calback_fgs_allowlist` | — | `[cur: 10000]` |

**行为验证 A —— 隐藏态能否起播**（严格版：元素**预先暂停**、页面**已隐藏**）

```
PRE_paused: true,  hiddenAtCall: true,  play() → RESOLVED
ctProgression: [44.99, 49.96, 54.49]   pausedEverFalse: true
VERDICT: ✅ 隐藏态起播成功
```
对照实验前：20 个采样点 `paused` 恒为 `true`，`ct` 冻结在 0.15。

**行为验证 B —— 后台能不能自动续播**（端到端）

```
8444 pause → 8455 ended
8450 [App] playSong initiated: numb numb (feat. Hatsune Miku, Kasane Teto)
8585 emptied → 8617 loadstart → 8660 playing
此后 ct 17.37 → 18.84 一路在涨，paused=false，dur=167.3
```
**后台自动续播恢复正常。**

> 💡 机制：前台服务把进程从后台 cgroup（`b/`）提到感知级（`prcp` + `FGS`），
> 浏览器这才承认「隐藏页面上起播媒体」这个动作 —— 加上真实 MediaSession，
> 系统媒体界面（通知栏/锁屏/耳机键）也同时认得本应用。

**路线 B（预起播下一首）不需要做了。** 路线 A 成立且更彻底，B 的架构侵入不值得付。

### 完整实现状态

**已落地并实测通过（2026-10-15）**

| 文件 | 作用 |
| --- | --- |
| `android/.../FoliaMediaSessionService.java` | mediaPlayback 前台服务 + `MediaSessionCompat`（不发声，只镜像状态） |
| `android/.../NativeMediaSessionPlugin.java` | JS ↔ 原生桥：`sync` / `setArtwork` / `stop` / 通知权限 |
| `android/.../MainActivity.java` | 注册插件、起服务、`onDestroy` 撤服务 |
| `AndroidManifest.xml` | 4 权限 + service + **MediaButtonReceiver** |
| `src/utils/nativeMediaSession.ts` | 双闸平台隔离 + 插件访问 + 封面转换 |
| `src/hooks/useNativeMediaSessionBridge.ts` | 播放状态→原生、系统控制→JS、封面、通知权限 |
| `App.tsx` | 与 `useMediaSessionBridge` **并列**接入 |

实测结果：

```
state=PlaybackState {state=PLAYING(3), position=15400, speed=1.0, actions=823}
metadata: size=3, description=老城区，新样貌, 异环10AM, 早安，海特洛
mediaButtonReceiver=MBR {... androidx.media.session.MediaButtonReceiver ...}
```
锁屏媒体标签：`♫ ELLY,K, 异环10AM, 曲奇`
通知记录：`id=1001 category=transport vis=PUBLIC FOREGROUND_SERVICE`
后台自动续播：`ended → playSong initiated → loadstart → playing` ✅

### 通知栏封面：已修（2026-10-15）

早先记的「`setArtwork` 从未被调用过 / 数据层拿不到 URL」**是误判，推翻**。
真正的根因是原生侧的**竞态**，和数据层无关：

> `MediaSessionCompat.setMetadata()` 是**整份替换**语义。
> `applyNow()` 跟着 `onTimeUpdate` 以约 4Hz 被调用，而它每次都重新组一份
> **只带 title/artist/album** 的 metadata 写回去 ——
> 于是 `applyArtwork()` 刚设进去的封面图，**下一次 timeupdate 就被抹掉**。
> 现象就是 `metadata: size=3`，以及「怎么查都看不到封面」。

修法（`FoliaMediaSessionService.java`）：

1. `currentArtwork` 像 title/artist/album 一样留在实例上，
   metadata 重建统一走 `applyMetadata()`，**文本与封面永远一起写**。
2. `applyNow()` 改成**文本真变了才** `setMetadata`（顺带掐掉 4Hz 无意义重设）。
3. `applyArtwork()` 挪回主线程落地（封面是从下载线程送进来的）。
4. `buildNotification()` 显式 `setLargeIcon(currentArtwork)` ——
   锁屏/系统媒体面板会自己从 session metadata 取图，但**通知栏下拉卡片这张得显式给**。

另外补了 `toSafeRemoteUrl`（`useNativeMediaSessionBridge.ts`）与原生侧的 http→https 兜底：
netease / kugou 至今还发 `http://` 封面，而 targetSdk 36 默认禁明文，
`HttpURLConnection` 会被 NetworkSecurityPolicy 直接拒掉。这条和 App 里
`createCoverUrlResolver` 的消毒是同一个理由，**别再漏**。

实测（真机 PJE110 / Android 16）：

```
dumpsys media_session | grep metadata:
  metadata: size=4, description=Breathe, Kenzie, Breathe     ← 第 4 个字段就是封面

dumpsys notification --noredact | grep largeIcon
  android.largeIcon=Icon (Icon(typ=BITMAP size=168x168))       ← 通知栏大图

logcat | grep onMediaDataLoaded
  SystemUi--Notification: ... share_images/top.izuna.foliamajor_0_artwork.png
```

最后一条最硬：SystemUI 自己把封面写成了文件并在媒体面板里引用它，
并识别出了 `上一首/下一首/播放暂停/扬声器` 四个带中文 voiceLabel 的控制按钮。
切歌后 metadata 仍是 `size=4`，大图仍在 —— 跟着曲目走，没有残留上一首。

**顺带收掉一个新暴露的开销**：封面一到位，SystemUI 就在 **4Hz 重新解码封面**
（日志里每 260ms 一条 `onMediaDataLoaded`）。通知因此改成只在
「播放态翻转」或「曲目/封面变了」时重发；`setPlaybackState` 仍保持 4Hz
（系统媒体面板靠 position+rate 自己做进度）。改完 10s 窗口内 `onMediaDataLoaded` **= 0**。

### 进度条卡在 `00:00 / 04:00`：metadata 少了 duration（2026-10-15）

封面修好后用户报：控制中心的媒体卡片进度条**总长永远 04:00、位置永远 00:00**。

根因：`applyState(...)` 一路把 `durationMs` 传到了 `applyNow(...)`，但 **`applyNow` 压根没用它**，
参数进去就丢了。`MediaMetadataCompat` 里从来没有 `METADATA_KEY_DURATION`，
系统 UI 拿不到总长就退化成 04:00 占位，比例算不出来 → 位置恒为 00:00。

判定时先排除过一个可能：**不是 position 没推进**。
`dumpsys media_session` 两次取样 98540 → 102847，`updated` 差 4258ms，位置一直在走，
所以问题只在「没有总长」这一侧。

修法：`currentDurationMs` 留一份，metadata 重建时
`putLong(METADATA_KEY_DURATION, currentDurationMs)`，并把 duration 纳入变更判定。

⚠️ **只在拿到真实时长时才写**。写 0 等于告诉系统「这首歌 0 毫秒」，
进度条会变成一个空的、永远在 0 的条 —— 比不写还糟。
切歌时 `audio.duration` 是 `NaN`，靠 `loadedmetadata` 事件再推一次真实值（hook 已监听）。

实测：`metadata: size=5`（第 5 个字段就是 duration），
控制中心卡片 `00:44 —— 02:31`，与 `audio.duration=151.1` 完全一致，位置随播放推进；
切歌后仍为 `size=5`，duration 没被后来的空值冲掉。

### 排查陷阱：logcat 会骗人

`logcat -g` 显示这台机器 main buffer 只有 **256 KiB**，而它刷屏极凶
（SystemUI / OplusNotificationFixHelper / VRI 每秒好几条）。
App 自己那几行 `Log.i` **几秒内就被轮转掉了** —— 我因此一度得出
「`setArtwork` 从未被调用」的错误结论。

⛔ **别拿「日志里没有」当证据**，先 `logcat -g` 看 buffer 大小。
本项目的判定优先级：`dumpsys media_session` / `dumpsys notification` > logcat。

### 排查陷阱：媒体卡片不在通知栏里

`cmd statusbar expand-notifications` 开的是**通知栏**，而这台机器（ColorOS）的
媒体卡片在**控制中心**里 —— **顶部右侧**下拉进控制中心，**顶部左侧**下拉进通知（同 iOS）。

我在这里绕了一圈：截图里没有媒体卡片，就推断「设备锁屏了、`screencap` 只能拿到安全层」，
还写进了文档。**手机根本没锁**，只是开错了面板。
⛔ 别用截图内容去反推锁屏状态，先确认自己开的是哪个面板。

展开卡片才能看到进度条（默认是折叠态，只有封面和三个按键）。

### ⛔ 不要做的事

- ⛔ 不要用 ExoPlayer 接管播放（与 automix crossfade / 183 个 WebGL 可视化 / 歌词逐帧对齐冲突）。
  实测证明影子会话就够了，**根本不需要 ExoPlayer**。
- ⛔ 不要在 WebView 里 polyfill `navigator.mediaSession`（实测该 API 根本不存在，polyfill 无用）。
- ⛔ 不要改 `App.tsx` 的切歌逻辑来「规避」后台问题（前台实测它是对的）。
- ⛔ 不要把 `androidx.media` 换成 media3 除非确有需要 —— `MediaSessionCompat`
  已经验证够用，少一个依赖少一份 API 面。
- ⛔ 不要在 `applyNow()` 里「顺手」重建 metadata 而不带上 `currentArtwork` ——
  这正是本节开头那个 bug，写 metadata 的唯一入口是 `applyMetadata()`。

---

## 四、已完成的验证实验（存档）

<details>
<summary>最小实现清单（已被验证，可直接抄）</summary>

- `android/variables.gradle`：`androidxMediaVersion = '1.8.0'`、`media3Version = '1.11.1'`
- `android/app/build.gradle`：`implementation "androidx.media:media:$androidxMediaVersion"`
- `android/app/src/main/AndroidManifest.xml`：4 条权限 + `<service android:foregroundServiceType="mediaPlayback">`
- `FoliaMediaSessionService.java`：`MediaSessionCompat` + `startForeground(id, n, FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)`
- `MainActivity.java`：`startForegroundService(...)`

**两个踩坑**：

1. `Notification.MediaStyle.setMediaSession()` 收的是框架 `MediaSession.Token`，
   `MediaSessionCompat.getSessionToken()` 给的是 compat Token → 编译不过。
   要用 `androidx.media.app.NotificationCompat.MediaStyle`（**不是** `androidx.core.app` 那个）。
2. `startForegroundService` 之后必须在 5 秒内 `startForeground`，否则系统抛
   `Context.startForegroundService did not then call Service.startForeground()`。
   `onStartCommand` 里立刻调。

</details>

---

## 五、实测用到的探针（可复用）

全部在 `docs/dev/.tmp/`（gitignored），harness 是 `cdp.mjs`：

```powershell
node cdp.mjs <expr.js>                              # 求值
node cdp.mjs --method <CDP方法> --params-file x.json  # 发任意 CDP 命令（真实输入事件用这个）
```

| 文件 | 用途 |
| --- | --- |
| `cdp.mjs` | 通用 harness。`node cdp.mjs <expr.js>` 求值；`node cdp.mjs --method <Name> --params-file x.json` 发任意 CDP 命令（真实输入事件用这个） |
| `probe-state.js` | 最小状态读取（不依赖其它探针的全局变量） |
| `probe-resume.js` | 确保在播：暂停时才 play()，3 秒后回报是否真的动起来 |
| `probe-seek.js` | 拖到歌尾前 N 秒（`window.SETBACK` 可调，默认 8） |
| `probe-timer.js` | setTimeout / MessageChannel / idleCallback 实测延迟 |
| `probe-watch2.js` / `probe-watch2read.js` | **主力**：事件计数 + 500ms 轮询 + src 变更追踪 + console 捕获 |
| `probe-hiddenplay.js` / `probe-hiddenplayread.js` | **隐藏态起播实验**（含实验有效性自检） |
| `probe-diag.js` / `probe-diag2.js` | pause/play 打桩抓调用栈 + `play()` 的 Promise 结果 |

> 💡 排查顺序：先 `probe-timer.js` 确认节流状态 → `probe-diag2` 看 Promise 结果 → 再猜平台行为。
> **先证伪自己的假设再下结论**——本轮第一版方案就是没做这一步才错的。
>
> ⚠️ 三个反复踩到的坑：
> ① 探针之间会互相覆盖 `window.__bgw` 的形状，字段对不上就 `.slice` 报错；
> ② 对照实验必须验证「元素当时是暂停还是暂停中」——已播放的元素上调 `play()` 什么也证明不了；
> ③ PowerShell 把 JSON 的引号吃掉，JS 表达式和 CDP 参数都走文件。

---

## 六、验收标准

- [x] **后台播完一整首会自动接下一首** ← 2026-10-15 实测通过
- [x] 隐藏态 `play()` 生效 ← 2026-10-15 实测通过
- [x] 进程被提升到前台服务分组（`prcp F/S/FGS`）← 实测
- [x] 系统认得本应用的媒体会话（`Media button session is top`）← 实测
- [ ] 通知栏卡片可见（**卡在 POST_NOTIFICATIONS 运行时权限**）
- [ ] 锁屏大图 + 进度条可拖动
- [ ] 耳机按键 / 蓝牙设备能控制
- [ ] 锁屏 10 分钟不断播
- [ ] 来电时正确让出音频焦点
- [ ] 网页版构建完全不受影响（双闸验证）

---

## 七、已知风险与踩坑

> 这三条本轮都真踩过，改代码前先看一眼。

### ⛔ 1. 原生**绝不能**去抢音频焦点

发声的是 WebView 的 `<audio>`，**Chromium 自己就通过 AudioManager 持有焦点**。
服务这边再发一次 `AUDIOFOCUS_GAIN` 会把它挤掉，于是形成自造反馈环：

```
播放 → playing 事件 → applyState(playing=true) → requestAudioFocus
     → Chromium 的元素被夺焦 → 我们收到 AUDIOFOCUS_LOSS
     → notifyListeners("mediaAction","pause") → JS 暂停
```

实测表现：**播放刚开始约 250ms 就自己暂停**（`playing` t=213，`pause` t=461）。
焦点这件事整个交给 Chromium，别插手。

### ⛔ 2. `@PluginMethod` 忘了 `call.resolve()` = JS 侧永久挂起

`applyState` 是同步调用的，原生状态照样更新，但 **Promise 永不落地**：
表现是 CDP `Runtime.evaluate_TIMEOUT`，页面里 sync 一个接一个堆着。
实测时最容易被误判成「hook 没跑到」。

### ⛔ 3. `@PermissionCallback` 注解不能省

`requestPermissionForAlias` 靠这个注解读回调方法，少了它抛
`No callback found for permission`，JS 侧只看到一个空对象 `{}` ——
日志里表现为 `[nativeMediaSession] notification permission request failed {}`。

### 其他

- **取流失败 ≠ 播放问题**：出现过
  `[OnlinePlayback] Provider audio source is temporarily unavailable {"stage":"song-url"}`，
  那是 natfrp 香港节点瞬时抖动（`NETWORK.md` 有记）。
  **遇到「播完不续」先看 console 有没有 `[App] playSong initiated`** ——
  有 = 链路跑了，问题在取流；没有 = 队列空了或被拦。
- **`BridgeActivity.onDestroy()` 是 `public`**：写成 `protected` 会报
  「无法覆盖」，看起来像 final 其实只是可见性不够。
- **`MediaSessionCompat` 没有 `getMetadata()`**：`setMetadata` 是整体替换、没有读回 API，
  要自己留一份 title/artist/album 字段。
- **通知样式要用 `androidx.media.app.NotificationCompat.MediaStyle`**：
  框架 `Notification.MediaStyle.setMediaSession()` 收的是框架 `MediaSession.Token`，
  与 `MediaSessionCompat.getSessionToken()` 类型不兼容，编译直接失败。
- **别用 `pm clear`** —— 会连音源登录态一起清掉。只清 SW / Cache Storage。
- **这台机器 `adb shell pm grant` 与 `appops set` 都被拒**（shell uid 无权限），
  通知权限只能靠 App 自己弹窗申请。
