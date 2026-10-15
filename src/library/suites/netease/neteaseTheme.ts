import type { Theme } from '../../../types';

// src/library/suites/netease/neteaseTheme.ts
// netease suite 的配色层：整套 UI 的颜色只从这里出，组件里不写死任何色值。
//
// 为什么要有这一层：Folia 的主题是双份的（DualTheme = light + dark），来源有三条——
// 内置预设、按音乐生成、AI 生成——每次换主题/切浅色深色，UI 都必须跟着变。
// 如果组件里写 `bg-white`、`#ff2e2e` 这种硬编码，用户切到暗色主题时这个 suite 会变成一块白斑。
// 所以这里从当前生效的 Theme 推出一整套 CSS 变量，组件只引用变量名。
//
// 取色规则（全部来自 Theme 契约的字段，不引入外部配色）：
//   - 文字主色 ← theme.primaryColor、次要 ← theme.secondaryColor
//   - 强调色/高亮 ← theme.accentColor（按音乐/AI 生成时这两个就是歌里的颜色）
//   - 底色 ← theme.backgroundColor
//   - 分隔线、浮层、按下态这些 Theme 没直接给的，从上面几个颜色按透明度推导，
//     这样任何主题下都保持同一套明暗关系，不会出现「暗色主题里冒出白底浮层」。

type RGB = readonly [number, number, number];

// ---------------------------------------------------------------------------
// 颜色工具层
//
// 这里刻意分「两种亮度」，因为它们回答的是两个不同的问题，别混用：
//
// 1. relativeLuminance —— WCAG 规定的对比度算法。**算对比度只能用这个**，
//    感知亮度会算出偏松的结果，达不到无障碍标准。
// 2. perceivedLightness —— 判断中性阶相邻两档「肉眼看不看得见」。用 Rec.601 luma
//    是因为 WCAG 亮度在近白区被压得很扁（0.91 与 0.96 只差 0.05），拿它判
//    「卡片有没有边界」会把肉眼几乎看不出的一档差判成合格。
//
// 改造前这里只有一个 `luminance()`，用途是「判断底色深浅好决定压深字还是浅字」，
// 精度只够做二值判断。规格 §2.2 / §2.3 要求的是**可校验的下限**，
// 必须能算对比度、能算两档之间的差距，才能把约束写进代码而不是写进注释里。
// ---------------------------------------------------------------------------

/** #rgb / #rrggbb / rgb() / rgba() → RGB。解析不了返回 null（调用方自己决定退回策略）。 */
const parseColor = (color: string): RGB | null => {
    const value = color.trim();
    const hex = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value);
    if (hex) {
        const raw = hex[1];
        const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return [r, g, b].some(Number.isNaN) ? null : [r, g, b] as RGB;
    }
    const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
    if (rgbMatch) {
        const r = Number(rgbMatch[1]);
        const g = Number(rgbMatch[2]);
        const b = Number(rgbMatch[3]);
        return [r, g, b].some(Number.isNaN) ? null : [r, g, b] as RGB;
    }
    return null;
};

/** 十六进制色 → rgba() 字符串。解析不了就退回中性灰，宁可淡一点也不要整块错色。 */
const toRgba = (hex: string, alpha: number): string => {
    const rgb = parseColor(hex) ?? [128, 128, 128];
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
};

/**
 * 带 alpha 的叠底混合：把 top 以 alpha 叠在 bottom 上，得到眼睛真正看到的实色。
 * 所有中性阶色值都是叠在 bg 上的 rgba，**必须先拍平再谈对比度**——
 * 直接拿 rgba 去比 WCAG 对比度是错的。
 */
const flattenAlpha = (top: RGB, alpha: number, bottom: RGB): RGB => [
    Math.round(top[0] * alpha + bottom[0] * (1 - alpha)),
    Math.round(top[1] * alpha + bottom[1] * (1 - alpha)),
    Math.round(top[2] * alpha + bottom[2] * (1 - alpha)),
];

