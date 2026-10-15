// src/library/suites/netease/NeteaseCloudText.tsx
// 「浮云」文字效果 —— 一段文字逐词柔和浮出来。
//
// 需求原话（用户 2026-10-15）：「每块独立缩放/微旋这些特性都不要，要不然影响可读性：
// 我想要浮云的字出现的效果，而非它的排版。」
//
// 所以这里**刻意不做**云阶那套排版：不切块、不错位、每块不独立缩放、不微旋、不画引导线。
// 保留的只有一件事 —— 逐词依次浮现，像一片云从下面托着字浮上来。
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

/** Material 3 的 emphasized decelerate：起步柔和、落点干净，浮起来之后停得稳。 */
const CLOUD_EASE: [number, number, number, number] = [0.2, 0, 0, 1];

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
            {words.map((word, index) => (
                <motion.span
                    key={`${index}-${word}`}
                    className="inline-block"
                    initial={{ opacity: 0, y: spec.rise }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: spec.duration,
                        ease: CLOUD_EASE,
                        delay: delay + index * spec.stagger,
                    }}
                >
                    {word}
                </motion.span>
            ))}
        </span>
    );
};
