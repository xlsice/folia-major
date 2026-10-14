# Folia 安卓版 — 网络架构（音源链路）

> **一句话结论：手机上的 Folia 不连这台开发 PC。**
> 它把音源请求发到公网 `https://api.u2020682.nyat.app:18329`，
> 由**笔记本 `192.168.0.109`** 上的 ncm 服务应答。
> 开发 PC（`192.168.0.104`）只负责写代码和编译 APK，**不在运行时链路上**。
> 关掉开发 PC，手机照样能播。

---

## 0. 30 秒自证

怀疑「App 是不是在拉我这台 PC 的音源」时，先跑这三条，不要靠印象判断。

```powershell
# ① APK 里真正打进去的地址是什么？（这是唯一的真相来源）
Select-String -Path dist\index.html, dist\assets\*.js `
  -Pattern 'u2020682\.nyat\.app|192\.168\.0\.' -AllMatches |
  ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
#   期望输出：u2020682.nyat.app
#   如果出现 192.168.0.x ⇒ App 指向的是内网地址，开发 PC 一关就断

# ② 公网入口是否通、证书是否可信（本机有代理，必须 --noproxy '*'，且不要加 -k）
curl.exe --noproxy '*' -s -o NUL `
  -w "http=%{http_code} tls=%{ssl_verify_result} time=%{time_total}s`n" `
  "https://api.u2020682.nyat.app:18329/login/status"
#   期望输出：http=200 tls=0
#   tls≠0 说明证书不可信，WebView 会直接拒连（curl 加了 -k 就看不出来）

# ③ App 内的登录诊断报告
#   打开网易云登录窗口的「诊断报告」，应显示 backend: remote 与上面这个 https 地址。
#   若显示 localhost / 127.0.0.1，自检会报 ELOOPBACK。
#   ⚠️ 此条依据上游 .github/triage/login-playbook.json 里对登录诊断报告的描述，
#      **未在本机实测过该报告的具体文案**。前两条是实测过的，优先用前两条。
```

> ⚠️ **①必须是重新构建过的 `dist/`。** 装到手机上的旧 APK 里可能是别的地址，
> 判断前先确认 `dist/assets/` 的时间和本次构建一致。

---

## 1. 拓扑图

```text
   ┌───────────────────────────── 公网 ─────────────────────────────┐
   │                                                                 │
   │  手机 Folia (WebView)                                          │
   │    origin = https://localhost   ← App 自带的前端资源，不是音源！   │
   │    POST https://api.u2020682.nyat.app:18329/login/qr/create      │
   │                    │                                            │
   │                    ▼                                            │
   │        DNS  CNAME api.u2020682.nyat.app → frp-add.com           │
   │              A     43.225.47.70                                 │
   │                    │                                            │
   │              natfrp 边缘节点 #3 [VIP] 香港特别行政区1             │
   │              （按 SNI 收 TLS，终止证书 *.u2020682.nyat.app）       │
   └────────────────────│────────────────────────────────────────────┘
                        │  隧道 29523356「Folia_NCM_Api」类型 TCP，远程端口 18329
                        ▼
   ┌────────────────── 笔记本 192.168.0.109（xls）───────────────────┐
   │                                                                │
   │   frpc.exe  计划任务 LianYinSu-SakuraFRP                        │
   │     C:\lianyinsu\scripts\start-frpc.ps1   ← $ids 里有 7 条隧道    │
   │     日志 C:\lianyinsu\logs\frpc-console.log                     │
   │                        │                                       │
   │                        ▼  127.0.0.1:3000                        │
   │   ncm v4.41.1   计划任务 LianYinSu-NCM-API，监听 :::3000         │
   │     C:\lianyinsu\netease-api\                                  │
   │     日志 C:\lianyinsu\logs\ncm-{out,err}.log                    │
   └────────────────────────────────────────────────────────────────┘

   ✗ 开发 PC 192.168.0.104 —— 只做「编译 APK / 写代码 / git」，运行时不在上面任何一跳
