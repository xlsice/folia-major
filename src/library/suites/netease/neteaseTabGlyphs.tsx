import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';

// src/library/suites/netease/neteaseTabGlyphs.tsx
// 底部标签栏「选中态圆球」里那枚白色实心图标，以及它从点长出来的动画。
//
// 为什么不用 lucide 现有的图标：那一套是 **stroke**（描边）字形，选中态要的是**实心**白图标，
// 把描边图标直接 fill 会糊成一坨（指南针的圆环尤其明显，填完整个盘面变白饼）。
// 所以这里手绘 5 个 24×24 的实心字形，形状沿用原来那五个（指南针 / 硬盘 / 书库 / 服务器 / 用户），
// 看得出是什么，但不是描边画法。
//
// ⚠️ 生长动画有两个坑，都踩过：
//   1. **SVG 的 transform-origin 默认不是元素中心**。不显式给 `transform-box: fill-box` +
//      `transform-origin: center`，缩放会绕 viewBox 原点(0,0) 放大 —— 图标会朝左上角飞出去。
//   2. 图标是 24×24 画在 34px 的圆里，圆心必须与字形中心**严格重合**（都取 (12,12)），
//      否则旋转时图标会绕着一个偏心点甩，看起来是"乱转"而不是"在转"。

export type NeteaseTabGlyphId = 'compass' | 'local' | 'albums' | 'remote' | 'mine';

/** 圆球直径（CSS px）。标签栏高 54px，这个尺寸正好与原来「图标+文字」那叠的高度相当，不跳版。 */
export const TAB_PILL_SIZE = 34;

/** 平移时长。与下方生长动画的 delay 必须同源，否则会出现"还在滑就已经开始长"的错位。 */
export const TAB_PILL_SLIDE_S = 0.3;
/** 生长时长。用户明确不要匀速——曲线见 TAB_PILL_GROW_EASE。 */
const GROW_S = 0.42;
/** 旋转在生长进度到 80% 时起跳。 */
const ROTATE_AT = 0.8;
/** 顺时针两圈。弹簧的过冲会略超出这个值再弹回来，就是要的「转一点点再回弹到两圈」。 */
const ROTATE_TURNS = 720;

/** 生长曲线：起步快、收尾长。匀速会让图标像被拉扯，读起来很怪。 */
const TAB_PILL_GROW_EASE = [0.22, 0.9, 0.24, 1] as const;

/** 旋转用弹簧：damping 调到刚好过一次冲就收住，不要来回抖。 */
const ROTATE_SPRING = { type: 'spring' as const, stiffness: 150, damping: 16, mass: 1 };

