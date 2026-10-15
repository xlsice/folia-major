// src/library/suites/netease/neteaseSession.ts
// 跨「卸载 / 重挂」要活下来的那几份界面状态。
//
// 为什么需要这一份：进歌词（#player）时，宿主会把整个 Home 子树卸载
// （App.tsx 的 isHomeFullyHidden：buildHomeSurfacePresentation 判定不保留，
// 350ms 后 Home.tsx 直接 return null）。于是本 suite 的组件状态一起没了：
//   - 底部标签栏回到「推荐」（看起来就是「回到首页重新加载」）
//   - 歌单列表的滚动位置归零
//   - 「我的」那一屏滚到哪儿也不记得
// 用户 2026-10-15 报的「从歌词界面返回上一级，预期回到『我的』」就是这一条。
//
// ⛔ 不能靠改 App.tsx / Home.tsx 解决：那是上游的省内存设计（整个首页墙连同
// visualizer 一起拆掉），动它影响的不止 netease 一套。模块级状态刚好绕过卸载：
// React 组件没了，这个模块还在。

import React from 'react';

/** 首页当前标签。存字符串而不是 HomeTabId，避免这里 import 组件所在模块的类型。 */
let homeTab = 'discover';

/** 各标签的滚动位置。键是标签名。 */
const homeScroll = new Map<string, number>();

/** 各集合的列表滚动位置。键是集合 id。 */
const collectionScroll = new Map<string, number>();

export const getNeteaseHomeTab = (): string => homeTab;
export const setNeteaseHomeTab = (tab: string): void => { homeTab = tab; };

export const getNeteaseHomeScrollTop = (tab: string): number => homeScroll.get(tab) ?? 0;
export const setNeteaseHomeScrollTop = (tab: string, top: number): void => {
    if (top > 0) homeScroll.set(tab, top);
    else homeScroll.delete(tab);
};

export const getNeteaseCollectionScrollTop = (key: string): number => collectionScroll.get(key) ?? 0;
export const setNeteaseCollectionScrollTop = (key: string, top: number): void => {
    if (top > 0) collectionScroll.set(key, top);
    else collectionScroll.delete(key);
};

/**
 * 页面入场（卡片波浪飞入 + 顶栏下滑）**一个会话只播一次**。
 *
 * ⛔ 必须跨卸载记住：首页每切一次标签 `NeteasePageSlide` 就换 key、卡片整批重挂载，
 * 用组件 state 的话每次切标签都会重播一遍 0.95s 的入场，用户会以为界面卡住了。
 * 而且从歌词回来时首页也是重挂的 —— 那次不该再播（用户要的是「回到刚才的位置」）。
 */
let entrancePlayed = false;
export const hasPlayedNeteaseEntrance = (): boolean => entrancePlayed;
export const markNeteaseEntrancePlayed = (): void => { entrancePlayed = true; };

/**
 * 入场的起飞时刻表。键是歌单 id，值是该落位的**绝对**时刻（performance.now() 口径）。
 *
 * ⛔ 为什么不能挂在组件上：CollectionCard 是写在 NeteaseHome 函数体里的，
 * 每次父组件重渲染都会产生一个新的组件类型，React 按类型对账 ⇒ 整墙卡片被卸载重挂
 * （首页数据还在落，实测入场期间重挂了 4 次）。计时器跟着组件走就会一次次被重置，
 * 真机看到的是 scale「起飞 → 退回 0.62 → 再起飞」的锯齿。
 *
 * ✅ 记成绝对时刻之后：重挂的那张卡一看时间已过就直接落在终点（`hasFeteNeteaseTakeoff`），
 * 还没到起飞时刻的那张按剩余时间续上倒计时。波浪的先后顺序因此锚在一个时钟上，
 * 不受中途几次重挂影响。会话结束（页面重开）时模块重新求值，表自然清空。
 */
const neteaseTakeoffAt = new Map<string, number>();

/** 这张卡在本会话里是不是已经起飞过了。渲染期就能判断，不用等 effect。 */
export const hasFiredNeteaseTakeoff = (id: string): boolean => {
    const at = neteaseTakeoffAt.get(id);
    return at !== undefined && performance.now() >= at;
};

/** 排程（或取回已排好的）起飞时刻。同一个 id 永远只排一次。 */
export const scheduleNeteaseTakeoff = (id: string, delaySeconds: number): number => {
    const existing = neteaseTakeoffAt.get(id);
    if (existing !== undefined) return existing;
    const at = performance.now() + delaySeconds * 1000;
    neteaseTakeoffAt.set(id, at);
    return at;
};

/**
 * 把滚动位置挂到元素上：卸载前记一次，挂载后还一次。
 *
 * ⚠️ 还位置必须在**内容已经有高度之后**：歌单详情是异步加载曲目的，
 * 挂载那一帧列表还是空的，`scrollTop` 设上去会被浏览器夹回 0。
 *
 * ⛔ ResizeObserver 在这里没用（踩过）：它盯的是元素的 **border box**，
 * 而滚动容器是 `flex-1`、高度由布局定死，内容变高时它自己的盒子一点没变 —— 回调根本不触发。
 * 盯子节点也不行：挂载那一刻子节点可能还没建出来，之后再加的又观察不到。
 * 所以用**有上限的 rAF 重试**：只要内容还撑不到目标位置就每帧再还一次，
 * 撑到了（或跑满 150 帧 ≈ 2.5s）就停。既覆盖「曲目异步加载」，也覆盖「封面图陆续解码变高」。
 *
 * 用 `requestAnimationFrame` 而不是同步赋值，是躲开「DOM 还没提交」的那一帧；
 * 卸载前的最后一次赋值走同步路径，保证记下的一定是真实位置。
 */
export const useRestoredScrollTop = (
    // React 19 的 RefObject<T> 本身就含 null，写成 RefObject<HTMLElement> 会和
    // useRef<HTMLDivElement>(null) 推出的类型对不上。
    ref: React.RefObject<HTMLElement | null>,
    key: string | null,
    read: (k: string) => number,
    write: (k: string, top: number) => void,
): void => {
    React.useEffect(() => {
        const el = ref.current;
        // key 还没有（描述符还没到）就先不挂，之后 key 变了这个 effect 会重跑。
        if (!el || !key) return undefined;
        // ⛔ 当前位置必须在**滚动过程中**攒，卸载那一刻不能现读（真机实测踩到）：
        // 宿主是先给首页层加 `display: none` 再让 Home 返回 null，两者同一个 commit，
        // 于是 cleanup 里读到的 scrollTop 已经被浏览器夹成 0 —— 记下来的是 0，回来当然还是 0。
        let lastTop = read(key);
        const remember = () => { lastTop = el.scrollTop; };
        let raf = 0;
        let tries = 0;
        const restore = () => {
            const target = read(key);
            if (target <= 0) return true;
            if (Math.abs(el.scrollTop - target) > 1) {
                el.scrollTop = target;
                remember();
            }
            // 内容已经够高、位置也真的落上去了，就算成。
            return el.scrollHeight - el.clientHeight >= target - 1 && Math.abs(el.scrollTop - target) <= 1;
        };
        const tick = () => {
            tries += 1;
            const done = restore();
            if (!done && tries < 150) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        el.addEventListener('scroll', remember, { passive: true });
        return () => {
            // 只写攒下来的值，不在这里现读 —— 见上面那条。
            write(key, lastTop);
            cancelAnimationFrame(raf);
            el.removeEventListener('scroll', remember);
        };
    }, [ref, key, read, write]);
};
