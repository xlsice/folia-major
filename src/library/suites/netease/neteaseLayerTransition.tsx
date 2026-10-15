import React from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import type { LibraryBackdropSnapshot, LibrarySuiteBackdrop, LibrarySuiteLayerTransition, LibrarySuiteTransitions } from '../../core/contracts/suite';
import { NEUTRAL_LIBRARY_BACKDROP } from '../../core/model/libraryBackdrop';
import { readReducedMotion, resolveReducedMotion, useMotionSettingsStore } from '../../../stores/useMotionSettingsStore';

// src/library/suites/netease/neteaseLayerTransition.tsx
// 本套的「Win8 式平行推移」：点开歌单卡片 → 详情页从右侧推入、首页向左退一段并压暗；返回时完全镜像。
//
// 为什么是**整层推移**而不是 grid 的移形换影：移形换影靠一张合成层把封面从首页卡片飞到 hero，
// 手法华丽但那是 grid 的隐喻。这套要的是 Metro 那种「一页退一页进」的物理直觉 ——
// 两个真实容器同时沿 X 轴平移，靠位移本身交代层级。所以走契约里的 `transitions.layer`，
// 让宿主把首页容器和集合容器交给本套的位移参数，而不是本套自己再画一层。
//
// 时长 0.34s 是照 Win8 的手感定的：再短会像闪一下，再长就成 PPT 翻页了。
// 曲线 [0.1, 0.9, 0.2, 1] 起步快、收尾长 —— 页是有分量的东西，得「推开」再「落定」。
const SLIDE_DURATION = 0.34;
const SLIDE_EASE: [number, number, number, number] = [0.1, 0.9, 0.2, 1];

// 推移中进场的页面，前缘那道投影。没有它两页就是两块贴在一起平移，读不出谁压着谁。
const LEADING_SHADOW = '-16px 0px 34px rgba(0, 0, 0, 0.42)';

/**
 * 宿主那两层容器的位移表（契约形状，宿主直接吃）。
 *
 * homeBehind 只退 28% 而不是整屏退出：新页是不透明的，会从右往左把它一点点盖住，
 * 两页始终首尾相接 —— 这才是「平行推移」而不是「交叉淡入」。旧页同步压暗，
 * 是 Metro 那个年代区分层级的第二个信号（第一个是位移）。
 */
export const neteaseLayerTransition: LibrarySuiteLayerTransition = {
    homeFront: { x: '0%', opacity: 1 },
    homeBehind: { x: '-28%', opacity: 0.4 },
    enter: { x: '100%', boxShadow: LEADING_SHADOW },
    idle: { x: '0%', boxShadow: '0px 0px 0px rgba(0, 0, 0, 0)' },
    exit: { x: '100%', boxShadow: LEADING_SHADOW },
    duration: SLIDE_DURATION,
    ease: SLIDE_EASE,
};

// src/library/suites/netease/neteaseLayerTransition.tsx（降级闸门）
// 「降低动态效果」的唯一入口，和 grid 的 gridBackdrop 是同一套写法：
// suite 自己解析动效设置，宿主只订阅已解析结果，不知道设置名。
//
// enabled=false 时宿主那一行 `activeTransitions = backdrop.enabled ? transitions : undefined`
// 会把整个 transitions 丢掉 —— 于是 layer 也没了，本套退回宿主原本的硬切 + 中性底板。
// 也就是说**只降这一个面就够**，不需要宿主再为推移单开一道判断。

/** 降级时连同本套的推移一起关掉：底板回到中性淡入淡出，enabled=false 会顺带摘掉整层推移。 */
const REDUCED_NETEASE_BACKDROP: LibraryBackdropSnapshot = { ...NEUTRAL_LIBRARY_BACKDROP, enabled: false };