/** SVG 缩放/旋转必须绕自身中心，否则会绕 viewBox 原点跑。 */
const CENTERED = { transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties;

// ── 字形 ───────────────────────────────────────────────────────────────
// 五个形状都按「实心但能认出」的标准画：实心块面 + 一两个挖孔（挖孔用 evenodd，
// 透出圆球的强调色，等于自带高光细节）。

/**
 * 指南针：外圈圆环 + 中间一枚菱形指针（菱形是平行四边形的特例，仍属「平行四边形」）。
 *
 * ⛔ 尺寸是试出来的，不是随手定的：第一版把环做成 r=8.7/stroke 2.6、指针拉到 ±6.2/半宽 1.5，
 * 结果在 19px 下环内负空间被指针占满，**整颗读成一个「禁止」符号（🚫）**，完全不像指南针。
 * 现在环壁只占 1.1 半径、指针尖端距环内壁还留 2.1 的空隙，19px 下才认得出是罗盘。
 */
const CompassGlyph = ({ delay, reduced }: GlyphMotionProps) => (
    <>
        <motion.g
            style={CENTERED}
            initial={reduced ? false : { scale: 0.02 }}
            animate={{ scale: 1 }}
            transition={reduced ? undefined : { duration: GROW_S, delay, ease: TAB_PILL_GROW_EASE }}
        >
            {/* 圆环：fill=none + 描边，视觉上就是实心的一圈白。 */}
            <circle cx={12} cy={12} r={9.2} fill="none" stroke="currentColor" strokeWidth={2.2} />
            {/* 指针：菱形，长轴沿对角线，中心恰在 (12,12) —— 缩放与旋转都绕它。 */}
            <motion.g
                style={CENTERED}
                initial={reduced ? false : { rotate: 0 }}
                animate={{ rotate: ROTATE_TURNS }}
                transition={reduced ? undefined : { ...ROTATE_SPRING, delay: delay + GROW_S * ROTATE_AT }}
            >
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" fill="currentColor" />
            </motion.g>
        </motion.g>
    </>
);

/** 硬盘：实心圆角块 + 右侧一个挖孔当指示灯。 */
const LocalGlyph = ({ delay, reduced }: GlyphMotionProps) => (
    <motion.g
        style={CENTERED}
        initial={reduced ? false : { scale: 0.02, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? undefined : { duration: GROW_S, delay, ease: TAB_PILL_GROW_EASE }}
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            fill="currentColor"
            d="M5.6 7.2 H18.4 A2.6 2.6 0 0 1 21 9.8 V14.2 A2.6 2.6 0 0 1 18.4 16.8 H5.6 A2.6 2.6 0 0 1 3 14.2 V9.8 A2.6 2.6 0 0 1 5.6 7.2 Z
               M18.9 12 A1.5 1.5 0 1 0 15.9 12 A1.5 1.5 0 1 0 18.9 12 Z"
        />
    </motion.g>
);

/** 书库 / 专辑：一根竖的书脊 + 两层横隔板，实心块面。 */
const AlbumsGlyph = ({ delay, reduced }: GlyphMotionProps) => (
    <motion.g
        style={CENTERED}
        initial={reduced ? false : { scale: 0.02, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? undefined : { duration: GROW_S, delay, ease: TAB_PILL_GROW_EASE }}
    >
        <rect x={3.4} y={4.6} width={2.8} height={14.8} rx={1.2} fill="currentColor" />
        <rect x={7.8} y={4.6} width={12.8} height={5.2} rx={1.2} fill="currentColor" />
        <rect x={7.8} y={11.4} width={12.8} height={5.2} rx={1.2} fill="currentColor" />
    </motion.g>
);

/** 服务器：两层堆叠的实心块，每层左侧挖一个指示灯孔。 */
const RemoteGlyph = ({ delay, reduced }: GlyphMotionProps) => (
    <motion.g
        style={CENTERED}
        initial={reduced ? false : { scale: 0.02, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? undefined : { duration: GROW_S, delay, ease: TAB_PILL_GROW_EASE }}
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            fill="currentColor"
            d="M5.4 5.4 H18.6 A2 2 0 0 1 20.6 7.4 V9 A2 2 0 0 1 18.6 11 H5.4 A2 2 0 0 1 3.4 9 V7.4 A2 2 0 0 1 5.4 5.4 Z
               M7.7 8.2 A1.1 1.1 0 1 0 5.5 8.2 A1.1 1.1 0 1 0 7.7 8.2 Z
               M5.4 13 H18.6 A2 2 0 0 1 20.6 15 V16.6 A2 2 0 0 1 18.6 18.6 H5.4 A2 2 0 0 1 3.4 16.6 V15 A2 2 0 0 1 5.4 13 Z
               M7.7 15.8 A1.1 1.1 0 1 0 5.5 15.8 A1.1 1.1 0 1 0 7.7 15.8 Z"
        />
    </motion.g>
);

/** 用户：实心头 + 实心肩线（肩线底部切平，这是通用 person 图标的画法）。 */
const MineGlyph = ({ delay, reduced }: GlyphMotionProps) => (
    <motion.g
        style={CENTERED}
        initial={reduced ? false : { scale: 0.02, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduced ? undefined : { duration: GROW_S, delay, ease: TAB_PILL_GROW_EASE }}
    >
        <circle cx={12} cy={7.6} r={4.2} fill="currentColor" />
        <path
            fill="currentColor"
            d="M12 13.2 C17.1 13.2 21 16.1 21 20.8 H3 C3 16.1 6.9 13.2 12 13.2 Z"
        />
    </motion.g>
);

type GlyphMotionProps = {
    /** 距离圆球停稳之后多久开始生长（秒）。传 0 即立刻长。 */
    delay: number;
    /** 「降低动态效果」生效时不播生长，直接呈现最终形态。 */
    reduced: boolean;
};

const GLYPHS: Record<NeteaseTabGlyphId, React.FC<GlyphMotionProps>> = {
    compass: CompassGlyph,
    local: LocalGlyph,
    albums: AlbumsGlyph,
    remote: RemoteGlyph,
    mine: MineGlyph,
};

/** 生长动画只作用在这一层包裹上，key 随选中项变化以保证每次切换都重播。 */
const GLYPH_BOX_VARIANTS: Variants = {
    hidden: { scale: 0.9 },
    shown: { scale: 1 },
};

/**
 * 选中态圆球里那枚图标。
 *
 * 「先平移到位，到了才开始生长」的实现就是给生长加一个等于平移时长的 delay：
 * 圆球滑动的 0.3s 里图标完全不动，停稳的那一刻才起长。**没有用「等平移结束再挂载组件」那套** ——
 * 那样要额外一份状态去同步平移与生长的结束时机，两者一旦对不上就会出现「球还在滑图标已经在长」，
 * 而 delay 是同一个常数派生的，天然不可能错位。
 */
export const NeteaseTabGlyph: React.FC<{ glyph: NeteaseTabGlyphId }> = ({ glyph }) => {
    const reduced = useReducedMotionFor('uiMicroMotion');
    const Glyph = GLYPHS[glyph] ?? CompassGlyph;
    const svgProps = {
        viewBox: '0 0 24 24',
        width: TAB_PILL_SIZE - 15,
        height: TAB_PILL_SIZE - 15,
        'aria-hidden': true as const,
    };
    if (reduced) {
        return (
            <svg {...svgProps}>
                <Glyph delay={0} reduced />
            </svg>
        );
    }
    return (
        <motion.svg
            {...svgProps}
            style={CENTERED}
            initial="hidden"
            animate="shown"
            variants={GLYPH_BOX_VARIANTS}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        >
            <Glyph delay={TAB_PILL_SLIDE_S} reduced={false} />
        </motion.svg>
    );
};
