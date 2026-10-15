# Folia 二开 — 变更流水

> 记录**我们这个 fork** 的里程碑。上游 Folia 自己的版本发布看 GitHub Releases，
> 本文件只记我们的二开状态。
> 格式参照 yunyun-ecosystem 的 `CHANGELOG-RELEASE.md`。

---

## ⚡进行中（next release）

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