const NETEASE_BACKDROP: LibraryBackdropSnapshot = {
    enabled: true,
    // 底板此刻已经沉到首页层之下（宿主为声明了 layer 的 suite 改的层叠顺序），
    // 推移时只在旧页退出去的那一条里露面，时长必须跟推移一致，否则会看见底色"追"上来。
    enter: { duration: SLIDE_DURATION, ease: SLIDE_EASE },
    exit: { duration: SLIDE_DURATION * 0.8, ease: SLIDE_EASE },
};

export const neteaseBackdrop: LibrarySuiteBackdrop = {
    getSnapshot: () => (readReducedMotion('collectionMorph') ? REDUCED_NETEASE_BACKDROP : NETEASE_BACKDROP),
    subscribe: (listener) => useMotionSettingsStore.subscribe((state, previous) => {
        if (resolveReducedMotion(state, 'collectionMorph') !== resolveReducedMotion(previous, 'collectionMorph')) listener();
    }),
};

/**
 * entry.ts 要挂在 manifest 上的那份转场声明。
 *
 * 它是 entry.ts 里那个空壳对象的**内容**：entry 不能静态 import 本模块（registry eager glob 扫所有 entry），
 * 所以由四个 surface 的 lazy loader 在 resolve 时 Object.assign 过去，manifest 上的引用自始至终是同一个对象。
 */
export const neteaseTransitions: LibrarySuiteTransitions = {
    layer: neteaseLayerTransition,
    backdrop: neteaseBackdrop,
};

// src/library/suites/netease/neteaseLayerTransition.tsx（首页标签栏）
// 底部标签栏切页走同一套语汇：几何、时长、曲线、投影全部复用上面那份，
// 只是方向随标签在栏里的位置算出来 —— 点右边的标签就往左翻，点左边的往右翻。

/** 变体函数而不是固定对象：退场那一页拿到的是**当前**方向，不是它自己被卸载前残留的方向。 */
const TAB_SLIDE_VARIANTS: Variants = {
    enter: (direction: number) => ({
        x: direction > 0 ? '100%' : '-100%',
        boxShadow: LEADING_SHADOW,
    }),
    idle: { x: '0%', boxShadow: '0px 0px 0px rgba(0, 0, 0, 0)' },
    exit: (direction: number) => ({
        x: direction > 0 ? '-100%' : '100%',
        boxShadow: direction > 0 ? '16px 0px 34px rgba(0, 0, 0, 0.42)' : LEADING_SHADOW,
        opacity: 0.4,
    }),
};

/**
 * 一页内容在两个 tab 之间做推移。
 *
 * 必须**两个同时在 DOM 里**：退场那一页靠 AnimatePresence 保留到动画结束，
 * 所以它必须是直接子节点且带 key。滚动条跟着换页一起走 —— 新页从自己的初始位置开始滚。
 *
 * 降级时退化成普通 div（不挂 AnimatePresence、不留双页），此时同一时刻只有一页存在，
 * 与改动前的条件渲染完全一致。
 */
export const NeteasePageSlide: React.FC<{
    /** 换页标识。变了就推移，等于 tab id 本身。 */
    slideKey: string;
    /** +1 = 往右翻（下一页从右侧进），-1 = 往左翻。 */
    direction: 1 | -1;
    /** 「降低动态效果」对本套生效时为 true，直接换页不播。 */
    reduced: boolean;
    className?: string;
    children: React.ReactNode;
}> = ({ slideKey, direction, reduced, className, children }) => {
    if (reduced) {
        return <div className={className}>{children}</div>;
    }
    return (
        // custom 传给正在退场的那一页 —— 它的 props 是旧的，只有 AnimatePresence 上这份是新的。
        <AnimatePresence initial={false} custom={direction}>
            <motion.div
                key={slideKey}
                className={className}
                custom={direction}
                initial="enter"
                animate="idle"
                exit="exit"
                variants={TAB_SLIDE_VARIANTS}
                transition={{ duration: SLIDE_DURATION, ease: SLIDE_EASE }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
};