/** 把 color 叠在 bg 上，返回实色。解析不了就按中性灰处理。 */
const over = (color: string, bg: RGB): RGB => {
    const top = parseColor(color);
    if (!top) return [128, 128, 128];
    const alphaMatch = /rgba\([^)]*?,\s*([\d.]+)\s*\)/i.exec(color.trim());
    const alpha = alphaMatch ? Math.min(1, Math.max(0, Number(alphaMatch[1]))) : 1;
    return alpha >= 1 ? top : flattenAlpha(top, alpha, bg);
};

const toHex = (rgb: RGB): string =>
    '#' + rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');

/** WCAG 相对亮度（sRGB 反伽马）。算对比度必须用这个。 */
const relativeLuminance = (rgb: RGB): number => {
    const channel = (raw: number): number => {
        const c = raw / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
};

/** WCAG 对比度，1..21。对称，两个参数可以随便换位置。 */
const contrastRatio = (a: RGB, b: RGB): number => {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** 感知亮度（Rec.601 luma），0..1。只用来判断两档面「看不看得见」。 */
const perceivedLightness = (rgb: RGB): number =>
    (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;

/**
 * 两色感知亮度的**绝对差**（0..1，即「几个百分点」）。
 *
 * 用绝对差而不是「相对较大者的百分比」是刻意的：在近黑区相对百分比会爆炸
 * （#09090b 叠 4% 白就已经差 50%+），在近白区又会压扁，
 * 两种极端下都判不出真实的视觉差。绝对差在明暗两端表现一致。
 */
const lightnessGap = (a: RGB, b: RGB): number => Math.abs(perceivedLightness(a) - perceivedLightness(b));

const mix = (from: RGB, to: RGB, t: number): RGB => [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
];

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];

/** 量化到 8bit——最终写进 CSS 的就是整数通道，二分时必须按量化后的值判定。 */
const quantize = (rgb: RGB): RGB => [
    Math.round(Math.min(255, Math.max(0, rgb[0]))),
    Math.round(Math.min(255, Math.max(0, rgb[1]))),
    Math.round(Math.min(255, Math.max(0, rgb[2]))),
];

/**
 * 把 from 往「对比更强的那一端」混，返回**刚好**达到 target 对比度的最小混合量。
 *
 * 两个容易写错的点，这里都处理了：
 * 1. **方向必须由 bg 决定，不能由调用方指定**。写成固定方向时遇到过：
 *    浅色底 + 深色模式标记，会把文字朝白色混——越混越不达标，直接塌成白底白字。
 * 2. **判定要按量化后的 8bit 值**，否则四舍五入会把刚够 4.5 的值压到 4.4966。
 *
 * 二分而不是一步到位，是为了让色相尽量留住：只混到刚够，不多压。
 */
const ensureContrast = (from: RGB, bg: RGB, target: number, toward?: RGB): RGB => {
    if (contrastRatio(from, bg) >= target) return from;
    const to = toward ?? (contrastRatio(BLACK, bg) >= contrastRatio(WHITE, bg) ? BLACK : WHITE);
    if (contrastRatio(to, bg) < target) return to;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 18; i += 1) {
        const mid = (lo + hi) / 2;
        if (contrastRatio(quantize(mix(from, to, mid)), bg) >= target) hi = mid;
        else lo = mid;
    }
    return mix(from, to, hi);
};

/**
 * `ensureContrast` 的反向操作：把 from 往 bg 的方向混，直到对比度**降到** target 为止。
 *
 * 用来做「最弱的一档文字」——下限之上要**尽量弱**，否则三档文字会挤在一起。
 * 只靠 ensureContrast 提亮 textMuted 是不够的：它只保证 ≥6:1，
 * 而 textFaint 若也从提亮后的 muted 派生就会拿到同一个值，两档完全同色。
 */
const capContrast = (from: RGB, bg: RGB, target: number): RGB => {
    // 先保底：capContrast 只会往下压，原始色本身若已经低于下限，压完只会更差。
    // （实测纯白主题的 secondaryColor #808080 对白底只有 3.95:1，直接放行就成了不合格）
    const base = ensureContrast(from, bg, target);
    if (contrastRatio(base, bg) <= target) return base;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 18; i += 1) {
        const mid = (lo + hi) / 2;
        if (contrastRatio(quantize(mix(base, bg, mid)), bg) >= target) lo = mid;
        else hi = mid;
    }
    // 二分收敛的是实数，落盘却是 8bit，取整会把刚够的值压到下限之下
    // （实测 4.4999 / 3.9494）。按**真正会写出去的值**回退校正。
    let t = lo;
    for (let i = 0; i < 12 && contrastRatio(quantize(mix(base, bg, t)), bg) < target; i += 1) {
        t = Math.max(0, t - 0.005);
    }
    return quantize(mix(base, bg, t));
};

