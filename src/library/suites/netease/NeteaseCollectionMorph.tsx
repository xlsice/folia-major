import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
    NETEASE_FLYER_ATTR,
    NETEASE_MORPH_DURATION,
    NETEASE_MORPH_EASE,
    NETEASE_MORPH_RADIUS,
    armNeteaseMorphOpen,
    consumeNeteaseMorphFresh,
    getNeteaseMorphOpen,
    getNeteaseMorphSnapshot,
    markNeteaseMorphNotOpen,
    resetNeteaseMorph,
    setNeteaseMorphFlying,
    subscribeNeteaseMorph,
    takeNeteaseMorphBack,
    type NeteaseMorphLeg,
    type NeteaseMorphRect,
} from './neteaseMorph';

// src/library/suites/netease/NeteaseCollectionMorph.tsx
// 「封面飞出」：点开歌单时，那张封面从卡片原位一路涨到详情页顶部的大图；返回时原路飞回。
//
// 与 grid 的 CollectionMorphOverlay 的关系：**只借思路，不借代码**。grid 那套是 780 行、
// 弹簧驱动、带快速快进 / 看门狗 / 嵌套回飞 / 卡片散开，而且靠 data-grid3d-index 这类属性
// 硬绑在网格的 DOM 上。这里要的是「一张封面飞过去」这一件事，判据不同：
//   - 落点是**固定几何**（满屏宽的正方形贴屏幕顶），不需要等详情页把数据加载完；
//   - 两端都是正方形，所以一次均匀 scale 不会把图拉变形 —— 不必像 grid 那样分「框 / 图 / 标题」三件套；
//   - 曲线是**定值**的一段 easing（用户点名要的缓动曲线），不是弹簧：起飞要立刻响应点击，
//     弹簧的预热会让第一帧有明显的迟滞。
//
// ⛔ 降级：`enabled=false` 时（宿主按「降低动态效果」的 collectionMorph 面算出来）整层不挂捕获、
// 也不领任何记账，转场完全不出现 —— 而不是缩短。宿主那一行 `activeTransitions = backdrop.enabled ? …`
// 同时也会把 layer 摘掉，于是那一屏退回硬切，两边一致。

/**
 * 落点：满屏宽的正方形，贴屏幕顶。
 *
 * ⛔ 这是**算出来的**，不是量的 —— 而且必须算，不能等大图挂上来再量。
 * 集合 surface 是 React.lazy：会话里第一次点开歌单时那个 chunk 还在下载，真机等它挂载实测到
 * 冷启动要 410ms，这段时间首页已经在淡出而封面还没起飞 —— 半截动画。
 * 落点是定值（见 NeteaseCollection 里 hero 的 marginTop: -insets.top 与壳的 paddingTop 恰好抵消，
 * 任何设备上落点都在 y=0），所以点击那一刻就能起飞，surface 什么时候挂上都对得上。
 *
 * 也不去量已经挂上的大图：真机上两者逐帧量下来完全相同（见 docs/dev/CHANGELOG-RELEASE.md），
 * 而多一次 `getBoundingClientRect()` 是渲染期的强制重排，恰好发生在导航最忙的那一帧上。
 */
const landingRect = (): NeteaseMorphRect => {
    const width = window.innerWidth;
    return { left: 0, top: 0, width, height: width };
};

/** 飞行结束后再多等这么久就强制收场（毫秒）。 */
const SETTLE_WATCHDOG_MS = 260;

/** 合成层的 z-index：要压过集合 surface 自己的 z-[110]（见 neteaseParts 的 NeteaseShell）。 */
const LAYER_Z = 200;

/** 把一段位移+缩放写成 `transform`。两端都是正方形，均匀缩放不产生形变。 */
const transformOf = (rect: NeteaseMorphRect, base: NeteaseMorphRect): string => {
    const scale = base.width > 0 ? rect.width / base.width : 1;
    return `translate(${rect.left - base.left}px, ${rect.top - base.top}px) scale(${scale})`;
};

/** 起飞腿：记账里那张卡片的封面 → 算出来的落点。记不住就没有这一腿。 */
const openLeg = (): NeteaseMorphLeg | null => {
    const open = getNeteaseMorphOpen();
    return open ? { from: open.rect, to: landingRect(), coverUrl: open.coverUrl } : null;
};

