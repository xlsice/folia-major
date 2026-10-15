# Folia 二开 — APK 默认设置（从真机采集）

> 目标：**以后构建出来的 APK，装上去就是雪冷水手机上那套设置**，不用再逐项点一遍。
> 唯一例外是网易云 Cookie —— 凭证一律不进产物。

---

## 1. 机制：只补缺失，不覆盖已有

设置存在 WebView 的 `localStorage` 里（不是 IndexedDB —— 那些 cache / session 走 Dexie，见
`src/services/db.ts`）。所以"让默认值生效"就是在 App 启动最早的时候，把一份键值对写进
`localStorage`。

关键取舍是**只写缺失的 key**：

```ts
if (localStorage.getItem(key) !== null) continue;   // 已有值一律不碰
localStorage.setItem(key, value);
```

| 场景 | localStorage 状态 | 结果 |
| --- | --- | --- |
| 全新安装（APK 首次装机） | 空 | 全部 50 项写入 → 拿到这套默认值 |
| 已在用的机器升级 APK | 已有他自己的值 | 一个字节都不动，他的设置完整保留 |

这正是"默认值"该有的语义：给空仓库填货，不是清空仓库再重填。

### 为什么种子必须早于一切 store

各 store 读设置走 `src/stores/storagePrimitives.ts` 的 `getStoredBoolean` / `getStoredString`，
它们是**读 localStorage，拿不到就用代码里的 fallback**。如果种子在 store 之后跑，
第一批被读的 key 会先命中 fallback，把默认值吃掉。

所以 `src/config/applyDefaultSettings.ts` 是 `src/index.tsx` 的**第一个 import**：

```ts
// Must stay the first import: seeds localStorage before any store reads its fallback,
// and before installConsoleLogCapture() picks up console_log_filters.
import './config/applyDefaultSettings';
import { Buffer } from 'buffer';
```

ESM 静态 import 的求值顺序保证它先于 `bootstrap()`（`index.tsx` 里是 `void import()`，动态，
更晚）和任何 store 模块。**这个 import 不要往后面挪。**

⚠️ 附带影响：种子对 **web 端和桌面端也生效**（同一个 `index.tsx`）。
桌面版已经配好的话不受影响 —— 已有值不会被覆盖。

---

## 2. 文件分工

| 文件 | 角色 | 手改？ |
| --- | --- | --- |
| `src/config/defaultSettings.generated.ts` | 设置数据，**生成物** | ❌ 会被覆盖 |
| `src/config/applyDefaultSettings.ts` | 落盘逻辑（含"只补"规则） | ✅ |
| `docs/dev/make-default-settings.mjs` | 采集 → 剔除 → 生成 | ✅ |
| `docs/dev/.tmp/dump-localstorage.mjs` | CDP 导出真机 localStorage | ✅（本地工具，已 gitignore） |
| `test/unit/config/applyDefaultSettings.test.ts` | 把规则钉成回归 | ✅ |

---

## 3. 采集 → 生成

```powershell
# 1. 手机上打开 Folia，然后（无线调试或 USB 均可）
adb shell pidof top.izuna.foliamajor
adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>

# 2. 导出整份 localStorage（要求 App 的 WebView 可调试）
node docs/dev/.tmp/dump-localstorage.mjs docs/dev/.tmp/device-localstorage.json

# 3. 剔除凭证与瞬时状态，生成数据文件
node docs/dev/make-default-settings.mjs docs/dev/.tmp/device-localstorage.json
```

第 3 步会打印剔除明细，**并且只打印 key 名，绝不打印值**。生成前还有一道闸：
产物里只要还留着疑似凭证的 key，脚本直接中止、不落盘。

---

## 4. 剔除规则与理由

采集到 57 项，收录 50 项，剔除 7 项。

### 4.1 凭证（1 项）

| key | 说明 |
| --- | --- |
| `online_provider:netease:cookie` | 网易云登录会话（`MUSIC_U` / `MUSIC_A_T` / `MUSIC_R_T` …） |

判定用正则 `/cookie\|token\|password\|secret\|credential\|userid\|dfid\|session[_-]?id/i`
匹配 key 名。覆盖两类写法：`providerStorage.ts` 的命名空间式
（`online_provider:<provider>:<key>`）和历史遗留的扁平式（`netease_cookie`）。