/**
 * 叠在 bg 上的半透明层：调 alpha 直到它与 bg（或 against）的感知亮度差达到 minGap。
 *
 * 刻度只动 alpha 不动色相，所以换主题时中性阶永远保持同一套明暗关系，
 * 不会因为某个主题底色偏黄偏蓝就跑偏。
 */
/**
 * 叠在 bg 上的纯色层：找**最小** alpha，使它与 against 的感知亮度差达到 minGap。
 *
 * ⚠️ 这里必须无条件二分，**不能**因为「纯 base 的差距已经够大」就提前返回纯色。
 * 改造时踩过：surface 的 base 是纯黑，纯黑对任何底色的差距都远大于 0.04，
 * 提前返回直接把 surface 变成了纯黑底。最小 alpha 才是「刚好拉开一档」。
 * base 本身也够不着 minGap 时二分收敛到 alpha=1，即尽力而为。
 *
 * 方向由 base 相对 against 的位置隐含决定，不再传 sign——
 * 传 sign 就会出现「浅色主题把 elevated 往黑里压」这种方向性错误。
 */
const tintAtGap = (bg: RGB, against: RGB, base: RGB, minGap: number): string => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 18; i += 1) {
        const mid = (lo + hi) / 2;
        if (lightnessGap(flattenAlpha(base, mid, bg), against) >= minGap) hi = mid;
        else lo = mid;
    }
    // ⚠️ 校正必须用**四舍五入之后**的 alpha 去判定，不能用二分收敛的实数：
    // 实数 0.10435 判定通过，写出去是 0.104，通道取整后差距掉到 0.098（不够 0.10）。
    // 先定到落盘精度，再用落盘值判定，差多少补多少。
    let alpha = Number(hi.toFixed(3));
    for (let i = 0; i < 12 && lightnessGap(quantize(flattenAlpha(base, alpha, bg)), against) < minGap; i += 1) {
        alpha = Math.min(1, Number((alpha + 0.005).toFixed(3)));
    }
    return toRgba(toHex(base), alpha);
};

/** 浮层遮罩底下那层该压多深：底色亮（浅色主题）就用黑的低透明压暗，底色暗就用白的低透明提亮。 */
const overlayTint = (_backgroundColor: string, isDaylight: boolean): string =>
    isDaylight ? toRgba('#000000', 0.28) : toRgba('#ffffff', 0.06);

/** 这套 suite 用到的全部颜色。键名与 CSS 变量名一一对应。 */
export type NeteasePalette = {
    /** 页面底色 */
    bg: string;
    /** 比底色略高一层（卡片、列表项底）。**约束**：与 bg 感知亮度差 ≥ 0.04 */
    surface: string;
    /** 浮层（弹窗、下拉菜单）底。**约束**：与 surface 差 ≥ 0.06 */
    elevated: string;
    /** 主文字。**约束**：对 bg 对比度 ≥ 7:1 */
    text: string;
    /** 次要文字（歌手名、时长、计数）。**约束**：≥ 6:1 */
    textMuted: string;
    /** 更弱的文字（占位符、禁用）。**约束**：≥ 4.5:1 */
    textFaint: string;
    /** 分隔线。**约束**：与 bg 感知亮度差 ≥ 0.10 */
    divider: string;
    /** 强调色填充：主按钮底、播放条。**约束**：无（填充色，另配 onAccent） */
    accent: string;
    /** 强调色上的文字色。**约束**：对 accent ≥ 4.5:1 */
    onAccent: string;
    /** 强调色当**文字**用时的版本（tab 选中态、正在播放序号）。**约束**：对 bg ≥ 4.5:1 */
    accentText: string;
    /** 危险色（删除一类操作）。**约束**：对所在面 ≥ 4.5:1 */
    danger: string;
    /** 按下/悬停的浅层底色 */
    hover: string;
    /** 搜索框、输入框底。**约束**：与 surface 差 ≥ 0.03 */
    field: string;
    /** 遮罩 */
    scrim: string;
};

