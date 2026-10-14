# 网易云 API 部署指引（让安卓版脱离本机）

> 对应 CHANGELOG 条目 `dev-2026-10-14-ncm-cloud-frp`。
> **当前状态：已切到公网常驻方案** —— 笔记本 `192.168.0.109` 跑 ncm，SakuraFRP 穿透，
> 公网入口 `https://api.u2020682.nyat.app:18329`（可信证书）。开发 PC 不需要开机。
> 下面是各方案对比与已落地配置的完整记录。

> 📌 **只想确认「App 到底连的是哪台机器」或排查连不上，不需要读本文全文。**
> 看 [`NETWORK.md`](NETWORK.md) 就行 —— 里面有拓扑图、逐跳链路、30 秒自证命令和排障对照表。
> 本文是**部署操作手册**，改配置时才需要。

---

## 为什么必须部署

Folia 的音源后端是 **Node 服务**：

- 桌面版靠 Electron 主进程内嵌 `@neteasecloudmusicapienhanced/api`，渲染层通过
  `window.electron.getNeteasePort()` 拿到 `http://127.0.0.1:<port>`（`src/services/netease.ts:79-95`）。
- Android 版是 Capacitor WebView，**没有主进程**，跑不了 Node 服务，只能发 HTTP 请求。
- 所以必须有一个部署在别处的 API，App 用 `VITE_NETEASE_API_BASE` 指过去。
- 没配这个变量时 `netease.ts:106` 直接抛 `NETEASE_API_BASE_MISSING`，
  二维码登录、搜索、歌单、播放地址全部不可用。

**好消息**：这个包**官方就支持 Vercel 一键部署**，仓库自带 `vercel.json`。
（注意：npm 包里**不含** `vercel.json`，必须 fork GitHub 仓库，不能直接部署 npm 包。）

上游作者 `chthollyphile` 自己的 Folia 也用这个 fork —— 见该项目 README 的致谢列表。

---

## 方案 A：Vercel（推荐，免费额度够自用）

### 步骤

1. **Fork 仓库**
   打开 <https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced> → `Fork`。
   名字随意，不必只勾 master 分支。

2. **Vercel 导入**
   打开 <https://vercel.com> → 用 GitHub 登录 → `Add New` → `Project`
   → 选中刚 fork 的仓库 → `Import`。
   - `PROJECT NAME` 随意
   - `FRAMEWORK PRESET` 必须选 **Other**（不是 Node.js，仓库不是标准框架项目）
   - 直接点 `Deploy`，等它跑完

3. **⚠️ 必须设环境变量（否则 App 连不上）**

   在 Vercel 项目的 `Settings` → `Environment Variables` 添加：

   | 名称 | 值 | 为什么 |
   | --- | --- | --- |
   | `CORS_ALLOW_ORIGIN` | `https://localhost` | **最关键**。Folia 的 `fetchWithCreds` 用 `credentials: 'include'`（`netease.ts:112-119`），而 `Access-Control-Allow-Origin: *` **不能**与 `credentials: include` 组合，浏览器会直接拒。默认值是 `*`，必须改成 WebView 的 origin。 |
   | `ENABLE_GENERAL_UNBLOCK` | `true` | 推荐开启：自动解锁灰掉的歌曲，否则很多歌播放不了。 |
   | `ENABLE_FLAC` | `false` | 无损音质会显著增加流量，Vercel 免费额度下建议关。 |

   加完点 `Deployments` → 最新一次部署右侧 `...` → `Redeploy`。

4. **验证**（浏览器里直接开）
   ```
   https://你的项目名.vercel.app/login/qr/key
   ```
   期望返回 `{"code":200,"data":{"unikey":"..."}}`。

   再验证 CORS 头对：
   ```bash
   curl -s -i -H "Origin: https://localhost" https://你的项目名.vercel.app/login/qr/key | findstr /I "access-control"
   ```
   期望看到 `access-control-allow-origin: https://localhost` 与 `access-control-allow-credentials: true`。

5. **把地址交给我**，剩下的我来：
   - 改 `.env.local` 的 `VITE_NETEASE_API_BASE`
   - `capacitor.config.ts`：`androidScheme` 改回 `https`、`cleartext` 改回 `false`
   - 删掉 `android/app/src/main/res/xml/network_security_config.xml` 并从 Manifest 移除引用
     （Vercel 是 https，不再需要任何明文例外）
   - 重建 APK、装机、真机验证二维码