```

---

## 2. 逐跳详解

| # | 从 | 到 | 协议 / 端口 | 说明 |
|---|---|---|---|---|
| 1 | 手机 Folia WebView | natfrp 边缘 `43.225.47.70` | HTTPS `18329` | 证书 `CN=*.u2020682.nyat.app`，有效期 2026-10-14 → 2027-01-12，由 natfrp 自动签发，**可信 CA** |
| 2 | natfrp 边缘 | 笔记本 frpc | 隧道 `29523356`（TCP） | SakuraFRP。远程端口 `18329` 由 natfrp 分配 |
| 3 | 笔记本 frpc | 本机 ncm | HTTP `127.0.0.1:3000` | ncm 监听 `:::3000`，frpc 连本机回环 |
| 4 | ncm | 网易云官方 | HTTPS | ncm 自己再出网。出口 IP 变成香港节点，**有触发风控的可能** |

**为什么必须带 `:18329`：** natfrp 的免费子域 `*.nyat.app` 不能填进 HTTPS 建站隧道，
只能绑到 **TCP 隧道**，由边缘按 SNI 收 TLS，所以地址必须带远程端口。
详见 [`NCM-DEPLOY.md`](NCM-DEPLOY.md) 的「证书：三段弯路」。

---

## 3. 各机器的职责

| 机器 | 地址 | 在运行时链路上？ | 干什么 |
|---|---|---|---|
| 手机 Folia | `192.168.0.100`（一加 Ace 3 / PJE110） | ✅ 链路起点 | 播放、发音源请求 |
| 笔记本 | `192.168.0.109` | ✅ **真正的音源宿主** | 跑 ncm + frpc，两个开机自启计划任务 |
| 开发 PC | `192.168.0.104`（本机） | ❌ **不在** | 写代码、`vite build`、`gradle assembleDebug`、`adb install` |
| natfrp 边缘 | `43.225.47.70`（香港1） | ✅ 中转 | 终止 TLS，转发到隧道对端 |

> 💡 **反直觉但重要**：手机当前和开发 PC 在同一个局域网（`192.168.0.x`），
> 这会让人下意识以为「它走的是内网直连」。**并没有。**
> 局域网只是碰巧同网段，App 里写死的是公网域名，流量会真的绕出去。

---

## 4. 为什么总觉得「App 在拉本 PC 的音源」

因为**桌面版和安卓版是两条完全不同的路**，同一个 App 名字，音源后端却不同：

| | 桌面版（Electron） | 安卓版（Capacitor WebView） |
|---|---|---|
| 运行时判断 | `window.electron` 存在 → `isElectronRuntime()` 为 true | 无 `window.electron` → 走远端 |
| 音源地址 | **内嵌后端**，`bridge.getNeteasePort()` 给一个本地随机端口 | `import.meta.env.VITE_NETEASE_API_BASE` = 公网 https 地址 |
| 实际服务 | Electron 主进程自己拉起的 ncm，跑在**这台 PC 上** | 笔记本 `192.168.0.109` 上的 ncm |
| 源码 | `src/services/netease.ts:20-45` | 同上，`getConfiguredApiBase()` |

代码里**没有任何 localhost / 内网回退逻辑**：`getConfiguredApiBase()` 读不到环境变量就返回
`null`，随后 `getApiBase()` 直接抛 `NETEASE_API_BASE_MISSING`，
**不会**悄悄改去连 `127.0.0.1`。所以「连不上」会报错，而不是静默连本机。

> ⚠️ **另一个容易误读的 `localhost`**：手机 WebView 的 origin 是 `https://localhost`。
> 那是 Capacitor 把 APK 内 `dist/` 用虚拟域名映射出来的地址，**就是 App 自己**，
> 和音源没有任何关系。`capacitor.config.ts` 里的 `hostname: 'localhost'` 就是它。

---

## 5. 地址与端口一览

| 项 | 值 | 在哪改 |
|---|---|---|
| 公网入口 | `https://api.u2020682.nyat.app:18329` | `.env.local` 的 `VITE_NETEASE_API_BASE`（**不入库**） |
| App 里的 API base 读取点 | `src/services/netease.ts:31-42` | 全仓只有这一处读 `VITE_NETEASE_API_BASE` |
| natfrp 隧道 ID | `29523356` / `Folia_NCM_Api` | natfrp 后台 + 笔记本 `start-frpc.ps1` 的 `$ids` |
| 远程端口 | `18329` | natfrp 分配。**删隧道重建会变**，改完必须同步 `.env.local` 并重装 APK |
| 笔记本 ncm 监听 | `:::3000` | 笔记本 `.env` + 计划任务 `LianYinSu-NCM-API` |
| frpc 隧道清单 | `29522998, 29523356, 27892927, 27892289, 27893124, 27906413, 28314110` | 笔记本 `C:\lianyinsu\scripts\start-frpc.ps1` |
| 笔记本防火墙 | `Folia NCM API 3000 (LAN only)`：Private + LocalSubnet + TCP 3000 | 仅供临时回退内网调试 |
| CORS 白名单 | `https://localhost`、`http://localhost` | 笔记本 `.env` 的 `CORS_ALLOW_ORIGIN` |

---

## 6. 两个入口的区别（不要用错）

