# 网易云 API 部署指引（让安卓版脱离本机）

> 对应 CHANGELOG 条目 `dev-2026-10-13-playback-lan`。
> **当前状态：局域网方案可用，但电脑不开机就没法播。** 本文是把服务搬上云的做法。

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

## 方案 C：natfrp 内网穿透（**不解决根本问题**）

服务仍然跑在你电脑上，穿透只是给它一个 https 域名。
**电脑不开机，服务照样没**，只是在外面能用「你电脑开着的时候」。
适合临时给朋友用，不适合当长期方案。

---

## 方案 D：继续局域网（当前状态）

```powershell
powershell -ExecutionPolicy Bypass -File docs\dev\ncm-api.ps1
```

电脑开机 + 脚本在跑就能用。换网络要同步改 `.env.local` 与
`network_security_config.xml` 后重新构建。

---

## 切到云端后可以清理掉的东西

| 文件 / 配置 | 处理 |
| --- | --- |
| `.env.local` 的 `VITE_NETEASE_API_BASE` | 改成 `https://xxx.vercel.app` |
| `capacitor.config.ts` 的 `server.androidScheme` | `http` → `https` |
| `capacitor.config.ts` 的 `server.cleartext` | `true` → `false` |
| `android/app/src/main/res/xml/network_security_config.xml` | 删除 |
| `AndroidManifest.xml` 的 `android:networkSecurityConfig` | 移除该属性 |
| Windows 防火墙规则 `Folia NCM API 3000 (LAN only)` | 可以删掉 |
| `docs/dev/ncm-api.ps1` | 保留（想回退到局域网时还能用） |

改完 `https` 后，WebView origin 回到 `https://localhost`，
所以 Vercel 侧的 `CORS_ALLOW_ORIGIN` 也应该填 `https://localhost`（同上）。

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

### 切到 Vercel 后会怎样

**反而更正确。** 看 `server.js:364-378`：

```js
if (req.protocol === 'https') {
  res.append('Set-Cookie', cookies.map(c => c + '; SameSite=None; Secure'))  // ← Vercel 走这条
} else {
  res.append('Set-Cookie', cookies)   // ← 当前局域网 http 走这条，不加 SameSite
}
```

当前 http 方案下 cookie 不带 `SameSite`，Chromium 默认按 `Lax` 处理；
Android WebView 的 CookieManager 对此比较宽松，加上 Folia 本来就绕开了 cookie jar
（走 localStorage），所以照样能用。**换到 Vercel 的 https 后会带上
`SameSite=None; Secure`**，这才是跨站场景下正确的写法。

### 两个真实的风险（服务端策略，我无法预判）

1. **IP 切换可能触发网易云风控。** 从 `192.168.0.104`（家宽局域网）换成 Vercel 的
   边缘 IP，等于「同一账号突然换了出口 IP」。网易云有可能要求重新验证或直接拒绝。
   真遇到了只能在 App 里重新扫码一次。
2. **cookie 本身有有效期。** `MUSIC_R_U` 的 `Max-Age` 是 15552000 秒（**约 180 天**），
   过期后必须重新扫码。这与部署方式无关，局域网也一样。

---

## 还没解决的：QQ 与酷狗

`.env.local` 里只配了网易云。另外两个平台仍然会抛各自的 `*_API_BASE_MISSING`：

| 平台 | 变量 | 状态 |
| --- | --- | --- |
| 网易云 | `VITE_NETEASE_API_BASE` | ✅ 已通 |
| QQ | `VITE_QQ_API_BASE` | ❌ `api-ts/qq.ts` 只是个 serverless handler（`vercel.json` 里有 `/api/qq` rewrite），不是完整后端 |
| 酷狗 | `VITE_KUGOU_API_BASE` | ❌ **仓库里没有现成可部署的酷狗后端**，桌面版是 `electron/kugouApiBridge.cjs` 直连官方接口，需要单独调研 |

QQ 可能是 `api-ts/qq.ts` + rewrite 那一套；酷狗要另想办法。