// 三档文字的对比度下限取 7 / 6 / 4.5，而不是规格初稿的「都 ≥ 4.5」：
// 如果三档都只保 4.5，在某些主题里 textMuted 落到 4.6、textFaint 落到 4.5，
// **两档会几乎看不出区别**，层级就白做了。下限之间必须留够间距。
const TEXT_FLOOR = { text: 7, muted: 6, faint: 4.5 } as const;

/**
 * 强调色上的文字色。
 *
 * 规格初稿写的是「不达 4.5:1 就自动压暗强调色本身」。实现时发现这一步**永远不会触发**：
 * 对任意底色，纯黑与纯白里必有一个 ≥ 4.58:1 —— 设 x = L+0.05 ∈ [0.05, 1.05]，
 * f(x) = x/0.05 + 1.05/x 在 x=0.2291 处取最小 9.17，两项各 4.58。
 * 也就是说**只要往纯黑或纯白方向混就一定达标**，没必要动主题的品牌色。
 * 所以这里改成：先朝偏好端（浅色主题压深字、深色主题压浅字）混到刚够，
 * 保留主题色调；偏好端真的走不通才换纯色。
 */
const buildOnAccent = (accentRgb: RGB, isDaylight: boolean): string => {
    const preferred: RGB = isDaylight ? [28, 25, 23] : [244, 244, 245];
    const extreme: RGB = isDaylight ? [0, 0, 0] : [255, 255, 255];
    const tuned = ensureContrast(preferred, accentRgb, 4.5, extreme);
    if (contrastRatio(tuned, accentRgb) >= 4.5) return toHex(tuned);
    const other: RGB = isDaylight ? [255, 255, 255] : [0, 0, 0];
    return toHex(contrastRatio(other, accentRgb) >= 4.5 ? other : extreme);
};

