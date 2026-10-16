import React from 'react';
import { Compass, FolderOpen, ListMusic, LogIn, LogOut, Radio, RefreshCw, Plus, HardDrive, Library as LibraryIcon, Server, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { omni } from '../../../services/onlineMusic/omni';
import { getSongCoverUrl } from '../../../services/onlineMusic/songMetadata';
import type { SongResult } from '../../../types';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import type { ProviderCollection } from '../../../types/onlineMusic';
import { buildNeteasePalette, placeholderTint } from './neteaseTheme';
import { useSafeInsets, bottomBarPadding } from './useSafeInsets';
import { useNeteaseIsPlaying, useNeteaseProgress } from './useNeteasePlayback';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { NeteasePageSlide } from './neteaseLayerTransition';
import { NETEASE_CARD_ATTR, NETEASE_CARD_COVER_ATTR } from './neteaseMorph';
import {
    getNeteaseHomeScrollTop,
    getNeteaseHomeTab,
    hasFiredNeteaseTakeoff,
    hasPlayedNeteaseEntrance,
    markNeteaseEntrancePlayed,
    scheduleNeteaseTakeoff,
    setNeteaseHomeScrollTop,
    setNeteaseHomeTab,
    useRestoredScrollTop,
} from './neteaseSession';
import type { NeteaseTabGlyphId } from './neteaseTabGlyphs';

// entry.ts 不能静态 import 推移模块（registry 是 eager glob 扫所有 entry 的），
// 由本模块把本套的转场声明转出去，四个 lazy loader 在 resolve 时灌进 manifest 的空壳。
export { neteaseTransitions } from './neteaseLayerTransition';
import { NeteaseCloudText } from './NeteaseCloudText';
import {
    NeteaseEmpty,
    NeteaseHeader,
    NeteaseMiniPlayer,
    NeteaseMoreMenu,
    NeteaseSearchBar,
    NeteaseSectionTitle,
    NeteaseShell,
    NeteaseTabBar,
} from './neteaseParts';

/** 推荐歌单取多少条（与 core 的 HOME_FEED_RECOMMENDATION_LIMIT 一致）。 */
const HOME_FEED_LIMIT = 35;

/** omni.getHomeFeed 的返回形状（omni.ts:440）。 */
type HomeFeedShape = {
    personalFm: SongResult[];
    dailySongs: SongResult[];
    recommendedCollections: ProviderCollection[];
};

// src/library/suites/netease/NeteaseHome.tsx
// netease suite 的首页：手机版网易云的结构 —— 常驻搜索条 + 横向歌单卡 + 底部标签栏。
//
// 跟 bravais 的根本差别：bravais 把内容铺成一整面「墙」，导航靠缝裂开；
// 这里是一列可纵向滚动的列表，卡片是方图，切换靠底部标签栏。两套共用同一份契约数据，
// 换 suite 只换画法，不换数据源。

// 首页五个标签，对齐网易云手机版的信息架构：
//   推荐（默认）：来自网易云「现在音乐」的推荐歌单墙 + 每日推荐入口
//   本地 / 专辑 / 远程：曲库来源
//   我的：登录用户自己的歌单（收藏、创建、云盘）
// 「我的」必须排在最后 —— 网易云就是这个顺序，推荐在前、我的在末屏。
type HomeTabId = 'discover' | 'local' | 'albums' | 'navidrome' | 'mine';

const TAB_LABELS: Record<HomeTabId, string> = {
    discover: '推荐',
    local: '本地',
    albums: '专辑',
    navidrome: '远程',
    mine: '我的',
};

/** 标签栏从左到右的顺序。推移方向由它算出来：点右边的标签往左翻，点左边的往右翻。 */
const TAB_ORDER: readonly HomeTabId[] = ['discover', 'local', 'albums', 'navidrome', 'mine'];

// ── 入场（用户 2026-10-15 提的「由外向内层层递进」）────────────────────────
// 卡片初始在**屏幕边缘之外**，缩着、透明、带一点旋转，朝自己那一侧的屏幕外飞进来。
// 离屏幕中心越远越晚起飞 —— 于是形成由外向内的波浪，而不是所有卡片一齐涌进来。
//
// 落位用带轻微过冲的曲线（easeOutBack），读起来是「差点刹不住、被拽回来一点」，
// 和 iOS 解锁后图标弹入是同一类手感。
/** 单张卡片的飞行时长。 */
const CARD_FLY_DURATION = 0.62;
/** 波浪的错峰总量：最外圈的卡片比最中心的晚这么久。0.33 + 0.62 ≈ 0.95s，和需求说的整体时长对上。 */
const CARD_WAVE_STAGGER = 0.33;
/** 起飞时缩到多少、歪多少度。 */
const CARD_FLY_SCALE = 0.62;
const CARD_FLY_ROTATE = 9;
/** 位移／缩放用不同的曲线：位移收得干净，缩放才允许过冲。 */
const CARD_FLY_EASE: [number, number, number, number] = [0.22, 0.68, 0.2, 1];
/**
 * 落位用经典的 easeOutBack（c1 = 1.70158 ⇒ y1 = 1.56）。
 * 之前写的是 1.28，真机实测峰值只冲到 scale 1.010 —— 方向对、但肉眼等于没弹。
 */
const CARD_LAND_EASE: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

/** 顶栏与搜索框的下滑淡入（跟着入场一起，构成完整的页面入场）。 */
const HEADER_FLY = { y: -14, opacity: 0 };
const HEADER_LAND = { y: 0, opacity: 1 };
const HEADER_TRANSITION = { duration: 0.46, ease: [0.2, 0, 0, 1] as [number, number, number, number] };

/** 卡片按压：最大倾斜角、按下时缩到多少。 */
const PRESS_TILT_DEG = 7;
const PRESS_SCALE = 0.965;

/** 一张卡的起飞位：起点偏移、起始旋转、以及它在波浪里的起飞延迟（秒）。 */
type CardFly = { x: number; y: number; rotate: number; delay: number };

/** 「本批卡片里离屏幕中心最远的那个有多远」的缓存。错峰按它归一，见 readFlyIn。 */
type WaveRef = React.MutableRefObject<{ count: number; max: number }>;

/**
 * 量一张卡在**最终布局**里的位置。
 *
 * ⛔ 宽高要把入场的缩放除回去：framer 的 layout effect 挂在 motion 子树上，跑得比卡片自己的
 * useLayoutEffect 早，挂载那一帧 scale(CARD_FLY_SCALE) 已经写在元素上了。
 * 真机实测位移因此只有设计值的 0.62 倍（起点 translateX(-278.8)，设计值应是 -339），
 * 卡片起点落在屏幕里而不是屏幕外。
 *
 * ⚠️ **中心偏移不要除**。scale() 绕 transform-origin（默认 50% 50%）作用，
 * 元素自己的中心点在屏幕上原封不动，只有宽高被缩小了。
 * 真机踩过：中心也除了一遍，距离凭空涨了 1.61 倍，于是「两屏之内」的参照筛选
 * 把第 2、3 行误判成屏外，错峰塌成两级（实测只差 143ms，而不是设计的四层）。
 */
const measureCard = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return {
        width: r.width / CARD_FLY_SCALE,
        height: r.height / CARD_FLY_SCALE,
        cx: r.left + r.width / 2 - window.innerWidth / 2,
        cy: r.top + r.height / 2 - window.innerHeight / 2,
    };
};

