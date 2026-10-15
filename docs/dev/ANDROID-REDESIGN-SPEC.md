# 安卓端界面重设计 — 细化规格（v1）

> 配套 [`ANDROID-REDESIGN.md`](ANDROID-REDESIGN.md)（方向稿）。方向稿已拍板两条：
> **① 字体走无衬线（Noto Sans SC 自带 webfont）；② 底部 tab 栏与 mini 播放器只统一视觉，不改结构。**
> 本文把这两条展开成可直接落地的数值与组件规格。功能结构一律不动。
>
> 证据基线：一加 Ace 3 / Android 16 / 1264×2780 / dpr 3.5 / CSS 视口 361×794，2026-10-15 实测。

---

## 1. 字体系统

### 1.1 锁字体（解决方向稿 §1.1）

**改动位置**：`src/index.css`，**仅新增** `Folia Noto Sans SC` 的 `@font-face`，
现有 `Folia Noto Serif SC` **不动**（桌面端和可视化仍在用，见 §1.4）。

实测体积（2026-10-15 下载验证，非估算）：

| 文件 | 体积 |
| --- | --- |
| `noto-sans-sc-chinese-simplified-400-normal.woff2` | **1.09 MB** |
| `noto-sans-sc-latin-400-normal.woff2` | **0.01 MB** |
| （对照）`noto-serif-sc-chinese-simplified-400-normal.woff2` | 1.44 MB |
| （对照）`noto-serif-sc-chinese-simplified-500-normal.woff2` | 1.46 MB |

**结论：换无衬线不但解决渲染问题，体积还比现有衬线两档更轻**（1.10 MB vs 2.90 MB）。

需要的字重：`400 / 500 / 600 / 700` 四个，合计约 **4.4 MB + 0.04 MB 拉丁**。
> 若 APK 体积敏感，实施时优先试 `@fontsource-variable/noto-sans-sc` 的可变字体，
> 单文件覆盖全字重。本次未验证其文件命名，实施时需实测。

```css
/* 安卓端无衬线族。只给 netease suite 用，不抢桌面端。 */
@font-face {
  font-family: 'Folia Noto Sans SC';
  font-style: normal;
  font-weight: 400;
  font-display: swap;   /* 与现有 serif 保持一致：先出回退字形，不闪白 */
  src: url('https://cdn.jsdmirror.cn/npm/@fontsource/noto-sans-sc@5.3.1/files/noto-sans-sc-chinese-simplified-400-normal.woff2') format('woff2');
}
/* 500 / 600 / 700 同构，仅替换 weight 与文件名 */
```

字体栈（组件里只用这一条，不允许各页面再写 `font-sans`）：

```
--nt-font: 'Folia Noto Sans SC', -apple-system, BlinkMacSystemFont,
           'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif;
```

⚠️ **关键**：webfont 未加载完时必须回落，且回落链**不能再依赖设备的 `sans-serif` 解析**
——真机已证明它会解析成衬线。上面这一串兜底里 `Roboto` / `Noto Sans` 都在，
即使 webfont 失败也不会退到衬线。

### 1.2 字阶（解决方向稿 §1.2）

六级，**行高跟字号档走，不跟组件走**：

| Token | 承担 | 字号 | 字重 | 行高 | 字距 | 数字 |
| --- | --- | --- | --- | --- | --- | --- |
| `--nt-type-display` | 页面标题、艺人名 | 24px | 700 | 32px | -0.3px | tabular |
| `--nt-type-title` | 区块标题、空状态标题 | 17px | 600 | 24px | -0.1px | tabular |
| `--nt-type-item` | 歌名、歌单名、艺人名 | 15px | 500 | 21px | 0 | tabular |
| `--nt-type-meta` | 歌手、时长、计数 | 13px | 400 | 18px | 0 | tabular |
| `--nt-type-label` | tab 标签、按钮文字、菜单项 | 12px | 500 | 16px | 0.2px | — |
| `--nt-type-caption` | 角标等极小字（下限） | 11px | 400 | 15px | 0 | tabular |