/** 从当前生效的主题推出一整套配色。theme / isDaylight 来自 surface props。 */
export const buildNeteasePalette = (theme: Theme, isDaylight: boolean): NeteasePalette => {
    const background = theme?.backgroundColor || (isDaylight ? '#f5f5f4' : '#09090b');
    const textRaw = theme?.primaryColor || (isDaylight ? '#1c1917' : '#f4f4f5');
    const mutedRaw = theme?.secondaryColor || (isDaylight ? '#44403c' : '#71717a');
    const accentRaw = theme?.accentColor || (isDaylight ? '#ea580c' : '#f4f4f5');

    const bg = over(background, [255, 255, 255]);
    const accentRgb = over(accentRaw, bg);

    // 中性阶的「压深还是提亮」由**实测底色亮度**决定，不看 isDaylight。
    // Folia 的 DualTheme 正常会让两者一致，但一旦不一致（AI 生成的主题只给一套色、
    // 或用户手动只改了背景），按模式选方向就会把浅底上的面压成黑、把文字提成白。
    // 参照面链是 bg → surface → elevated/field，所以必须按这个顺序算。
    const tone: RGB = perceivedLightness(bg) > 0.5 ? BLACK : WHITE;

    const surface = tintAtGap(bg, bg, tone, 0.04);
    const surfaceRgb = over(surface, bg);

    // elevated 在浅色主题下直接给纯白：白已经是最亮的一档，往下混只会更接近 bg。
    // 这时 6% 的要求受限于「白到 bg 之间还剩多少余量」，够不到就够不到，
    // 剩下的靠第五步的发丝边框补（规格 §4）。
    const elevated = perceivedLightness(bg) > 0.5 ? toHex(WHITE) : tintAtGap(bg, surfaceRgb, WHITE, 0.06);

    const divider = tintAtGap(bg, bg, tone, 0.10);
    const field = tintAtGap(bg, surfaceRgb, tone, 0.03);
    const hover = tintAtGap(bg, bg, tone, 0.05);

    // ⭐ 文字色的对比度要对着**它可能踩到的最暗那层**算，不是对着 --nt-bg。
    // 改造时踩过：只在 bg 上校验通过（4.55:1），但「33 首」这种角标其实压在
    // --nt-surface 上，浅色主题里 surface 比 bg 更暗，深色文字压上去掉到 4.1:1。
    // 对比度对底色是单调的——**底越暗，深色文字越难读；浅色文字同理**，
    // 所以 {bg, surface, field} 里最暗的那个就是两种文字的最坏情况。
    const fieldRgb = over(field, bg);
    const refBg: RGB = perceivedLightness(fieldRgb) < perceivedLightness(surfaceRgb) ? fieldRgb
        : perceivedLightness(surfaceRgb) < perceivedLightness(bg) ? surfaceRgb
            : bg;

    // 三档文字：全部拍成实色，不再用 alpha 表达「更弱」——
    // alpha 叠在 bg 上之后实际对比度是不可控的（实测踩到 2.20:1）。
    // 方向交给 ensureContrast 自己按底色判断，这里不再指定。
    const text = toHex(ensureContrast(over(textRaw, bg), refBg, TEXT_FLOOR.text));
    const textMuted = toHex(ensureContrast(over(mutedRaw, bg), refBg, TEXT_FLOOR.muted));
    // textFaint 要的是「**刚好**卡在下限」而不是「继承 muted」，所以用 capContrast
    // 反向往底色混。两档必须各自贴着自己的下限，否则层级会塌成一档。
    const textFaint = toHex(capContrast(over(mutedRaw, bg), refBg, TEXT_FLOOR.faint));

    // 强调色当文字用（tab 选中态 12px、正在播放序号 13px）时另取一个版本。
    // 这两处是**小字**，规格 §2.3 给强调色定的 3:1 只够大字，直接拿来用会不合格。
    const accentText = toHex(ensureContrast(accentRgb, refBg, 4.5));

    // 危险色：原本是组件里写死的 #e5484d，对浅底只有 3.58:1（不合格）。
    const dangerBase: RGB = isDaylight ? [197, 48, 54] : [255, 138, 143];
    const danger = toHex(ensureContrast(dangerBase, refBg, 4.5));

    return {
        bg: background,
        surface,
        elevated,
        text,
        textMuted,
        textFaint,
        divider,
        accent: accentRaw,
        onAccent: buildOnAccent(accentRgb, isDaylight),
        accentText,
        danger,
        hover,
        field,
        scrim: overlayTint(background, isDaylight),
    };
};

/**
 * 是不是安卓壳内运行。
 *
 * 沿用本仓库既有的「两道闸」写法（见 utils/nativeMediaSession.ts 与
 * navigation/back/nativeBackBridge.ts）：构建期 VITE_ANDROID_BUILD 标过，
 * 运行期再问 Capacitor。少任何一道都会出问题——只有运行期判定时，网页版
 * 浏览器里访问也会被当成安卓。
 *
 * 只用来决定**要不要给 suite 挂 --nt-font**：这次的重设计针对安卓端，
 * 桌面端的 netease suite 观感必须保持不变。
 */
export const isAndroidShell = (): boolean => {
    const env = import.meta.env as Record<string, unknown> | undefined;
    if (!env?.VITE_ANDROID_BUILD) return false;
    try {
        const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
        return cap?.isNativePlatform?.() === true;
    } catch {
        return false;
    }
};