| 隧道 | 地址 | 证书 | App 指向？ |
|---|---|---|---|
| `29523356` `Folia_NCM_Api` | `https://api.u2020682.nyat.app:18329` | **可信 CA**，实测 `tls=0` | ✅ **是** |
| `29522998` `Folia_NCM` | `https://ncm.shimoray.com` | **自签**（frpc 自动生成） | ❌ **不是**，保留仅作备用/排障 |

> 自签证书这条路走不通的原因是：**安卓 WebView 不能像 `curl -k` 那样绕过证书校验。**
> 自定义域名 + Cloudflare CNAME 这条路已彻底作废，别再试。

---

## 7. 什么时候会断

按影响从大到小：

| 故障 | 表现 | 能否自愈 |
|---|---|---|
| 笔记本关机 / 休眠 / 拔网线 | 手机完全无法登录与播放 | 需人工开笔记本 |
| natfrp 免费隧道额度用尽（146.2 GiB） | 同上 | 需充值 |
| 香港1 节点超载（日志有提示） | 慢、偶发失败 | 自动 |
| 删隧道重建导致 `18329` 变了 | App 全部 404 / 连不上 | 需改 `.env.local` + 重装 APK |
| 网易云风控（出口 IP 变成香港） | 登录态失效，需重新扫码 | 重新扫码 |
| 开发 PC 关机 | **无任何影响** ✅ | — |

> 🔒 **公网入口没有访问密码**，任何拿到这个地址的人都能调这个 ncm 实例。
> 自用侧载可接受，但不要往里放重要账号。

---

## 8. 想临时回退内网调试

只在调试时用，**用完记得改回来并重装 APK**：

1. `.env.local` 改成 `VITE_NETEASE_API_BASE=http://192.168.0.109:3000`
2. `capacitor.config.ts`：`server.androidScheme` 改回 `'http'`、`server.cleartext` 改回 `true`
3. `android/app/src/main/AndroidManifest.xml` 恢复 `android:networkSecurityConfig`，
   并把 `android/app/src/main/res/xml/network_security_config.xml` 加回来
   （该文件已在 commit `70e43868` 删除，从那里 `git show` 取回）
4. 重新构建 + 装机

代价：手机必须和笔记本同局域网，且**笔记本不能睡**。

---

## 9. 还没接的音源

| 音源 | 状态 | 需要什么 |
|---|---|---|
| 网易云 | ✅ 已接，走本文档的链路 | —— |
| QQ 音乐 | ❌ 未配置 | `VITE_QQ_API_BASE` + 一个 QQ 音源后端 |
| 酷狗 | ❌ 未配置 | `VITE_KUGOU_API_BASE` + 一个酷狗音源后端 |

`deploy/docker/` 里有官方现成的 `netease-api` / `kugou-api` / `qq-api` 镜像，
要接的话照着 [`NCM-DEPLOY.md`](NCM-DEPLOY.md) 复制一套部署即可。

---

## 10. 排障对照表

| 症状 | 先查 |
|---|---|
| App 报「登录错误」，控制台 code = `NETEASE_API_BASE_MISSING` | **多半是 Service Worker 在发旧构建**，不是配置错了。比对页面 `script[src]` 文件名与本地 `dist/assets/`；对不上就清 SW 缓存。见 `CHANGELOG-RELEASE.md` 的 `dev-2026-10-14-fullscreen-padding` |
| App 突然连不上，但 `curl` 公网地址是 200 | 笔记本是否休眠 / frpc 是否掉线：`C:\lianyinsu\logs\frpc-error.log` |
| `curl` 返回 200 但 `tls≠0` | 证书链问题。**不要用 `-k` 测**，否则测不出来 |
| `curl` 本机测不通 | 本机有 `HTTP_PROXY`，必须加 `--noproxy '*'` |
| 想确认 App 真实指向 | 第 0 节第 ① 条，比对 `dist/` |
| 改了 `.env.local` 但 App 没变 | 没重新 `vite build` + `cap sync` + 重装 APK；或又是 SW 旧缓存 |

---

## 相关文件

| 文件 | 内容 |
|---|---|
| [`NCM-DEPLOY.md`](NCM-DEPLOY.md) | 笔记本 ncm 部署、开机自启、natfrp 隧道与子域绑定的完整步骤 |
| [`ANDROID.md`](ANDROID.md) | 安卓壳方案、构建、edge-to-edge / SystemBars 踩坑 |
| [`CHANGELOG-RELEASE.md`](CHANGELOG-RELEASE.md) | 二开流水，每条带实测数据 |
| [`android-build.ps1`](android-build.ps1) | 构建脚本（固化 JDK / SDK 环境变量陷阱） |
| `docs/dev/ncm-api.ps1` | ncm 本地调试辅助脚本 |
| `.env.local`（**不入库**） | `VITE_NETEASE_API_BASE` 真正被读取的地方 |