硬规则：

1. **字号下限 11px**，不再出现 10px；
2. **行高比值只有两个**：≥17px 用 1.33，其余用 1.18–1.38，
   杜绝现在 1.00 / 1.25 / 1.33 / 1.43 / 1.50 混用；
   → **`--nt-type-label` 的 12/16 直接修掉方向稿 §1.2 第 4 条那个 `10px/10px` 的裁切 bug**；
3. **时长、计数、序号一律 `font-variant-numeric: tabular-nums`**，
   修掉列表滚动时数字宽度跳动；
4. 字重只允许 `400 / 500 / 600 / 700`，**700 仅 display 一处使用**。

### 1.3 旧值 → 新值映射（改造对照表）

| 原（实测） | 新 | 出现在 |
| --- | --- | --- |
| 16px / 600 / 24px 页面标题 | **24px / 700 / 32px** | `NeteaseHeader` |
| 14px / 600 / 20px 区块标题 | **17px / 600 / 24px** | `NeteaseSectionTitle` |
| 13px / 400 卡标题 | **15px / 500 / 21px** | 歌单卡、快捷卡 |
| 12px / 500 / 16px 快捷卡标题 | **15px / 500 / 21px** | 快捷卡 |
| 11px / 10px / 13.75px 元信息 | **13px / 400 / 18px** | 计数、歌手、时长 |
| 10px / 10px tab 标签 | **12px / 500 / 16px** | `NeteaseTabBar` |

> 卡标题从 13 → 15 是本次最大的一处字号上移。原因：换成无衬线后，
> 13px 无衬线的笔画密度低于 13px 衬线，不上移会糊。
> 单卡行高因此增加约 7px，一屏从 8 行降到 7 行——**这是有意付出的代价**，
> 换来的是可读性，不要在实施时"优化"回 13px。

### 1.4 与桌面端的关系

`Folia Noto Serif SC` **保留不动**，它服务桌面端和歌词可视化。
两套字体按运行环境分流：安卓端 suite 显式挂 `--nt-font`，桌面端不受影响。

---

## 2. 色彩系统

### 2.1 保持主题派生，但加约束

`neteaseTheme.ts` 的核心设计（颜色全部从 `Theme` 契约派生、组件只引用变量名）
**是对的，保留**。本次只补三条**可校验的约束**，不改成硬编码色板——
否则 AI 生成主题、切浅色深色时会退回白斑。

### 2.2 中性阶：5 档 + 亮度差下限

| Token | 用途 | 约束 |
| --- | --- | --- |
| `--nt-bg` | 页面底 | 基准 |
| `--nt-surface` | 列表项、卡内底 | 与 bg 亮度差 **≥ 4%** |
| `--nt-elevated` | mini player、浮层、输入框 | 与 surface 亮度差 **≥ 6%** |
| `--nt-divider` | 分隔线、1px 边框 | 与相邻面亮度差 **≥ 10%** |
| `--nt-field` | 输入框底 | 与 surface 亮度差 **≥ 3%** |

> 现在三档只有 ~3% 差，实测肉眼不可见，卡片因此没有边界。
> 这是 §2.5「卡片需要发丝边框」的**根因**——先把色阶拉开，边框才立得住。

### 2.3 文字色：对比度下限（实测发现的问题在这）

以当前主题 `#f3f5f5` 底实测对比度：

| 用途 | 现状 | 实测对比度 | 判定 | 新下限 |
| --- | --- | --- | --- | --- |
| 正文 `#1b3433` | 12.10:1 | ✅ 远超 AA | ≥ 4.5:1 |
| 次要 `#467069` 实色 | 5.08:1 | ✅ 过 AA | ≥ 4.5:1 |
| **最弱 `rgba(70,112,105,.55)`** | **2.20:1** | ❌ **AA 不合格** | **≥ 4.5:1** |
| 强调 `#159666` 作大字/图标 | 3.44:1 | ⚠️ 仅够大字 | ≥ 3:1，且**禁止用于正文** |
| **`onAccent #1b3433` on `#159666`** | **3.52:1** | ❌ **按钮文字不合格** | **≥ 4.5:1** |