### Vercel 的已知限制

- **免费额度**：Hobby 计划有函数执行时长与带宽上限。个人自用一般够，
  但长时间挂机播放 + 无损音质可能触顶。
- **冷启动**：闲置后首次请求会有几秒延迟。
- **Cookie 存在 Vercel 上**：登录态（NMTID 等）由服务端保存。你自己部署的实例，
  只有你自己用；但要知道这意味着凭据不在你本机上。

---

## 方案 B：腾讯云 SCF（官方也支持）

README 里给了：新建 Web 应用 → 选 Express 框架 → 代码仓库选 fork 的项目 →
启动文件：

```bash
#!/bin/bash
export PORT=9000
/var/lang/node16/bin/node app.js
```

适合你有腾讯云账号、想自己完全掌控的情况。

---

## 方案 C：SakuraFRP + 笔记本常驻（✅ 当前采用，2026-10-14）

不用云厂商账号，也不用开发 PC 开机。内网笔记本（`192.168.0.109`，常开）跑 ncm，
用 SakuraFRP 把它暴露到公网 HTTPS。**关键难点是证书**，下面记的都是实测结论。

### 已落地的事实

| 项 | 值 |
| --- | --- |
| ncm 版本 | `@neteasecloudmusicapienhanced/api` v4.41.1，装在 `C:\lianyinsu\netease-api` |
| 常驻方式 | 计划任务 `LianYinSu-NCM-API`（SYSTEM 身份 / AtStartup / 无时限），监听 `:::3000` |
| frpc 方式 | 计划任务 `LianYinSu-SakuraFRP`，跑 `C:\lianyinsu\scripts\start-frpc.ps1` |
| 隧道 ID | **`29523356`**（名称 `Folia_NCM_Api`，类型 **TCP**，远程端口 **18329**） |
| 节点 | `#3 [VIP]香港特别行政区1` |
| 子域 | `api.u2020682.nyat.app`（在 natfrp「子域绑定」页绑到上面这条 TCP 隧道） |
| 公网入口 | `https://api.u2020682.nyat.app:18329` |
| 防火墙 | `Folia NCM API 3000 (LAN only)`，Private + LocalSubnet + TCP 3000 |

笔记本 `.env`（`C:\lianyinsu\netease-api\.env`）：

```
CORS_ALLOW_ORIGIN=https://localhost,http://localhost
ENABLE_GENERAL_UNBLOCK=true
ENABLE_FLAC=false
```

### 证书：为什么必须是 TCP 隧道 + 子域

这一段是踩坑换来的，**不要随便改成 HTTPS 建站隧道**：

1. **natfrp 不为自定义域名签发可信证书。**
   建 HTTPS 建站隧道并绑 `ncm.shimoray.com`（Cloudflare CNAME → `frp-add.com`）能通，
   `curl -k` 返回 200，但 `frpc` 日志明写「当前证书: frpc 自动生成」——
   **自签**。`claw.shimoray.com` 同样自签。安卓 WebView 不能像 `curl -k` 那样绕过，
   所以这条路走不通。

2. **只有 natfrp 自己的 `*.nyat.app` 子域才有可信证书。**
   官方文档 `doc.natfrp.com/bestpractice/domain-bind.html`：
   「SakuraFrp 为所有用户提供免费的 `nyat.app` 子域和 SSL 证书」。
   申请后拿到 `u2020682.nyat.app`（UID 前缀，不可改）。

3. **但 `nyat.app` 子域不能填进 HTTPS 建站隧道的「绑定域名」。**
   创建时 natfrp 直接拒绝：
   > Nyat APP 域名不可直接用于 HTTP(S) 隧道中, 用于建站请先创建 TCP 隧道,
   > 在子域绑定页面将域名绑定到 TCP 隧道, 然后使用 `https://<子域名>:远程端口` 进行访问

   所以正确形态是：**TCP 隧道 + 子域绑定 + 边缘用 SNI 收 TLS**，
   访问地址必须带远程端口（本例 `:18329`）。

4. **一条隧道只能有一个连接地址。** 已绑自定义域名的隧道不会再出现在子域绑定的候选列表里，
   所以当初那条 `29522998 / Folia_NCM（自签）` 没法直接复用，只能另建一条 TCP 隧道。
   它目前仍保留着，可当 LAN 之外的备用/排障入口，但**不要**把 App 指过去。