/**
 * 一张卡片的起飞位。
 *
 * 量的是**它自己在最终布局里的位置**（飞行动的是 transform，不动布局，所以量得到），
 * 再换算成「从屏幕哪个方向外面进来」和「离中心多远 ⇒ 多晚起飞」。
 *
 * ⛔ 用屏幕中心而不是列表容器中心：卡片墙常常比一屏高，用容器中心的话
 * 下面几屏的卡片会算出「在中心偏上」，飞入方向全朝上，看起来像集体往下钻。
 */
const readFlyIn = (el: HTMLElement, waveRef: WaveRef): CardFly => {
    const halfW = window.innerWidth / 2, halfH = window.innerHeight / 2;
    const m = measureCard(el);
    const ax = Math.abs(m.cx / halfW), ay = Math.abs(m.cy / halfH);
    // 离屏幕中心的归一距离（可以 > 1：屏幕底下的卡片本来就比半屏更远）。
    const dist = Math.hypot(ax, ay);

    // ⚠️ 错峰按**这一批卡里最远的那个**归一，不按屏幕四角。
    // 真机实测（361×794、2 列共 35 张）：各卡的归一距离只落在 0.46…1.0 这一段，
    // 按四角（1.0）归一的话波浪只吃掉预算的一半，35 张卡挤在 143ms 内齐飞。
    //
    // ⚠️⚠️ 参照只取「两屏之内」的卡。整墙有 35 张，最下面那张在 5 屏之下（距离 10.0），
    // 按全场最大值归一的话，错峰预算全花在看不见的卡片上 —— 真机实测屏幕上
    // 真正看得见的三行只分到 84ms 以内，等于没有波浪。
    // 缓存按卡片数量失效：分批到达的网格会各自算自己的最远处。
    const all = document.querySelectorAll<HTMLElement>('[data-nt-card]');
    if (waveRef.current.count !== all.length) {
        let far = 0;
        for (const other of all) {
            const o = measureCard(other);
            if (Math.abs(o.cy) > halfH * 2) continue;
            far = Math.max(far, Math.hypot(o.cx / halfW, o.cy / halfH));
        }
        waveRef.current = { count: all.length, max: far || 1 };
    }

    // ⛔ 方向按**离哪条边更近**来定，不能两个轴都给满：正中间偏上一点的那一排
    // 会因为 cy 只有几个像素而从屏幕下方飞过来，看着像被从下面「顶」上来。
    // 主导轴给满、另一轴只给 45%，于是角落的卡片斜着飞进来、贴边的卡片从自己那侧进来。
    const fx = Math.sign(m.cx || 1) * (halfW + m.width);
    const fy = Math.sign(m.cy || 1) * (halfH + m.height);
    return {
        x: ax >= ay ? fx : fx * 0.45,
        y: ay >= ax ? fy : fy * 0.45,
        rotate: Math.sign(m.cx || 1) * CARD_FLY_ROTATE,
        delay: Math.min(1, dist / waveRef.current.max) * CARD_WAVE_STAGGER,
    };
};

interface CollectionCardProps {
    collection: ProviderCollection;
    /** 这次会话要不要播页面入场。整页只播一次，见 neteaseSession。 */
    enter: boolean;
    motionEnabled: boolean;
    isInteractive: boolean;
    isDaylight: boolean;
    waveRef: WaveRef;
    cardActions: (collection: ProviderCollection) => React.ComponentProps<typeof NeteaseMoreMenu>['actions'];
    openCollection: (collection: ProviderCollection) => void;
}

/**
 * 歌单大卡：方图 + 名称 + 曲数，右上角常显的「⋯」。
 *
 * ⛔ **必须待在模块作用域**，不能定义在 NeteaseHome 的函数体里：
 * 函数体里的组件每次父组件重渲染都会产生一个新的类型，React 按类型对账 ⇒ 整墙卡片被
 * 卸载重挂。真机实测入场期间重挂了 5 代，表现为 scale「起飞 → 退回 0.62 → 再起飞」的锯齿。
 */