落地规则：

1. **`--nt-text-faint` 不再用 alpha**，改成预先算好的**实色**，
   取值保证 ≥ 4.5:1。现在 `0.55 / 0.6 / 0.85` 三种透明度表达同一语义，全部收掉；
2. **`--nt-on-accent` 按 `luminance(accent) > 0.55` 的旧二值判断不够**——
   实测当前主题落在 3.52:1。改为：先试深字，不达 4.5:1 就**自动压暗强调色本身**，
   而不是硬塞一个白字上去；
3. 强调色**只允许三处**：选中态、正在播放标记、主按钮填充。
   **标题与正文永不使用强调色**。

### 2.4 `placeholderTint()` 的硬边界

现在它同时返回 `backgroundColor` 和 `color`，实测导致
`rgb(2,2,1) / rgb(1,2,2) / rgb(2,1,2) / rgb(1,3,1)` 这类近黑色被当正文色使用。

**改为只返回 `backgroundColor`。** 文字色一律走 `--nt-text` 或 `--nt-text-muted`。
这是本次最干净的一处修复——把一个"装饰性色相"从"内容色"里彻底摘出去。

### 2.5 新增 `--nt-danger`

删除类操作需要危险色。当前只有 `NeteaseMenuAction.tone='danger'`，
没有对应色值。补一个，由主题派生或按底色明暗取红/浅红，同样走 4.5:1 下限。

---

## 3. 间距与栅格

### 3.1 4pt 基准，六档封顶

| Token | 值 | 用途 |
| --- | --- | --- |
| `--nt-space-1` | 4px | 图标与文字、chip 内间距 |
| `--nt-space-2` | 8px | 卡内元素纵向间距 |
| `--nt-space-3` | 12px | 卡内边距、栅格间距 |
| `--nt-space-4` | 16px | **屏幕左右边距**、列表项内边距 |
| `--nt-space-6` | 24px | 区块之间 |
| `--nt-space-8` | 32px | 页面顶部大留白 |

**超出这六档的值一律不允许。** 现在的 `pb-1.5`(6px)、`gap-2.5`(10px) 属于非法值。

### 3.2 屏幕边距锁 16（修左边缘错位）

实测同屏混用 `px-3`(12) 与 `px-4`(16)：

| 位置 | 现状 | 新 |
| --- | --- | --- |
| 歌单栅格 `px-4` | 16 ✅ | 16 |
| 快捷卡栅格 `px-4` | 16 ✅ | 16 |
| 区块标题 `px-4` | 16 ✅ | 16 |
| **顶部标题栏 `px-3`** | **12 ❌** | **16** |
| **搜索条 `px-3`** | **12 ❌** | **16** |
| **底部栏容器 `px-3`** | **12 ❌** | **16** |

### 3.3 栅格

- 列间距统一 **12px**（现在是 `gap-x-3`=12 与 `gap-y-4`=16 不成比例，两向都改 12）；
- 行间距统一 **16px**（内容块之间）；
- 两列宽度：`(361 - 16×2 - 12) / 2 = 158.5` → 由 grid 自动分，**不写死**。

### 3.4 触控区下限

- 列表行、tab 按钮最小可点 **44×44 CSS px**（Android 无障碍硬指标）。
- 现在 tab 可点区 50.6dp ✅ 合规，但字号提到 12px 后需复核图标+文字整体仍在区内。

---

## 4. 圆角与层级

### 4.1 圆角四档

| Token | 值 | 用途 |
| --- | --- | --- |
| `--nt-radius-sm` | 8px | 小元素、chip、缩略图 |
| `--nt-radius-md` | 12px | 卡片、列表项容器 |
| `--nt-radius-lg` | 16px | mini player、浮层、下拉菜单 |
| `--nt-radius-full` | 9999px | 圆形按钮、搜索框胶囊 |