### 生效后 frpc 日志长这样（关键行）

```
[I] 已从服务器为 api.u2020682.nyat.app 加载证书 [CN = *.u2020682.nyat.app, 2026-10-14 - 2027-01-12]
[I] TCP 隧道启动成功
[I] 使用 >>api.u2020682.nyat.app:18329<< 连接你的隧道
```

出现「已从服务器为 … 加载证书」就说明拿到的是**真证书**，不是自签。

### 验证

```powershell
curl.exe --noproxy '*' -sS -o - -w "`nHTTP=%{http_code} tls=%{ssl_verify_result}`n" `
  https://api.u2020682.nyat.app:18329/login/status
```

期望：`HTTP=200 tls=0`，body 是 `{"data":{"code":200,"account":null,"profile":null}}`。
`tls=0` 是关键 —— **不要加 `-k`**，加了就不算验证证书了。
（本机有 `HTTP_PROXY` 环境变量，所以必须带 `--noproxy '*'`。）

### 改隧道 ID 的正确姿势

frpc 的隧道列表不在配置文件里，而是 `start-frpc.ps1` 里手写的 `$ids` 数组：

```powershell
$ids = '29522998', '29523356', '27892927', '27892289', '27893124', '27906413', '28314110'
$arg = '-f' + $token + ':' + ($ids -join ',')
```

改完**必须重启 `LianYinSu-SakuraFRP` 计划任务**（改配置不会热加载）。
用 `docs/dev/.tmp/add-id-29523356.ps1` 那套做法：以 ISO-8859-1（28591）做字节往返，
只替换 `$ids` 那一行，其余字节一个不动。
⛔ 千万别用 `ReadAllText(UTF8)` → `WriteAllText(无 BOM)` 改这个文件，
详见 `CHANGELOG-RELEASE.md` 里那次「6 条隧道全断」的事故记录。

### 已知限制

- **香港1 节点日志提示「处于超载运行状态」**，体验可能受影响；备用节点见 `yunyun.shimoray.com` 用的「香港特别行政区3」。
- **公网入口没有访问密码**，任何拿到地址的人都能调这个 ncm 实例。
  想收紧只能自己在 ncm 前加一层校验（或改用 natfrp 的「访问密码」）。
- **端口 18329 是 natfrp 分配的**，删隧道重建会换端口，`.env.local` 要同步改并重装 APK。

---

## 方案 C-旧：natfrp 穿透自己的开发 PC（**不推荐**）

服务跑在开发 PC 上，穿透只是给它一个 https 域名。
**PC 不开机，服务照样没。** 现在实际是把这条思路的「服务端」换成常开的笔记本而已。
适合临时给朋友用。

---

## 方案 D：继续局域网（当前状态）

```powershell
powershell -ExecutionPolicy Bypass -File docs\dev\ncm-api.ps1
```

电脑开机 + 脚本在跑就能用。换网络要同步改 `.env.local` 与
`network_security_config.xml` 后重新构建。

---

## 已完成的云端切换（2026-10-14）

| 文件 / 配置 | 处理 | 状态 |
| --- | --- | --- |
| `.env.local` 的 `VITE_NETEASE_API_BASE` | 改成 `https://api.u2020682.nyat.app:18329` | ✅ 已改 |
| `capacitor.config.ts` 的 `server.androidScheme` | `http` → `https` | ✅ 已改 |
| `capacitor.config.ts` 的 `server.cleartext` | `true` → `false` | ✅ 已改 |
| `android/app/src/main/res/xml/network_security_config.xml` | 删除 | ✅ 已删 |
| `AndroidManifest.xml` 的 `android:networkSecurityConfig` | 移除该属性 | ✅ 已改 |
| Windows 防火墙规则 `Folia NCM API 3000 (LAN only)` | **保留** | 服务端已搬到笔记本，本机这条规则现在只服务「临时回退内网调试」，删不删都行 |
| `docs/dev/ncm-api.ps1` | 保留（想回退到本机局域网时还能用） | 保留 |

改回 `https` 后，WebView origin 回到 `https://localhost`，
所以笔记本 `.env` 的 `CORS_ALLOW_ORIGIN` 填的是 `https://localhost,http://localhost`
（两个都留着，方便来回切）。

### 想临时回退内网调试

