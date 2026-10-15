import React from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import type { LibraryBackdropSnapshot, LibrarySuiteBackdrop, LibrarySuiteLayerTransition, LibrarySuiteTransitions } from '../../core/contracts/suite';
import { NEUTRAL_LIBRARY_BACKDROP } from '../../core/model/libraryBackdrop';
import { readReducedMotion, resolveReducedMotion, useMotionSettingsStore } from '../../../stores/useMotionSettingsStore';
import { NETEASE_MORPH_DURATION, NETEASE_MORPH_EASE, armNeteaseMorphBack, discardNeteaseMorphIfStale } from './neteaseMorph';

// src/library/suites/netease/neteaseLayerTransition.tsx
// 本文件现在只管两件事：
//   ① 集合层进出那一拍，首页层与集合层各自的淡入淡出（**给封面飞出当背景**，本身不出镜）；
//   ② 底部标签栏的 Win8 式平行推移（**至今仍然是货真价实的推移**，与 ① 无关）。
//
// 2026-10-15 改过一次：这里原来也是 Win8 平行推移（首页退 28% + 详情页从右推入）。
// 用户看完参考视频后改成「封面飞出」，平行推移只剩标签栏还在用。
// 但 `transitions.layer` 这个声明**不能删** —— 删了宿主会在导航那一刻把首页整个 visibility:hidden，
// 封面就变成凭空从屏幕中间长出来，参考视频里「首页还在原地被盖住」那一拍没有了。
// 所以这里保留声明、只把位移换成交叉淡入：首页原地淡出、集合层原地淡入，两层时长与飞行同源。

// 标签栏推移的时长与曲线（与封面飞出无关，各自独立）。
// 0.34s 是照 Win8 的手感定的：再短会像闪一下，再长就成 PPT 翻页了。
// 曲线 [0.1, 0.9, 0.2, 1] 起步快、收尾长 —— 页是有分量的东西，得「推开」再「落定」。
const SLIDE_DURATION = 0.34;
const SLIDE_EASE: [number, number, number, number] = [0.1, 0.9, 0.2, 1];

// 推移中进场的页面，前缘那道投影。**只有标签栏用**：封面飞出时集合层是原地淡入的，没有前缘。
const LEADING_SHADOW = '-16px 0px 34px rgba(0, 0, 0, 0.42)';

/**
 * 宿主那两层容器的状态表（契约形状，宿主直接吃）。
 *
 * 现在**没有任何位移**：首页 `homeFront` / `homeBehind` 的 x 都是 0，集合层同理。
 * 存在的意义只有一个 —— 声明它，宿主才会「推移期间不藏首页」，封面才有东西可盖。
 * 时长与曲线必须和 NeteaseCollectionMorph 的飞行取同一组常量
 * （NETEASE_MORPH_DURATION / _EASE）：差一点点就会看见封面还在飞、底下的两层已经换完了。
 */
export const neteaseLayerTransition: LibrarySuiteLayerTransition = {
    homeFront: { x: '0%', opacity: 1 },
    homeBehind: { x: '0%', opacity: 0 },
    enter: { x: '0%', opacity: 0 },
    idle: { x: '0%', opacity: 1 },
    exit: { x: '0%', opacity: 0 },
    duration: NETEASE_MORPH_DURATION,
    ease: NETEASE_MORPH_EASE,
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
    // 它露出来的那一整拍就是首页淡出的那一拍，时长必须与飞行一致，否则会看见底色「追」上来。
    enter: { duration: NETEASE_MORPH_DURATION, ease: NETEASE_MORPH_EASE },
    exit: { duration: NETEASE_MORPH_DURATION, ease: NETEASE_MORPH_EASE },
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
 *
 * ⛔ 这里**没有** Overlay：宿主的 `listLibrarySuiteOverlays()` 在模块加载时就把转场层收走了，
 * 那时本套的 surface 一个都还没加载。Overlay 由 entry.ts 直接挂到那个空壳上（见那里的说明）。
 */
export const neteaseTransitions: LibrarySuiteTransitions = {
    layer: neteaseLayerTransition,
    backdrop: neteaseBackdrop,
    /**
     * 压栈前：这次**不是**从首页卡片点开的（从搜索结果、歌手页里的专辑进来），
     * 就把上一次点歌单留下的记账丢掉，免得隔了很久返回时飞回一张不相干的卡。
     *
     * 判据是捕获阶段点击监听写下的「新鲜度」，而不是「有没有记账」——
     * 点返回时那次点击同样会把新鲜度降下来，但返回走的是 beforeBack、不走这里，所以不受影响。
     */
    beforePush: () => { discardNeteaseMorphIfStale(); },
    /**
     * 返回前的唯一一件事：量好返回腿（大图 → 那张卡片），交给转场层飞回去。
     *
     * 必须在**弹栈之前**量 —— 宿主是先清空导航 store 再让集合层退场的，而大图就在集合层里。
     * 卡片那端此时是 visibility:hidden：层没卸载、布局还在，getBoundingClientRect() 照样给真实几何。
     *
     * 量不到（大图没渲染出来、或这一层不是从首页卡片进来的）就返回 false，
     * 宿主照常弹栈、照常淡入淡出 —— 这一次没有飞行，但不会卡住。
     */
    beforeBack: () => { armNeteaseMorphBack(); },
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
    /** 真正滚动的是**内层**那个节点（外层还兼着裁切），滚动位置要挂到它上面。 */
    innerRef?: React.Ref<HTMLDivElement>;
    children: React.ReactNode;
}> = ({ slideKey, direction, reduced, className, innerRef, children }) => {
    if (reduced) {
        return <div ref={innerRef} className={className}>{children}</div>;
    }
    return (
        // custom 传给正在退场的那一页 —— 它的 props 是旧的，只有 AnimatePresence 上这份是新的。
        <AnimatePresence initial={false} custom={direction}>
            <motion.div
                key={slideKey}
                ref={innerRef}
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