收掉现在的 `6px`（只用了 1 处）与散落的 `rounded-full`。

### 4.2 层级三级（现在全站 0 处 `box-shadow`）

| 级别 | 用途 | 表达 |
| --- | --- | --- |
| **L0** | 页面内容、栅格卡片 | 无边框无投影，靠 `--nt-space-6` 分组 |
| **L1** | 列表项、输入框 | 1px `--nt-divider` 边框 + `--nt-radius-md` |
| **L2** | mini player、浮层、下拉菜单 | 1px 边框 + `--nt-radius-lg` + 投影 |

投影（浅色主题，底 `#f3f5f5`）：

```css
--nt-shadow-2: 0 2px 8px rgba(16, 32, 30, 0.10),
               0 1px 2px rgba(16, 32, 30, 0.06);
```

暗色主题改用黑色低透明 + 更小偏移，两套分开给，不共用。

### 4.3 底部区（只统一视觉，不改结构 — 已拍板）

保持 tab 栏与 mini player **两个独立区域、现有触控逻辑不变**，只统一三件事：

1. 共享一条 `--nt-divider` 分隔线（现在两者之间是一段空隙，没有分界）；
2. 圆角统一到 `--nt-radius-lg`，mini player 不再自带投影（避免与 tab 栏打架）；
3. 高度不动（tab 54px + 手势区 19.4px / mini ≈107px）。

---

## 5. 组件规格

`neteaseParts.tsx` 里 11 个共享零件逐个定稿。**发色一律走 CSS 变量，组件内不写死色值**（保持现有约定）。

### 5.1 `NeteaseShell`
页面外壳。补一条：挂 `--nt-font` 到根容器，让整套 suite 统一字体。
padding 收敛到 `--nt-space-4`。

### 5.2 `NeteaseHeader`（顶部标题栏）
| 项 | 值 |
| --- | --- |
| 最小高 | 52px → **56px**（24px 标题需要更多行高） |
| 左右内边距 | `px-3` → **16px** |
| 标题 | `--nt-type-display`（24/700/32） |
| 对齐 | 保留现有 `left` / `center` 两种 |

### 5.3 `NeteaseSearchBar`
| 项 | 值 |
| --- | --- |
| 左右外边距 | `px-3` → **16px** |
| 输入文字 | `--nt-type-item`（15/500/21） |
| 占位符 | `--nt-text-faint`，**实色**（现在 0.55 alpha，2.20:1 不合格） |
| 图标 | 15px → **18px**，色 `--nt-text-muted` |
| 容器 | `--nt-radius-full`，底 `--nt-field`，高 ≥ 44px |

### 5.4 `NeteaseSectionTitle`（区块标题 + 计数）
| 项 | 值 |
| --- | --- |
| 标题 | `--nt-type-title`（17/600/24） |
| 计数 | `--nt-type-meta`（13/400/18），色 `--nt-text-muted` |
| 间距 | `pt-4 pb-1.5` → **上 24 / 下 8**（`--nt-space-6` / `--nt-space-2`） |
| 标题与计数 | `gap-2` → **8px** |

> 现在计数有 11px 和 10px 两种写法，统一到 13px。

### 5.5 `NeteaseTabBar`
| 项 | 值 |
| --- | --- |
| 容器高 | **54px 不变** |
| 标签文字 | `text-[10px] leading-none` → **`--nt-type-label`**（12/500/16） |
| 图标 | 22px |
| 选中 | 色 `--nt-accent` |
| 未选中 | 色 `--nt-text-muted`（**实色**，不用 0.6 alpha） |
| 左右外边距 | `px-3` → **16px** |
| 分隔 | 顶部 1px `--nt-divider`（已有，确认取值） |

> ⚠️ 这是本次**唯一修 bug 级取值**的组件：`10px/10px` 行高等于字号，
> 「专辑」「推荐」等汉字和假名有溢出风险。改 12/16。