⛔ **不要放宽这条**。cookie 进了 `defaultSettings.generated.ts` 就等于进了 APK，
任何人拿到 APK 都能直接用你的网易云账号。单测里有一条专门盯这个
（`默认设置的值里不含网易云会话标识`）。

### 4.2 瞬时状态 / 遥测（6 项）

这些描述的是"上次离开时在哪"，不是偏好：

| key | 为什么不要 |
| --- | --- |
| `folia_local_music_last_row` | 列表滚动位置 |
| `folia_settings_last_section` | 设置页停在哪一节 |
| `last_app_view` | 上次打开哪个界面。**真机实测**：App 启动后会自己把它改写成当前界面，放进默认值等于放一份立刻被覆盖的死数据 |
| `wall_tools_queue_island_open` | 悬浮岛开合态 |
| `command_palette_frequency_v1` | 命令面板使用频次（遥测） |
| `command_palette_recent_functional_v1` | 命令面板最近使用（遥测） |

判据不是拍脑袋：`last_home_view_tab` 同样是"上次在哪"，但真机实测它在启动后**不会**被 App 改写，
说明它是被用户意图保留下来的偏好，所以留下。这条区别只有跑一次真机回填核对才看得出来。

---

## 5. 收录了什么（50 项，按域）

| 域 | 代表项 |
| --- | --- |
| 资料库套件 | `library_suite=netease` |
| 可视化 | `visualizer_mode=partita`、`visualizer_background_mode=monet`、`monet_background_tuning`、`nomand_background_tuning`、`lattice_lights_on`、`video_layer_opacity` |
| 主题 | `custom_dual_theme`、`default_theme_daylight`、`follow_system_theme`、`theme_auto_generate_enabled`、`theme_auto_switch_enabled`、`theme_generation_source=cover`、`theme_animation_intensity=chaotic` |
| 播放 | `default_audio_quality=lossless`、`player_loop_mode=all`、`auto_hide_player_chrome`、`player_chrome_visibility_mode=auto-hide`、`hide_player_progress_bar`、`hide_player_right_panel_button` |
| 歌词 | `local_lyrics_priority=online`、`preferred_alternative_lyric_source_v2=netease`、`hide_player_translation_subtitle` |
| 界面 | `i18nextLang=zh-CN`、`library_wall_look=solid`、`last_home_view_tab=playlist`、`stage_track_pill_timeout_sec=50` |
| 网络/音源 | `folia_enable_media_cache`、`folia_netease_scrobble`、`folia_automix_enabled=false` |
| 引导 | `folia_ponder_seen`、`folia_last_seen_guide_version`（新装机不再弹新手引导） |

---

## 6. 已验证的边界

- **旧格式值不会炸设置页**：各 tuning 的解析是防御式的 —— `try/catch` + 逐字段回落
  （见 `src/stores/visualizerSettingsPersistence.ts`），seed 一份形状略旧的 JSON 最多退到
  该字段的默认值，不会白屏。
- **单 key 写失败不影响其他 key**：`applyDefaultSettings` 逐 key 捕获异常（配额等），
  失败就跳过，默认值是锦上添花，不该让 App 起不来。
- **幂等**：第二次执行写入 0 项。

---

## 7. 改动后重新采集

改了默认设置、想再收一批：在手机上改好 → 重跑第 3 节三步 → `npm run typecheck` →
`npm run test:unit` → 重新构建 APK。

⚠️ 重新采集会**整份替换** `defaultSettings.generated.ts`。
如果旧数据里有想保留、但这次没在手机上体现的项，记得回捞。

---

## 8. 排查

| 现象 | 查哪 |
| --- | --- |
| 新装机仍是代码 fallback | 数据文件里没这个 key，或 seeding 跑晚了（`index.tsx` 的 import 顺序） |
| 已有机器没变化 | **符合预期** —— 只补缺失，不覆盖 |
| 设置里改了没反应 | 可能是 Service Worker 缓存旧 chunk，见 `docs/dev/AGENTS.md` 的清理片段 |
| 怀疑凭证泄漏 | `Select-String -Path src\config\defaultSettings.generated.ts -Pattern 'cookie\|token\|MUSIC_'` |
