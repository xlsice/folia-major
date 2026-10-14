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
//   - 分隔线、浮层、按下态这些 Theme 没直接给的，从上��几个颜色按透明度推导，
//     这样任何主题下都保持同一套明暗关系，不会出现「暗色主题里冒出白底浮层」。

/** 十六进制色 → rgba() 字符串。解析不了就退回中性灰，宁可淡一点也不要整块错色。 */
const toRgba = (hex: string, alpha: number): string => {
    const value = hex.trim().replace('#', '');
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(value)) {
        return `rgba(128, 128, 128, ${alpha})`;
    }
    const full = value.length === 3
        ? value.split('').map(c => c + c).join('')
        : value;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) {
        return `rgba(128, 128, 128, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** 相对的亮度（sRGB 简化公式，够用来判断底色深浅）。 */
const luminance = (hex: string): number => {
    const value = hex.trim().replace('#', '');
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(value)) {
        return 0.5;
    }
    const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
    const channel = (raw: number): number => {
        const c = raw / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const r = channel(parseInt(full.slice(0, 2), 16));
    const g = channel(parseInt(full.slice(2, 4), 16));
    const b = channel(parseInt(full.slice(4, 6), 16));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * 浮层遮罩底下那层该压多深：底色亮（浅色主题）就用黑的低透明压暗，
 * 底色暗就用白的低透明提亮——两种主题下都保证浮层比正文突出。
 */
const overlayTint = (backgroundColor: string, isDaylight: boolean): string =>
    isDaylight ? toRgba('#000000', 0.28) : toRgba('#ffffff', 0.06);

/** 这套 suite 用到的全部颜色。键名与 CSS 变量名一一对应。 */
export type NeteasePalette = {
    /** 页面底色 */
    bg: string;
    /** 比底色略高一层（卡片、列表项底） */
    surface: string;
    /** 浮层（弹窗、下拉菜单）底 */
    elevated: string;
    /** 主文字 */
    text: string;
    /** 次要文字（歌手名、时长、计数） */
    textMuted: string;
    /** 更弱的文字（占位符、禁用） */
    textFaint: string;
    /** 分隔线 */
    divider: string;
    /** 强调色：高亮当前项、播放中标记、主按钮 */
    accent: string;
    /** 强调色上的文字色（保证对比度） */
    onAccent: string;
    /** 按下/悬停的浅层底色 */
    hover: string;
    /** 搜索框、输入框底 */
    field: string;
    /** 遮罩 */
    scrim: string;
};

/** 从当前生效的主题推出一整套配色。theme / isDaylight 来自 surface props。 */
export const buildNeteasePalette = (theme: Theme, isDaylight: boolean): NeteasePalette => {
    const background = theme?.backgroundColor || (isDaylight ? '#f5f5f4' : '#09090b');
    const text = theme?.primaryColor || (isDaylight ? '#1c1917' : '#f4f4f5');
    const muted = theme?.secondaryColor || (isDaylight ? '#44403c' : '#71717a');
    const accent = theme?.accentColor || (isDaylight ? '#ea580c' : '#f4f4f5');

    // accent 是否够亮决定它上面该压深字还是浅字：亮底压深字，暗底压浅字。
    const onAccent = luminance(accent) > 0.55 ? (isDaylight ? '#1c1917' : '#09090b') : '#ffffff';

    return {
        bg: background,
        surface: isDaylight ? toRgba('#000000', 0.03) : toRgba('#ffffff', 0.04),
        elevated: isDaylight ? '#ffffff' : toRgba('#ffffff', 0.08),
        text,
        textMuted: muted,
        textFaint: toRgba(muted, 0.55),
        divider: isDaylight ? toRgba('#000000', 0.08) : toRgba('#ffffff', 0.10),
        accent,
        onAccent,
        hover: isDaylight ? toRgba('#000000', 0.05) : toRgba('#ffffff', 0.07),
        field: isDaylight ? toRgba('#000000', 0.05) : toRgba('#ffffff', 0.06),
        scrim: overlayTint(background, isDaylight),
    };
};

/** 铺一层 CSS 变量到 style 上（挂在 suite 的最外层容器）。 */
export const paletteToCssVars = (palette: NeteasePalette): React.CSSProperties =>
    ({
        '--nt-bg': palette.bg,
        '--nt-surface': palette.surface,
        '--nt-elevated': palette.elevated,
        '--nt-text': palette.text,
        '--nt-text-muted': palette.textMuted,
        '--nt-text-faint': palette.textFaint,
        '--nt-divider': palette.divider,
        '--nt-accent': palette.accent,
        '--nt-on-accent': palette.onAccent,
        '--nt-hover': palette.hover,
        '--nt-field': palette.field,
        '--nt-scrim': palette.scrim,
    }) as React.CSSProperties;

/**
 * 封面占位色：没有封面时用歌名算一个稳定的色相，而不是统一灰块。
 * 同一首歌每次都拿到同一个色相（按 id/名字散列），刷新不跳色。
 */
export const placeholderTint = (seed: string, isDaylight: boolean): React.CSSProperties => {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hash = (hash * 31 + seed.charCodeAt(i)) % 360;
    }
    const hue = hash;
    const alpha = isDaylight ? 0.14 : 0.22;
    const fg = isDaylight ? 0.5 : 0.75;
    return {
        backgroundColor: `hsla(${hue}, 42%, ${isDaylight ? 62 : 42}%, ${alpha})`,
        color: `hsla(${hue}, 55%, ${fg}%, 1)`,
    };
};