1. `.env.local` 改成 `http://<笔记本局域网IP>:3000`
2. `capacitor.config.ts` 的 `androidScheme` 改回 `http`、`cleartext` 改回 `true`
3. 把 `android:networkSecurityConfig="@xml/network_security_config"` 加回 Manifest，
   并重建那个 xml（放行笔记本 IP）
4. 重新构建 APK

`.env.local` 和 `capacitor.config.ts` 的注释里都写了这段，别真忘了第 3 步。

---

## 切到云端后，已登录的账号会失效吗？

**不会。** 实测结论（2026-10-13，一加 Ace 3 真机）：

### 登录态存在哪

**存在 App 本地，不是服务端 session。**

| 位置 | 内容 |
| --- | --- |
| `localStorage["online_provider:netease:cookie"]` | 完整的 cookie 字符串（约 3900 字符：`MUSIC_A_T` / `MUSIC_R_U` / `MUSIC_U` / `__csrf` …） |
| `document.cookie` | **空** —— Folia 根本不用浏览器 cookie jar |

写入方是 `src/services/onlineMusic/providerStorage.ts`
（`writeProviderSessionValue` → `localStorage.setItem`），
读取方 `readProviderSessionValue`。**只是把 cookie 当字符串存在本地**，
每个请求由 `fetchWithCreds`（`netease.ts:112`，`credentials: 'include'`）
连同 `?cookie=` 一起发出去。

服务端侧 `server.js:224-232` 只是 `req.headers.cookie` → `req.cookies` 的无状态解析，
**不维护任何会话**。所以换一台服务器，App 把同一个 cookie 发过去就继续认。

### 真机实测（换服务器前先验证现状是好的）

| 请求 | 结果 |
| --- | --- |
| `/login/status` | `200`，`account.id: 18032498803`，有用户名 |
| `/user/playlist` | `200`，返回 playlist 数组 |

### 切到公网 https 后会怎样

**反而更正确。** 看 `server.js:364-378`：

```js
if (req.protocol === 'https') {
  res.append('Set-Cookie', cookies.map(c => c + '; SameSite=None; Secure'))  // ← 公网 https 走这条
} else {
  res.append('Set-Cookie', cookies)   // ← 旧的局域网 http 走这条，不加 SameSite
}
```

旧 http 方案下 cookie 不带 `SameSite`，Chromium 默认按 `Lax` 处理；
Android WebView 的 CookieManager 对此比较宽松，加上 Folia 本来就绕开了 cookie jar
（走 localStorage），所以照样能用。**切到 natfrp 的可信 https 后会带上
`SameSite=None; Secure`**，这才是跨站场景下正确的写法。

### 两个真实的风险（服务端策略，我无法预判）

1. **IP 切换可能触发网易云风控。** 从 `192.168.0.104`（开发 PC 局域网）换成 natfrp 香港节点，
   等于「同一账号突然换了出口 IP」。网易云有可能要求重新验证或直接拒绝。
   真遇到了只能在 App 里重新扫码一次。
2. **cookie 本身有有效期。** `MUSIC_R_U` 的 `Max-Age` 是 15552000 秒（**约 180 天**），
   过期后必须重新扫码。这与部署方式无关，局域网也一样。
3. **（2026-10-14 新增）笔记本得一直开机。** 现在整条链路依赖 `192.168.0.109`：
   笔记本关机 / 休眠 / 拔网线 → 计划任务还在但连不上 natfrp 节点 → App 直接播不出来。
   跟以前「开发 PC 关机」是同一个问题，只是换了个机器。

---

## 还没解决的：QQ 与酷狗

`.env.local` 里只配了网易云。另外两个平台仍然会抛各自的 `*_API_BASE_MISSING`：

| 平台 | 变量 | 状态 |
| --- | --- | --- |
| 网易云 | `VITE_NETEASE_API_BASE` | ✅ 已通 |
| QQ | `VITE_QQ_API_BASE` | ❌ `api-ts/qq.ts` 只是个 serverless handler（`vercel.json` 里有 `/api/qq` rewrite），不是完整后端 |
| 酷狗 | `VITE_KUGOU_API_BASE` | ❌ **仓库里没有现成可部署的酷狗后端**，桌面版是 `electron/kugouApiBridge.cjs` 直连官方接口，需要单独调研 |

QQ 可能是 `api-ts/qq.ts` + rewrite 那一套；酷狗要另想办法。