export const NeteaseCollectionMorph: React.FC<{ enabled: boolean }> = ({ enabled }) => {
    const [flight, setFlight] = React.useState<{ leg: NeteaseMorphLeg; base: NeteaseMorphRect } | null>(null);
    // 记账版本号：订阅它就能在 armNeteaseMorphBack 写入新腿时重新渲染。
    const snapshot = React.useSyncExternalStore(subscribeNeteaseMorph, getNeteaseMorphSnapshot, getNeteaseMorphSnapshot);
    /** 正在飞。用来挡住「飞行途中又来一次记账变化」造成的重复起飞。 */
    const flyingRef = React.useRef(false);
    /** 已经为哪个版本号做过起飞判定。保证一次记账变化只起飞一次。 */
    const consumedRevisionRef = React.useRef(-1);
    /** 当前在飞的是哪个集合。只在渲染期写，由 effect 发给详情页。 */
    const flyingKeyRef = React.useRef<string | null>(null);

    /**
     * 一段飞行结束（落位）。
     *
     * ⛔ 这里**不能**把整份记账清掉：`key` / `cardRect` / `coverUrl` 是返回那一腿的起点，
     * 落位时清掉的话，`beforeBack` 量不到任何东西，返回就只剩一次淡出（真机实测踩到）。
     * 记账由下一次卡片点击覆盖，或压栈时判定为无关入口时（`beforePush`）、转场被关掉时复位。
     *
     * ⛔ 也不能只靠 framer 的 onAnimationComplete：leg 被换掉时上一段动画是**被打断**的，
     * 它的 onAnimationComplete 不会触发，`flyingRef` 就永久停在 true —— 之后每一次点击都被
     * 「正在飞行」挡掉，封面飞出再也不出现（真机实测踩到：返回一次之后连开都开不成了）。
     * 所以每段飞行都配一个定时器兜底（见下面那个 effect）。
     */
    const settle = React.useCallback(() => {
        flyingRef.current = false;
        flyingKeyRef.current = null;
        // ⛔ **必须把记账里的 flyingKey 也清掉**，大图是靠它决定隐不隐藏的
        // （NeteaseCollection 里 `heroHidden = flyingKey === 本歌单`）。
        // 只清 ref 只让飞行层自己消失，大图永远停在 opacity: 0 ——
        // 症状就是「打开歌单后详情页顶部一片空白，封面不见了」（真机实测踩到）。
        //
        // ⛔ 清之前先 consumeNeteaseMorphFresh：setNeteaseMorphFlying 会推进版本号，
        // 而此刻记账还在。若 fresh 还是 true，渲染期的起飞判定会看到「版本号变了 +
        // 账还在 + fresh 为真」就**再飞一次** —— 再落位、再推进、再起飞，
        // 转场层把自己锁死在循环里（下面那个 effect 的注释里踩过一次同样的坑）。
        // 起飞时已经 consume 过一次，这里是第二道保险。
        consumeNeteaseMorphFresh();
        setNeteaseMorphFlying(null);
        setFlight(null);
    }, []);

    // ── 起飞判定放在**渲染期**，不是 useEffect ────────────────────────────
    // ⛔ 这是实测调出来的：放 useEffect 里，store 变化要「effect 跑 → setState → 再渲染 → 再 commit」
    // 才画得出飞行层，真机上按下到封面开始动之间量到 **74ms** 的死等（550ms 的动画，13% 的空白），
    // 而且这段死等正好压在导航最忙的一帧上。挪到渲染期后同一版量到 63ms。
    //
    // 只认「这一次记账变化」：判据是版本号有没有被消费过，而不是「有没有记账」——
    // 记账要留到返回时用，而落位之后随便一次重渲染都会看到它，只看有没有记账必然误触发。
    //
    // ⛔ 起飞方向另外要过两道闸，少一道就会在**点歌 / 硬件返回**这类动作上凭空飞一次：
    //   fresh   —— 记账必须是「这一次点击」刚写下的。上一页留下的记账在歌单详情页里依然完好，
    //             点一首歌也会推进版本号，只看「有没有记账」就会在点歌时起飞。
    //   closing —— 这一轮是「回去」。硬件返回键不产生点击事件，新鲜度不会被降掉，
    //             此时若大图量不到、账又还在，没有这道闸就会朝前再飞一次。
    if (enabled && !flyingRef.current && consumedRevisionRef.current !== snapshot.revision) {
        consumedRevisionRef.current = snapshot.revision;
        const back = takeNeteaseMorphBack();
        const leg = back ?? (snapshot.fresh && !snapshot.closing ? openLeg() : null);
        if (leg) {
            flyingRef.current = true;
            // 只把 key 记进 ref，**不在这里通知**：渲染期改外部 store 会惊动 React。
            // 通知交给下面那个 effect（起飞 / 落位各一次）。
            flyingKeyRef.current = snapshot.key;
            // 渲染期 setState 是 React 认可的「由 props/state 推导出的 state」写法：
            // 同一次 commit 内就会再渲染一次并提交，不会多等一帧。
            setFlight({ leg, base: leg.from });
        }
    }

    /**
     * 起飞 / 落位时通知详情页藏起大图。
     *
     * ⛔ 不藏的话同屏会有**两份封面**：飞行的这份从小到大在动，详情页那张满屏宽的一挂上就
     * 纹丝不动 —— 看着就是「有一份停在原地」。大图等飞行落定再现身，那时两者像素级重合，
     * 直接换掉看不出破绽。
     */
    React.useEffect(() => {
        if (!flight) return;
        // 先把「新鲜度」用掉，再通知详情页藏起大图。两件事都只在这个 effect 里做，
        // 因为在渲染期改 store 会惊动 React。
        //
        // ⛔ consumeNeteaseMorphFresh 不能省：落位时 setNeteaseMorphFlying(null) 会推进版本号，
        // 而此时记账还在、fresh 若还是 true，渲染期的起飞判定就会**再起飞一次** ——
        // 落位、再起飞、再落位，转场层把自己锁死在循环里（真机实测：飞行层一直不消失）。
        consumeNeteaseMorphFresh();
        setNeteaseMorphFlying(flyingKeyRef.current);
    }, [flight]);

    // 看门狗：动画正常播完会走 onAnimationComplete，这一条只兜「被打断、回调不触发」的情况。
    React.useEffect(() => {
        if (!flight) return;
        const timer = window.setTimeout(settle, NETEASE_MORPH_DURATION * 1000 + SETTLE_WATCHDOG_MS);
        return () => window.clearTimeout(timer);
    }, [flight, settle]);

    // ── 记一次「点了歌单卡片」 ────────────────────────────────────────────
    // 捕获阶段监听，且排在 React 的 onClick 之前：必须赶在导航发生前把起飞框量好，
    // 一旦首页被藏起来就量不到了（首页此后只是 visibility:hidden，量得到，但那是之后的事）。
    React.useEffect(() => {
        if (!enabled) return;
        const onClick = (event: MouseEvent) => {
            // 先标「这次点击不是开场」，再试着记账：点返回、点标签栏都走这一行，
            // 但它们紧接着的 beforeBack 还要用这份记账，所以这里**只降新鲜度、不清空**。
            markNeteaseMorphNotOpen();
            armNeteaseMorphOpen(event.target);
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [enabled]);

    // 转场整体关闭时把飞行打断，并把这套记账整个丢掉（下次开启从干净状态开始）。
    React.useEffect(() => {
        if (enabled) return;
        settle();
        resetNeteaseMorph();
    }, [enabled, settle]);

    if (!enabled || !flight || typeof document === 'undefined') return null;
    const { leg, base } = flight;

    return createPortal(
        <div
            // 纯展示：不吃任何指针事件，否则这张飞着的封面会挡住下面的点击。
            className="fixed inset-0"
            style={{ zIndex: LAYER_Z, pointerEvents: 'none' }}
            aria-hidden
        >
            <motion.div
                {...{ [NETEASE_FLYER_ATTR]: 'true' }}
                className="absolute overflow-hidden"
                style={{
                    left: base.left,
                    top: base.top,
                    width: base.width,
                    height: base.height,
                    // 起点就是原点，位移与缩放都从这里算，不会因为 transform-origin 猜错而整体飘走。
                    transformOrigin: '0 0',
                    borderRadius: NETEASE_MORPH_RADIUS,
                    willChange: 'transform',
                }}
                initial={{ transform: transformOf(leg.from, base) }}
                animate={{ transform: transformOf(leg.to, base) }}
                transition={{ duration: NETEASE_MORPH_DURATION, ease: NETEASE_MORPH_EASE }}
                onAnimationComplete={settle}
            >
                <motion.img
                    src={leg.coverUrl}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                    style={{ borderRadius: NETEASE_MORPH_RADIUS }}
                />
            </motion.div>
        </div>,
        document.body,
    );
};

export default NeteaseCollectionMorph;