const CollectionCard: React.FC<CollectionCardProps> = ({
    collection,
    enter,
    motionEnabled,
    isInteractive,
    isDaylight,
    waveRef,
    cardActions,
    openCollection,
}) => {
    const cardRef = React.useRef<HTMLButtonElement>(null);
    // 起飞位要**量**，量得到之前不能开始动画 —— 所以拆成两步：
    //   第 1 步（useLayoutEffect，绘制前）：量出起点，卡片停在起点、opacity 0；
    //   第 2 步（起飞时刻到了）：landed 翻 true，开始往终点飞。
    // ⛔ 不能用 framer 的 initial 来表达起点：initial 只在挂载那一帧读一次，
    // 而那一帧还没量到（真机实测：整屏卡片完全不动）。
    // 也不能在量到之前先按终点渲染：会闪一下最终位置。
    const [flyIn, setFlyIn] = React.useState<CardFly | null>(null);
    // ⛔ 渲染期就要判断「这张是不是已经起飞过」：即使组件类型稳定了，切标签、
    // 数据二次到达仍可能让整墙重挂，重挂时若还从「未落位」开始，入场会被重播一次。
    const cardId = String(collection.id);
    const [landed, setLanded] = React.useState(() => !enter || hasFiredNeteaseTakeoff(cardId));
    const [press, setPress] = React.useState<{ rotateX: number; rotateY: number; ox: number; oy: number } | null>(null);
    // 只量一次的缓存，见下面 effect 里的说明。
    const measuredRef = React.useRef<CardFly | null>(null);

    React.useLayoutEffect(() => {
        if (!enter) return undefined;
        const el = cardRef.current;
        if (!el) return undefined;
        // 只量一次。同一个组件实例里 StrictMode 会把 effect 跑两遍
        // （bootstrap.tsx 里无条件开启，生产构建也跑），
        // 第二遍再量的话元素上已经带着第一遍算出来的 translate/rotate ——
        // 量到的是「已经挪到起点」的框，方向会翻到屏幕另一侧、距离也会拿满额延迟。
        if (!measuredRef.current) measuredRef.current = readFlyIn(el, waveRef);
        const fly = measuredRef.current;
        setFlyIn(fly);

        // 起飞时刻锚在模块级的表里（见 neteaseSession 的说明），同一个 id 只排一次。
        const fireAt = scheduleNeteaseTakeoff(cardId, fly.delay);
        const remaining = fireAt - performance.now();
        if (remaining <= 0) { setLanded(true); return undefined; }

        let raf = 0;
        let timer = 0;
        let cancelled = false;
        // 隔一帧再起飞：这一帧要先让「起点」被提交上去，framer 才有 from 可插值。
        //
        // ⚠️ 错峰必须用**真实定时器**推进，不能写进 framer 的 delay。
        // 真机实测：写不写 delay 效果完全一样，35 张卡在同一帧齐飞、可见数一帧从 4 跳到 35。
        raf = requestAnimationFrame(() => {
            if (cancelled) return;
            timer = window.setTimeout(() => {
                if (!cancelled) setLanded(true);
            }, remaining);
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            clearTimeout(timer);
        };
    }, [enter, cardId, waveRef]);

    // 按下时按点击位置相对卡片中心的偏移算倾斜。
    // 变换原点放在**被点的那一角**上：这样「缩小」读起来就是那一角往里陷，
    // 而不是整张卡朝屏幕中心缩。倾斜绕原点转，方向也跟着点的那一侧走。
    const beginPress = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!motionEnabled) return;
        const el = cardRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, ((event.clientX - r.left) / r.width) * 2 - 1));
        const ny = Math.max(-1, Math.min(1, ((event.clientY - r.top) / r.height) * 2 - 1));
        setPress({
            rotateX: -ny * PRESS_TILT_DEG,
            rotateY: nx * PRESS_TILT_DEG,
            ox: 50 + nx * 50,
            oy: 50 + ny * 50,
        });
    };
    const endPress = () => setPress(null);

    // 起飞之后 framer 只负责插值，错峰已经在上面的定时器里做完了。
    // 各属性的曲线不同，所以仍然是逐值写（顶层那一份会被忽略）。
    const flyTransition = React.useMemo(() => ({
        x: { duration: CARD_FLY_DURATION, ease: CARD_FLY_EASE },
        y: { duration: CARD_FLY_DURATION, ease: CARD_FLY_EASE },
        rotate: { duration: CARD_FLY_DURATION, ease: CARD_FLY_EASE },
        // 缩放单独给一条带过冲的曲线：位移干净地停在原位，大小「刹不住」地弹一下。
        scale: { duration: CARD_FLY_DURATION, ease: CARD_LAND_EASE },
        opacity: { duration: CARD_FLY_DURATION * 0.42, ease: 'linear' as const },
    }), []);

    return (
        <motion.button
            ref={cardRef}
            type="button"
            disabled={!isInteractive}
            onClick={() => openCollection(collection)}
            // 入场与按压都只动 transform / opacity，不碰布局 —— 一屏几十张卡，
            // 任何会触发布局的属性都会让这一段明显掉帧。
            initial={false}
            animate={enter && !landed
                ? { x: flyIn?.x ?? 0, y: flyIn?.y ?? 0, scale: CARD_FLY_SCALE, rotate: flyIn?.rotate ?? 0, opacity: 0 }
                : { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
            transition={enter && landed ? flyTransition : { duration: 0 }}
            onPointerDown={beginPress}
            onPointerUp={endPress}
            onPointerLeave={endPress}
            onPointerCancel={endPress}
            className="flex w-full flex-col gap-2 text-left"
            style={{ perspective: motionEnabled ? 700 : undefined }}
            {...{ [NETEASE_CARD_ATTR]: cardId }}
        >
            {/* 起飞框量的是**外层这个盒子**（见 neteaseMorph.ts 的契约说明），它**不带 transform**。
                按压的 3D 倾斜必须放在里面的 motion 上：倾斜会改 getBoundingClientRect，
                两者放同一层的话起飞框量到的是被按住的那一帧，封面会歪着飞出去。
                属性值用集合 id：返回时靠它找回同一张卡。 */}
            <div
                className="relative aspect-square w-full overflow-hidden rounded-xl"
                style={placeholderTint(cardId, isDaylight)}
                {...{ [NETEASE_CARD_COVER_ATTR]: cardId }}
            >
                <motion.div
                    className="absolute inset-0 overflow-hidden rounded-xl"
                    style={{
                        transform: press
                            ? `rotateX(${press.rotateX}deg) rotateY(${press.rotateY}deg) scale(${PRESS_SCALE})`
                            : 'rotateX(0deg) rotateY(0deg) scale(1)',
                        transformOrigin: press ? `${press.ox}% ${press.oy}%` : '50% 50%',
                        // 回弹：松手后 0.28s 回到原状。按下那一刻是瞬时的（要跟手）。
                        transition: press ? 'none' : 'transform 280ms cubic-bezier(0.2, 0, 0, 1)',
                    }}
                >
                    {collection.coverUrl && (
                        <img
                            src={collection.coverUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                        />
                    )}
                    {/* 「⋯」盖在卡上但**常显**：这是上一轮 group-hover 隐身的高发区，手机上必须能点到 */}
                    <span className="absolute right-1 top-1" onClick={event => event.stopPropagation()}>
                        <NeteaseMoreMenu label="更多操作" actions={cardActions(collection)} />
                    </span>
                    {typeof collection.trackCount === 'number' && (
                        <span
                            className="absolute bottom-1.5 right-2 nt-t-caption"
                            style={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                        >
                            {collection.trackCount > 999 ? '999+' : collection.trackCount}
                        </span>
                    )}
                </motion.div>
            </div>
            {/* truncate 必须挂在组件自己的根元素上：省略号只对「元素里直接是行内内容」
                生效，外面再包一层 span 就没有了。词不做横向位移同理 ——
                见 NeteaseCloudText 开头关于裁剪的说明。 */}
            <NeteaseCloudText
                text={collection.name}
                tier="item"
                className="truncate nt-t-item"
                style={{ color: 'var(--nt-text)' }}
            />
            {typeof collection.trackCount === 'number' && (
                <NeteaseCloudText
                    text={`${collection.trackCount} 首`}
                    tier="meta"
                    delay={0.05}
                    className="nt-t-meta"
                    style={{ color: 'var(--nt-text-faint)' }}
                />
            )}
        </motion.button>
    );
};

const NeteaseHome: React.FC<LibraryHomeSurfaceProps> = ({
    declaredActions,
    account,
    playlists,
    localPlaylists,
    localSongs,
    user,
    currentTrack,
    theme,
    isInteractive,
    onPlaySong,
    onOpenGridView,
    onSearchCommitted,
    onRefreshUser,
    onRefreshLocalSongs,
    onStatusMessage,
    onTogglePlayback,
    onEnterPlaybackView,
    homeResources,
    localMusicState,
    setLocalMusicState,
}) => {
    const insets = useSafeInsets();
    const barInset = bottomBarPadding(insets);
    const can = new Set(declaredActions.actions);
    // 标签存在模块级而不是 useState：进歌词时宿主会整个卸载 Home 子树，
    // 普通组件状态会跟着没，回来就落在「推荐」上 —— 看着就是「回到首页重新加载」。
    const [tab, setTabState] = React.useState<HomeTabId>(
        () => (getNeteaseHomeTab() as HomeTabId) ?? 'discover',
    );
    const setTab = React.useCallback((next: HomeTabId) => {
        setNeteaseHomeTab(next);
        setTabState(next);
    }, []);
    const tabScrollRef = React.useRef<HTMLDivElement>(null);
    useRestoredScrollTop(tabScrollRef, tab, getNeteaseHomeScrollTop, setNeteaseHomeScrollTop);
    // 推移方向。必须和 setTab 同一个渲染里落定，退场的那一页才知道该往哪边退。
    const [tabDirection, setTabDirection] = React.useState<1 | -1>(1);
    // 与集合层的整层推移共用同一个动效面（collectionMorph），用户关一次两边一起停。
    const reducedSlide = useReducedMotionFor('collectionMorph');
    // 入场与按压走 uiMicroMotion 那个面：它们是界面微交互，不是集合层的形变。
    const motionEnabled = !useReducedMotionFor('uiMicroMotion');
    // 页面入场一个会话只播一次（见 neteaseSession 的说明）：切标签、从歌词回来都不重播。
    //
    // ⛔ 必须在**挂载那一刻**就把「播不播」定死，不能等卡片到了再决定：
    // 首页先挂、数据后到（在线音源要拉推荐，真机上约 1s）。若用 state 在挂载时就翻成
    // 「已播过」，等卡片渲染时入场信号早没了 —— 真机实测就是完全不动。
    // 所以这里用惰性初值把决定冻住，真正落标记交给下面的 cardCount effect。
    // ⛔ 必须和动效开关一起定：关掉 uiMicroMotion 的用户看到的是「整屏卡片卡在起点、
    // 透明度 0」，因为入场的起点本来就是 opacity 0。
    const [entranceOn] = React.useState(() => motionEnabled && !hasPlayedNeteaseEntrance());
    const [query, setQuery] = React.useState('');
    // 同一批卡里「离屏幕中心最远的那个有多远」。见 readFlyIn：按屏幕四角归一会把波浪压掉一半。
    // 用可变对象而不是 state：卡片要在自己的 layout effect 里读它，那一刻父组件还没跑完 effect。
    const waveRef = React.useRef({ count: -1, max: 1 });

    /** 切标签页并记下方向。同一个 tab 不重播动画。 */
    const selectTab = (next: HomeTabId) => {
        if (next === tab) return;
        setTabDirection(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab) ? 1 : -1);
        setTab(next);
    };

    // 迷你播放条的播放态与进度。之前这里是写死的 isPlaying={false}，按钮永远显示三角；
    // 点击其实一直是通的（onTogglePlayback 真实生效），坏的只是图标从不反映状态。
    const miniPlayerPlaying = useNeteaseIsPlaying();
    const miniPlayerProgress = useNeteaseProgress();

    const needle = query.trim().toLowerCase();
    const matchName = (name?: string | null) => !needle || (name ?? '').toLowerCase().includes(needle);

    // 首页数据里没有 theme / isDaylight 的显式 prop 时，从契约的 theme 推；
    // isDaylight 由宿主的 ThemeSettingsStore 决定，这里用背景亮度反推，保证与全局一致。
    const isDaylight = React.useMemo(() => {
        const hex = theme?.backgroundColor ?? '';
        const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
        if (!match) return false;
        const n = parseInt(match[1], 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
    }, [theme?.backgroundColor]);

    const palette = React.useMemo(() => buildNeteasePalette(theme, isDaylight), [theme, isDaylight]);

    // 过滤词提交给宿主的浏览会话（命令面板 / grid 那一侧读它），本地同时过滤一遍，两边都不阻塞。
    // 注意 sourceTab 用的是宿主 HomeViewTab 的名字，与本 suite 自己的 tab id 不是一套，要映射。
    const HOME_VIEW_TAB: Record<HomeTabId, Parameters<typeof onSearchCommitted>[1]> = {
        discover: 'playlist',
        local: 'local',
        albums: 'albums',
        navidrome: 'navidrome',
        mine: 'playlist',
    };
    const applyQuery = (next: string) => {
        setQuery(next);
        onSearchCommitted(next, HOME_VIEW_TAB[tab]);
    };

    const onlineCollections = React.useMemo(
        () => playlists.filter(item => matchName(item.name)),
        [playlists, needle],
    );

    /**
     * 打开一个在线歌单 / 专辑。
     *
     * ⚠️ 为什么**不能**自己拼描述符丢给 `onOpenGridView`（2026-10-14 真机实测）：
     * `LibraryCollectionDescriptor.source` 是必填字段，而 `createCollectionResource.ts:45-47` 只认
     * `'online'` / `'navidrome'`，其余一律落到 `createStaticCollectionResource(key, [])` —— **空静态资源**。
     * 于是 `ensure()` 里的 `next.source !== 'online'` 直接早退，一条请求都不发，
     * 详情页永远停在「0 首 / 这里还没有歌曲」。
     *
     * 症状极具迷惑性：标题、封面、返回键全都正常，只有内容是空的，很容易误判成「音源挂了」。
     * 正确入口是契约给的 `homeResources.actions.openOnlineCard` —— 它内部经
     * `onlineCardCollection` + 宿主的 `describeOnlineCollection` 构造带 `source: 'online'` 的描述符，
     * 顺带把私人 FM 卡识别成「直接播放」而不是打开集合。
     */
    const openCollection = (collection: ProviderCollection) => {
        void homeResources.actions.openOnlineCard(
            { id: collection.id, name: collection.name, type: collection.type, raw: collection },
            collection.providerId,
            onOpenGridView,
        );
    };

    const localCards = React.useMemo(
        () => localPlaylists.filter(item => matchName(item.name)),
        [localPlaylists, needle],
    );

    const cardActions = (collection: ProviderCollection) => {
        const entries = [{ id: 'open', label: '打开歌单', onSelect: () => openCollection(collection) }];
        if (can.has('export-playlist')) {
            entries.push({
                id: 'export',
                label: '导出歌单',
                onSelect: () => onStatusMessage?.({ type: 'info', text: `导出「${collection.name}」` }),
            });
        }
        return entries;
    };

    /**
     * 「推荐」页的数据。
     *
     * ⚠️ 为什么**不**走 homeResources.radioFeed（2026-10-14 实测排查结论）：
     * 那条路有三重门，对本套全部关着——
     *   1. core/services/onlineHomeFeeds.ts:95 `ensure: if (!snapshot.owner) return`（owner 为 null 静默返回）
     *   2. core/bindings/useLibraryHomeOnlineFeeds.ts:43 `setOwner(ownerOf(providerId, userId, canUseRadio))`
     *   3. 同文件 :45 只在 `tab === 'radio'` 时 ensure，而 tab 是宿主 HomeViewTab，本套叫 'discover'
     * 结果：首页一条 `/personalized` 都没发，推荐页永远空。
     * 而用同一份 cookie 手动打是好的（实测 /personalized 200+6条、/recommend/songs 200+33首、
     * /personal_fm 200），**数据一直都在，只是没人去读**。
     *
     * 所以直接调 omni.getHomeFeed —— 它是数据源本身（omni.ts:440 内部并发调
     * getPersonalFm / getDailySongs / getRecommendedCollections），带 provider 门控与统一 cookie，
     * 不依赖宿主那几个与 suite 无关的 tab 判断。
     */
    const [feed, setFeed] = React.useState<HomeFeedShape | null>(null);
    const [feedStatus, setFeedStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

    // 已经为哪个会话发起过读取。存会话 key 而不是存 feedStatus，
    // 是为了让「失败」和「已读」两件事解耦：一次失败不该把后续所有重试挡在门外。
    const feedKeyRef = React.useRef<string | null>(null);
    const sessionKey = `${user?.id ?? 'anon'}:${HOME_FEED_LIMIT}`;

    const loadFeed = React.useCallback(async () => {
        setFeedStatus('loading');
        try {
            setFeed(await omni.getHomeFeed(HOME_FEED_LIMIT));
            setFeedStatus('ready');
        } catch (error) {
            // omni.ts:106 在 provider 切换途中会抛 AbortError —— 那是「发起得太早」，
            // 不是「音源挂了」。必须放回可重试态，否则一次切号就把推荐页永久锁死成 error。
            const aborted = error instanceof DOMException && error.name === 'AbortError';
            if (aborted) feedKeyRef.current = null;
            setFeedStatus(aborted ? 'idle' : 'error');
        }
    }, []);

    // 进推荐页读一次；同一会话内不重复读（切走再回来直接用缓存）。
    React.useEffect(() => {
        if (tab !== 'discover' || feedStatus === 'loading') return;
        if (feedKeyRef.current === sessionKey) return;
        feedKeyRef.current = sessionKey;
        void loadFeed();
    }, [tab, sessionKey, feedStatus, loadFeed]);

    const recommended = React.useMemo(
        () => (feed?.recommendedCollections ?? []).filter(item => matchName(item.name)),
        [feed, needle],
    );
    const dailyCount = feed?.dailySongs.length ?? 0;
    const dailyCover = feed?.dailySongs[0] ? getSongCoverUrl(feed.dailySongs[0]) : undefined;
    const personalFmCover = feed?.personalFm[0] ? getSongCoverUrl(feed.personalFm[0]) : undefined;

    // 两个入口按钮的动作。⚠️ 这两个按钮**曾经完全没接 onClick**，点了毫无反应（2026-10-14 实测）。
    const activeProviderId = account.getSnapshot().activeProviderId;
    const openDailyRecommendations = () => {
        void homeResources.actions.openOnlineCard(
            {
                id: 'daily_recommendations',
                name: '每日推荐',
                type: 'daily_recommendations',
                // isDailyRecommendations 决定资源侧走 getDailySongs 而不是分页（onlineCollectionResource.ts:47）。
                raw: { id: 'daily_recommendations', name: '每日推荐', isDailyRecommendations: true },
            },
            activeProviderId,
            onOpenGridView,
        );
    };
    const playPersonalFm = () => void homeResources.actions.playPersonalFm();

    /** 推荐页（网易云第一屏）：每日推荐 / 私人 FM 两个入口 + 推荐歌单墙。 */
    const renderDiscoverTab = () => {
        const hasFeed = recommended.length > 0 || dailyCount > 0;
        return (
            <>
                {/* 每日推荐 / 私人 FM：两个方块，网易云并排放在推荐墙最上面 */}
                {(dailyCount > 0 || dailyCover) && (
                    <div className="grid grid-cols-2 gap-3 px-4 pt-1">
                        <button
                            type="button"
                            onClick={openDailyRecommendations}
                            className="flex flex-col items-center gap-2 rounded-xl py-4"
                            style={{ background: 'var(--nt-surface)' }}
                        >
                            <span
                                className="h-16 w-16 overflow-hidden rounded-lg"
                                style={placeholderTint('daily-recommendations', isDaylight)}
                            >
                                {dailyCover ? (
                                    <img src={dailyCover} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="flex h-full w-full items-center justify-center nt-t-caption" style={{ color: 'var(--nt-text)', fontWeight: 600 }}>
                                        每日<br />推荐
                                    </span>
                                )}
                            </span>
                            <NeteaseCloudText text="每日推荐" tier="item" className="nt-t-item" style={{ color: 'var(--nt-text)' }} />
                            {dailyCount > 0 && (
                                <NeteaseCloudText text={`${dailyCount} 首`} tier="meta" delay={0.05} className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }} />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={playPersonalFm}
                            className="flex flex-col items-center gap-2 rounded-xl py-4"
                            style={{ background: 'var(--nt-surface)' }}
                        >
                            <span
                                className="h-16 w-16 overflow-hidden rounded-full"
                                style={placeholderTint('personal-fm', isDaylight)}
                            >
                                {personalFmCover ? (
                                    <img src={personalFmCover} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <span className="flex h-full w-full items-center justify-center">
                                        <Radio size={22} style={{ color: 'var(--nt-text)' }} />
                                    </span>
                                )}
                            </span>
                            <NeteaseCloudText text="私人 FM" tier="item" className="nt-t-item" style={{ color: 'var(--nt-text)' }} />
                        </button>
                    </div>
                )}

                <NeteaseSectionTitle count={recommended.length}>推荐歌单</NeteaseSectionTitle>

                {feedStatus === 'loading' && !hasFeed && <NeteaseEmpty message="推荐加载中…" />}

                {/* 推荐走的是在线音源。取不到时要说清是「音源」不通，
                    否则用户会误以为是自己网络或界面坏了 —— 实测踩过：
                    接口 Failed to fetch 时笼统显示「加载失败」，很难定位。 */}
                {feedStatus === 'error' && !hasFeed && (
                    <NeteaseEmpty
                        message="推荐加载失败"
                        hint="在线音源没有响应 —— 检查音源服务是否在运行"
                    />
                )}

                {/* 没登录时网易云也照样给推荐（游客态），所以这里不因缺 user 而空。
                    feedStatus 停在 idle 且一直没有数据 = 音源根本没读到，
                    这时要区分「真的一条推荐都没有」和「压根没读到」。 */}
                {hasFeed ? (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 sm:grid-cols-3">
                        {recommended.map(collection => (
                            <CollectionCard
                                key={String(collection.id)}
                                collection={collection}
                                enter={entranceOn}
                                motionEnabled={motionEnabled}
                                isInteractive={isInteractive}
                                isDaylight={isDaylight}
                                waveRef={waveRef}
                                cardActions={cardActions}
                                openCollection={openCollection}
                            />
                        ))}
                    </div>
                ) : feedStatus === 'ready' ? (
                    <NeteaseEmpty
                        message={needle ? '没有匹配的歌单' : '暂无推荐'}
                        hint={user ? '下拉刷新试试' : '登录后推荐更准'}
                    />
                ) : null}
            </>
        );
    };

    /** 「我的」页的登录入口。
     *
     * 走 account.selectProvider 而不是 startLogin：它才是「现 Grid3D 的选平台规则」那一支
     * （provider 没配置时直接 unavailable，不会起一个注定失败的会话；能直接切时先问用户）。
     *
     * ⛔ **不要**用 `can.has('account-login')` 之类再套一层门：账户动作只声明在 account surface 上，
     * HOME_ACTIONS 里没有它们（见 entry.ts）。网格的既有写法就是首页直接调 controller
     * （Grid3D 的 selectProvider / logout 均无门），`can` 是给 account surface 自己的界面和命令面板用的。
     * 套了门的结果就是按钮永远不显示。 */
    const startLogin = () => {
        void account.selectProvider(activeProviderId);
    };

    /** 退出登录。用 ref 挡连点：logout 是异步的，在它 resolve 之前用户还能再点一次。 */
    const logoutInFlightRef = React.useRef(false);
    const logout = () => {
        if (logoutInFlightRef.current) return;
        logoutInFlightRef.current = true;
        void account.logout(activeProviderId).then(result => {
            logoutInFlightRef.current = false;
            if (result.status === 'logged-out') {
                onStatusMessage?.({ type: 'success', text: '已退出登录', nonce: Date.now() });
                return;
            }
            const detail = result.status === 'failed' ? result.message : null;
            onStatusMessage?.({
                type: 'error',
                text: detail ? `退出登录失败：${detail}` : '退出登录失败',
                nonce: Date.now(),
            });
        });
    };

    /** 我的页（最后一屏）：登录用户自己的歌单 + 收藏 + 云盘。 */
    const renderMineTab = () => {
        if (!user) {
            return (
                <NeteaseEmpty
                    message="未登录"
                    hint="登录网易云后这里会显示你的歌单"
                    fill
                    action={(
                        <button
                            type="button"
                            onClick={startLogin}
                            disabled={!isInteractive}
                            className="flex items-center justify-center gap-1.5 rounded-full px-7 py-3 nt-t-item disabled:opacity-40"
                            style={{ background: 'var(--nt-accent)', color: 'var(--nt-on-accent)' }}
                        >
                            <LogIn size={15} />登录
                        </button>
                    )}
                />
            );
        }
        if (onlineCollections.length === 0) {
            return <NeteaseEmpty fill message={needle ? '没有匹配的歌单' : '还没有歌单'} hint="新建一个开始整理吧" />;
        }
        return (
            <>
                {/* 账号条 */}
                <div className="flex items-center gap-3 px-4 py-4">
                    <span
                        className="h-14 w-14 shrink-0 overflow-hidden rounded-full"
                        style={placeholderTint(user.nickname || 'me', isDaylight)}
                    >
                        {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                        <NeteaseCloudText text={user.nickname} tier="display" className="truncate nt-t-display" style={{ color: 'var(--nt-text)' }} />
                        <NeteaseCloudText text={`${onlineCollections.length} 个歌单`} tier="meta" delay={0.06} className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }} />
                    </div>
                    <button
                        type="button"
                        onClick={logout}
                        disabled={!isInteractive}
                        aria-label="退出登录"
                        className="flex shrink-0 items-center gap-1 rounded-full px-3 py-2 nt-t-label disabled:opacity-40"
                        style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                    >
                        <LogOut size={14} />退出登录
                    </button>
                </div>

                <NeteaseSectionTitle count={onlineCollections.length}>我创建的歌单</NeteaseSectionTitle>
                <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 sm:grid-cols-3">
                    {onlineCollections.map(collection => (
                        <CollectionCard
                            key={String(collection.id)}
                            collection={collection}
                            enter={entranceOn}
                            motionEnabled={motionEnabled}
                            isInteractive={isInteractive}
                            isDaylight={isDaylight}
                            waveRef={waveRef}
                            cardActions={cardActions}
                            openCollection={openCollection}
                        />
                    ))}
                </div>
            </>
        );
    };

    const renderLocalTab = () => (
        <>
            <NeteaseSectionTitle>曲库</NeteaseSectionTitle>
            <div className="px-4">
                <div className="overflow-hidden rounded-xl" style={{ background: 'var(--nt-surface)' }}>
                    <div className="flex items-center gap-3 px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--nt-hover)' }}>
                            <ListMusic size={17} style={{ color: 'var(--nt-text-muted)' }} />
                        </span>
                        <NeteaseCloudText text="全部歌曲" tier="title" className="flex-1 nt-t-title" style={{ color: 'var(--nt-text)' }} />
                        <NeteaseCloudText text={String(localSongs.length)} tier="meta" delay={0.05} className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }} />
                    </div>
                    {localCards.map(item => (
                        <button
                            key={String(item.id)}
                            type="button"
                            onClick={() => setLocalMusicState({ ...localMusicState, activeRow: 1 as 0 | 1 | 2 | 3 })}
                            className="flex w-full items-center gap-3 px-4 py-3"
                            style={{ borderTop: '1px solid var(--nt-divider)' }}
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--nt-hover)' }}>
                                <FolderOpen size={16} style={{ color: 'var(--nt-text-muted)' }} />
                            </span>
                            <NeteaseCloudText text={item.name} tier="item" className="flex-1 truncate text-left nt-t-item" style={{ color: 'var(--nt-text)' }} />
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-3 flex gap-2 px-4">
                {can.has('home-import-folder') && (
                    <button
                        type="button"
                        onClick={() => setLocalMusicState({ ...localMusicState, activeRow: 0 as 0 | 1 | 2 | 3 })}
                        className="flex flex-1 items-center justify-center gap-1 rounded-full py-3 nt-t-label"
                        style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                    >
                        <Plus size={14} />导入
                    </button>
                )}
                {can.has('home-refresh-folders') && (
                    <button
                        type="button"
                        onClick={() => void onRefreshLocalSongs()}
                        className="flex flex-1 items-center justify-center gap-1 rounded-full py-3 nt-t-label"
                        style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                    >
                        <RefreshCw size={13} />刷新
                    </button>
                )}
            </div>
        </>
    );

    const renderAlbumsTab = () => {
        const albums = playlists.filter(item => item.type === 'album' && matchName(item.name));
        return (
            <>
                <NeteaseSectionTitle count={albums.length}>专辑</NeteaseSectionTitle>
                {albums.length === 0
                    ? <NeteaseEmpty message="没有专辑" />
                    : (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 sm:grid-cols-3">
                            {albums.map(collection => (
                                <CollectionCard
                                    key={String(collection.id)}
                                    collection={collection}
                                    enter={entranceOn}
                                    motionEnabled={motionEnabled}
                                    isInteractive={isInteractive}
                                    isDaylight={isDaylight}
                                    waveRef={waveRef}
                                    cardActions={cardActions}
                                    openCollection={openCollection}
                                />
                            ))}
                        </div>
                    )}
            </>
        );
    };

    const renderRemoteTab = () => (
        <>
            <NeteaseSectionTitle>Navidrome</NeteaseSectionTitle>
            <div className="px-4">
                <button
                    type="button"
                    onClick={() => void onRefreshUser()}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-4"
                    style={{ background: 'var(--nt-surface)' }}
                >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: 'var(--nt-hover)' }}>
                        <Radio size={18} style={{ color: 'var(--nt-text-muted)' }} />
                    </span>
                    <NeteaseCloudText text="连接自建音乐库" tier="item" className="flex-1 text-left nt-t-item" style={{ color: 'var(--nt-text)' }} />
                </button>
            </div>
        </>
    );

    // 顺序同网易云：推荐在第一屏，「我的」在最后一屏。
    // glyph 是选中态圆球里那枚**白色实心**字形的 id（未选中态仍用上面的 lucide 描边图标），
    // 两套字形形状一一对应，只是画法不同 —— 见 neteaseTabGlyphs 的说明。
    const tabs: readonly { id: string; label: string; icon: React.ReactNode; glyph: NeteaseTabGlyphId }[] = [
        { id: 'discover', label: TAB_LABELS.discover, icon: <Compass size={19} />, glyph: 'compass' },
        { id: 'local', label: TAB_LABELS.local, icon: <HardDrive size={18} />, glyph: 'local' },
        { id: 'albums', label: TAB_LABELS.albums, icon: <LibraryIcon size={18} />, glyph: 'albums' },
        { id: 'navidrome', label: TAB_LABELS.navidrome, icon: <Server size={18} />, glyph: 'remote' },
        { id: 'mine', label: TAB_LABELS.mine, icon: <User size={18} />, glyph: 'mine' },
    ];

    /**
     * 入场播过一次就把模块级标记落下来，**要等卡片真的渲染出来**才落。
     * 放在挂载那一刻落的话，数据后到的卡片全都会拿到「已播过」而不再入场。
     * effect 在整轮 render 之后才跑，所以同一批卡片读到的都还是 true。
     */
    React.useEffect(() => {
        if (!entranceOn) return;
        // 三个带卡片网格的标签页，推荐 / 我的 / 专辑。albums 是在 renderAlbumsTab 里现算的，
        // 这里直接用 playlists.length 当它是否已就绪的信号，不重复算一遍过滤。
        if (recommended.length + onlineCollections.length + playlists.length === 0) return;
        markNeteaseEntrancePlayed();
    }, [entranceOn, recommended.length, onlineCollections.length, playlists.length]);

    /** 当前标签页的内容。抽出来是为了让推移组件只按 tab id 换页，不关心每页长什么样。 */
    const renderTabContent = (current: HomeTabId) => {        switch (current) {
            case 'discover': return renderDiscoverTab();
            case 'local': return renderLocalTab();
            case 'albums': return renderAlbumsTab();
            case 'navidrome': return renderRemoteTab();
            case 'mine': return renderMineTab();
        }
    };

    return (
        <NeteaseShell palette={palette}>
            {/* 顶栏与搜索框跟着页面入场一起「下滑淡入」。两段错开一点点，读起来是「先出标题、
                再出搜索框」，和下面卡片的波浪合起来才是完整的一屏入场。
                不播入场（已经播过 / 关了动效）时 initial={false}，也就是完全不动。 */}
            <motion.div
                initial={entranceOn ? HEADER_FLY : false}
                animate={HEADER_LAND}
                transition={HEADER_TRANSITION}
            >
                <NeteaseHeader
                    title="音乐库"
                    trailing={(
                        <NeteaseMoreMenu
                            label="更多"
                            actions={[
                                { id: 'refresh', label: '刷新', onSelect: () => void onRefreshLocalSongs() },
                                { id: 'account', label: '账户', onSelect: () => selectTab('mine') },
                            ]}
                        />
                    )}
                />
            </motion.div>
            <motion.div
                initial={entranceOn ? HEADER_FLY : false}
                animate={HEADER_LAND}
                transition={{ ...HEADER_TRANSITION, delay: 0.08 }}
            >
                <NeteaseSearchBar query={query} placeholder="搜索歌单" onQueryChange={applyQuery} />
            </motion.div>

            {/* 两层：外层裁切（推移时不让翻出去的半页漏到界面上），内层才滚动。
                推移期间新旧两页同时在 DOM 里（退场那页靠 AnimatePresence 留到动画结束），
                所以内层必须 absolute 叠在同一块地方，不能靠文档流排下去。 */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <NeteasePageSlide
                    slideKey={tab}
                    direction={tabDirection}
                    reduced={reducedSlide}
                    className="nt-scroll absolute inset-0 pb-4"
                    innerRef={tabScrollRef}
                >
                    {renderTabContent(tab)}
                </NeteasePageSlide>
            </div>

            {/* 迷你播放条：贴着 tab 栏上方。整条可点进播放页（网易云同款交互）。 */}
            {currentTrack && (
                <NeteaseMiniPlayer
                    title={currentTrack.name}
                    subtitle={currentTrack.artists?.map(a => a.name).join(' / ') || ''}
                    coverUrl={currentTrack.album?.coverUrl ?? null}
                    isPlaying={miniPlayerPlaying}
                    progress={miniPlayerProgress}
                    seed={String(currentTrack.id)}
                    onOpenPlayer={() => onEnterPlaybackView?.()}
                    onTogglePlayback={() => onTogglePlayback?.()}
                    onOpenQueue={() => onStatusMessage?.({ type: 'info', text: '队列在下方播放条里' })}
                />
            )}

            {/* 底部标签栏：bottomInset 是实测的手势区高度，不是 env()（那个恒为 0）。 */}
            <NeteaseTabBar
                tabs={tabs}
                activeId={tab}
                onChange={id => selectTab(id as HomeTabId)}
                bottomInset={barInset}
            />
        </NeteaseShell>
    );
};

export default NeteaseHome;