### 5.6 `NeteaseMiniPlayer`
| 项 | 值 |
| --- | --- |
| 高度 | ≈107px **不变** |
| 圆角 | `--nt-radius-lg` |
| 底色 | `--nt-elevated`（与 tab 栏同一档，两者同层） |
| 投影 | **去掉**，改 1px `--nt-divider`（见 §4.3） |
| 歌名 | `--nt-type-item`（15/500/21） |
| 歌手 | `--nt-type-meta`（13/400/18） |
| 封面 | 44px，圆角 `--nt-radius-sm`，保留 `placeholderTint` |
| 播放/队列按钮 | 触控区 ≥ 44×44，图标 20px |

### 5.7 `NeteasePlayButton`
| 项 | 值 |
| --- | --- |
| 尺寸 | 直径 56px，触控区 ≥ 56 |
| 底色 | `--nt-accent` |
| 前景 | `--nt-on-accent`，**按 §2.3 第 2 条保证 ≥ 4.5:1** |
| 圆角 | `--nt-radius-full` |

### 5.8 `NeteaseTrackIndex`（曲目序号）
| 项 | 值 |
| --- | --- |
| 字号 | → `--nt-type-meta`（13/400/18） |
| 数字 | `tabular-nums`（防跳动） |
| 色 | 未播放 `--nt-text-muted`；播放中 `--nt-accent` |

### 5.9 `NeteaseMoreMenu`（「⋯」）
| 项 | 值 |
| --- | --- |
| 触发按钮 | 触控区 ≥ 44×44，图标 18px |
| 菜单浮层 | L2 层级：`--nt-radius-lg` + `--nt-shadow-2` |
| 菜单项文字 | `--nt-type-label`（12/500/16） |
| 菜单项高度 | ≥ 44px |
| 危险项 | 用 §2.5 新增的 `--nt-danger` |

### 5.10 `NeteaseEmpty`（空状态）
| 项 | 值 |
| --- | --- |
| 主文案 | `--nt-type-title`（17/600/24） |
| 补充说明 | `--nt-type-meta` |
| 垂直位置 | 真居中（现在实测在约 1/4 高度处） |

### 5.11 `NeteaseCollapsible`
| 项 | 值 |
| --- | --- |
| 折叠头 | `--nt-type-item`（15/500/21） |
| 折叠箭头 | 16px，色 `--nt-text-muted` |
| 展开内容上间距 | 8px |

### 5.12 `NETEASE_STYLES`
清理非法间距值（`1.5` / `2.5` 等），全部换成 §3.1 的 token。

---

## 6. 落地映射

| 文件 | 改动 |
| --- | --- |
| `src/index.css` | 新增 `Folia Noto Sans SC` 的 4 个 `@font-face`（**不动现有 serif**） |
| `neteaseTheme.ts` | 加中性阶/对比度约束；`textFaint` 改实色；`onAccent` 提升算法；`placeholderTint` 去 `color`；新增 `danger` |
| `neteaseParts.tsx` | 11 个零件按 §5 改；挂 `--nt-font`；清 `NETEASE_STYLES` 非法值 |
| `NeteaseHome/Collection/Artist/Account.tsx` | 只替换 className 与取值，**不改结构与交互** |

**验收**：改完装机，同一台设备同一套主题下，
① 全站无衬线；② tab 标签无裁切；③ 时长滚动不跳动；
④ 最弱文字对比度 ≥ 4.5:1；⑤ 左边缘全线对齐 16px；⑥ 桌面端观感零变化。

---

## 7. 实施顺序建议

1. **字体**（§1.1）— 单点收益最大，先做，先看效果；
2. **字阶**（§1.2 + §1.3 映射）— 依赖字体落地后的实际观感再定稿；
3. **间距栅格**（§3）— 纯机械替换，风险最低；
4. **色彩约束**（§2）— 需要跑对比度校验；
5. **组件规格 + 层级**（§4 + §5）— 最后收口。