/**
 * 铺一层 CSS 变量到 style 上（挂在 suite 的最外层容器）。 */
export const paletteToCssVars = (palette: NeteasePalette): React.CSSProperties =>
    ({
        // 安卓端 suite 的字体栈。自带 webfont 优先（@font-face 见 src/index.css）。
        //
        // 兜底链里**必须显式写出带 CJK 字形的字体**（Noto Sans CJK SC / Noto Sans SC）。
        // 原因是 2026-10-15 真机实测踩过的坑：原来只写 `… , sans-serif`，而整副栈里
        // 没有一个字体带中文——Roboto 有但无 CJK 字形，中文全部落到设备对 `sans-serif`
        // 的通用回退，那台一加 Ace 3 把它解析成了 Noto Serif CJK，整屏变宋体。
        // 显式点名之后，即使 webfont 加载失败（断网 / CDN 不可达），也不会再退到衬线。
        //
        // 注意：变量本身任何环境都定义，但**只有安卓端才真的用**（见 isAndroidShell 与
        // NeteaseShell 里的 fontFamily 开关）。桌面端的 netease suite 保持原样不动。
        '--nt-font': "'Folia Noto Sans SC', 'Noto Sans CJK SC', 'Noto Sans SC', Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        // 间距刻度（4pt 基准 + 一个半档发丝位）。
        // Tailwind 的 p-1 / p-2 / p-3 / p-4 / p-6 正好对应 4 / 8 / 12 / 16 / 24，
        // **className 里的间距必须吸附到这张表**，不允许再出现 1.5 / 2.5 / 3.5 / 5
        // 这些 Tailwind 默认档——它们换算出来是 6 / 10 / 14 / 20 px，全都不在刻度上。
        // 改造前实测：全 suite 有 27 处这类非法值，现已清零。
        '--nt-space-hair': '2px',    // 发丝微调：图标与文字的极窄间距、清除键内衬
        '--nt-space-1': '4px',       // 图标与文字、chip 内间距
        '--nt-space-2': '8px',       // 卡内元素纵向间距
        '--nt-space-3': '12px',      // 卡内边距、栅格列间距
        '--nt-space-4': '16px',      // **屏幕左右边距**、列表项内边距
        '--nt-space-6': '24px',      // 区块之间、弹窗内边距
        '--nt-space-8': '32px',      // 页面顶部大留白
        '--nt-bg': palette.bg,
        '--nt-surface': palette.surface,
        '--nt-elevated': palette.elevated,
        '--nt-text': palette.text,
        '--nt-text-muted': palette.textMuted,
        '--nt-text-faint': palette.textFaint,
        '--nt-divider': palette.divider,
        '--nt-accent': palette.accent,
        '--nt-on-accent': palette.onAccent,
        '--nt-accent-text': palette.accentText,
        '--nt-danger': palette.danger,
        '--nt-hover': palette.hover,
        '--nt-field': palette.field,
        '--nt-scrim': palette.scrim,
    }) as React.CSSProperties;

/**
 * 封面占位色：没有封面时用歌名算一个稳定的色相，而不是统一灰块。
 * 同一首歌每次都拿到同一个色相（按 id/名字散列），刷新不跳色。
 *
 * ⛔ **只产出背景**。改造前这里同时返回 `color`，而那个 `color` 的明度由色相散列
 * 决定，实测在真机上产出过 `rgb(2,2,1) / rgb(1,2,2) / rgb(2,1,2) / rgb(1,3,1)`
 * 这类近黑色，被组件当正文色直接用——用户看不到歌名了。
 * 文字色一律走 `--nt-text` / `--nt-text-muted`：色相是装饰，不该管内容色。
 */
export const placeholderTint = (seed: string, isDaylight: boolean): React.CSSProperties => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) % 360;
    }
    const hue = hash;
    const alpha = isDaylight ? 0.14 : 0.22;
    return {
        backgroundColor: `hsla(${hue}, 42%, ${isDaylight ? 62 : 42}%, ${alpha})`,
    };
};