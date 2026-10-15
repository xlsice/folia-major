// src/library/suites/netease/NeteaseCloudText.tsx
// 「浮云」文字效果 —— 一段文字逐词柔和浮出来。
//
// 需求原话（用户 2026-10-15）：「每块独立缩放/微旋这些特性都不要，要不然影响可读性：
// 我想要浮云的字出现的效果，而非它的排版。」
//
// 所以这里**刻意不做**云阶那套排版：不切块、不错位、每块不独立缩放、不微旋、不画引导线。
//
// ⛔ 但「出现的效果」本身要复刻到位 —— 第一版只做了「淡入 + 上浮」就收工，
// 被用户一眼看穿少了三样（它们全都属于出场效果，不是排版，不该跟着排版一起砍）：
//
// | 云阶（partita） | 出处 | 这里 |
// | --- | --- | --- |
// | 模糊出场 blur(10px) → none | glowWordVariants.ts:55 | 按字号缩放，见档位表 |
// | 弹性入场 spring 200/20 | glowWordVariants.ts:27 | 阻尼压到 13，见下方 CLOUD_SPRING |
// | 颜色追踪 baseColor → activeColor | partitaLayout.ts:94 | 统一追色，见 .nt-cloud-word |
//
// 两个必须守住的工程约束（都踩过）：
//
// ⛔ 1. **省略号要还能用**。`text-overflow: ellipsis` 只对「块容器里直接是行内内容」生效。
//    词必须是 `inline-block`（不是 flex 子项），且不能带会造成溢出的位移。
//    否则卡片标题会从「很长的歌单名…」退化成硬裁。
// ⛔ 2. **空格要跟着词走**。见 neteaseCloudReveal 的说明。

import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { NETEASE_CLOUD_TIERS, tokenizeCloudText, type NeteaseCloudTier } from './neteaseCloudReveal';

export type { NeteaseCloudTier };

/**
 * 弹性入场。
 *
 * 云阶原版是 `stiffness: 200, damping: 20`（阻尼比 ζ ≈ 0.71，超调约 4.6%）。
 * **照抄到这里是看不出弹性的** —— 它那边字高 40~88px、位移 40px，4.6% 落下来接近 2px；
 * 这里位移只有 3~9px，同样的超调只有 0.3px，肉眼等于没有。
 *
 * 所以这里用 framer 的 `duration` / `bounce` 形式（与 stiffness/damping 等价，
 * 但两个旋钮都好调）：`duration` 直接沿用档位表里那一档的时长，
 * `bounce` 就是「弹性」本身 —— 0 不回弹，1 回弹到两倍。
 * 0.32 大致对应上面的 ζ≈0.49，在 3~9px 的位移上读得出「弹了一下」，又不至于晃。
 */
const CLOUD_BOUNCE = 0.32;

/**
 * 落位时的统一缩放起点。
 *
 * ⚠️ 所有词**同一个值**，没有逐词方差 —— 用户否掉的是「每块独立缩放」，
 * 不是「落位时收一下」。这条是「弹性」看得见的另一半：光靠 y 位移的弹簧太含蓄。
 */
const CLOUD_SETTLE_SCALE = 0.94;

/** 淡入单独走短 tween（原版是 0.1s）：先能看清字，再由模糊和颜色慢慢收干净。 */
const CLOUD_FADE = 0.14;

export interface NeteaseCloudTextProps {
    text: string;
    tier?: NeteaseCloudTier;
    /** 整体延迟（秒）。列表里通常要晚一点，等卡片先落位。 */
    delay?: number;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * 一段逐词浮现的文字。
 *
 * `className` / `style` 由调用方直接挂在本组件的根元素上（不要在外面再包一层）——
 * 截断类的 `truncate` / `line-clamp` 只有挂在这一层才生效。
 *
 * 动效走 `uiMicroMotion` 那个面 —— 它是界面微交互，和歌词可视化无关。
 * 关掉时渲染成普通 `<span>`，不引入任何 motion 元素。
 */
export const NeteaseCloudText: React.FC<NeteaseCloudTextProps> = ({
    text,
    tier = 'item',
    delay = 0,
    className,
    style,
}) => {
    const motionEnabled = !useReducedMotionFor('uiMicroMotion');
    const spec = NETEASE_CLOUD_TIERS[tier];
    const words = React.useMemo(() => tokenizeCloudText(text), [text]);

    if (!motionEnabled || !text) {
        return <span className={className} style={style}>{text}</span>;
    }

    return (
        <span className={className} style={style}>
            {words.map((word, index) => {
                // blur = 0 的档位整条模糊动画都不挂 —— 不是把半径设成 0，
                // 而是连动画都不存在：动画中的 filter 会把每个词顶成独立合成层。
                const blurless = spec.blur <= 0;
                return (
                    <motion.span
                        key={`${index}-${word}`}
                        className={`inline-block nt-cloud-word${blurless ? ' nt-cloud-word--no-blur' : ''}`}
                        // 模糊半径与两段时长只认这张表，单一事实来源。写成变量而不是写进 CSS class，
                        // 是为了档位表能直接被单测断言 —— 散在两处迟早会对不上。
                        style={{
                            '--nt-cloud-delay': `${delay + index * spec.stagger}s`,
                            ...(blurless ? null : {
                                '--nt-cloud-blur': `${spec.blur}px`,
                                '--nt-cloud-blur-dur': `${spec.blurDuration}s`,
                            }),
                            '--nt-cloud-tint-dur': `${spec.tintDuration}s`,
                        } as React.CSSProperties}
                        initial={{ opacity: 0, y: spec.rise, scale: CLOUD_SETTLE_SCALE }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{
                            type: 'spring',
                            duration: spec.duration,
                            bounce: CLOUD_BOUNCE,
                            // 与 CSS 那两条 animation-delay 用同一个值，两边才真的同步起跑。
                            delay: delay + index * spec.stagger,
                            // 淡入单独走短 tween（原版 0.1s）：先能看清字，再由模糊和颜色慢慢收干净。
                            opacity: { duration: CLOUD_FADE, ease: 'linear' },
                        }}
                    >
                        {word}
                    </motion.span>
                );
            })}
        </span>
    );
};
