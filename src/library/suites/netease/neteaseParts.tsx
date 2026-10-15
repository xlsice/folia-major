import React from 'react';

// src/library/suites/netease/neteaseParts.tsx
// netease suite 的共享零件。拆出来是因为四个 surface 反复用到同一批东西，
// 而每一批都是「上一轮 group-hover 隐身」的高发区——这里一律常显，不做悬停显形。

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Disc3, ListMusic, MoreHorizontal, Pause, Play, Search, X } from 'lucide-react';
import { paletteToCssVars, placeholderTint, isAndroidShell, type NeteasePalette } from './neteaseTheme';
import { useSafeInsets } from './useSafeInsets';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { NeteaseTabGlyph, TAB_PILL_SIZE, type NeteaseTabGlyphId } from './neteaseTabGlyphs';

/**
 * 底部标签栏。几何照网易云手机版的真机实测（uiautomator dump，单位 dp）：
 *   tab 容器 h=54dp；其中可点区 50.6dp（y=2535..2712）；图标+文字 21.7dp 居中；
 *   标签栏底边在 774.9dp，屏幕底 794.3dp —— 留出 19.4dp 手势导航区，两者物理隔离。
 *
 * `bottomInset` 传进来的就是那段手势区高度（原生 SafeInsetsPlugin 给的真值）。
 * **不能省**：省掉就贴到视口最底，点标签其实点在系统手势条上（2026-10-14 实测踩过）。
 */
/**
 * 底部标签栏。
 *
 * 选中态不是「把图标染成强调色」，而是**一枚实色圆球**：圆球平移到当前标签的位置，
 * 该标签的文字与描边图标让位，由球里的白色实心图标代表自己（字形与生长动画见 neteaseTabGlyphs）。
 * 未选中的标签保持原来的「描边图标 + 文字」，只做颜色区分。
 *
 * 圆球的位置是**量出来的**而不是按 index 算的：五个按钮虽然都是 flex-1，但标签栏宽度会随
 * 窗口/手势区/字体缩放变，用 `宽度 × (i+0.5)/n` 会在某些宽度下差出小半个像素，久而久之圆球
 * 看起来没对准。ResizeObserver 同时盯 nav 与每个按钮，任何一个尺寸变化都重算。
 */
export const NeteaseTabBar: React.FC<{
    tabs: readonly { id: string; label: string; icon: React.ReactNode; glyph: NeteaseTabGlyphId }[];
    activeId: string;
    onChange: (id: string) => void;
    /** 底部手势区高度（CSS px）。用测量值，不用 env()——见 useSafeInsets 的注释。 */
    bottomInset: number;
}> = ({ tabs, activeId, onChange, bottomInset }) => {
    const navRef = React.useRef<HTMLElement | null>(null);
    const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
    const [pillX, setPillX] = React.useState(0);
    const [pillReady, setPillReady] = React.useState(false);
    const reducedTab = useReducedMotionFor('uiMicroMotion');

    const activeIndex = Math.max(0, tabs.findIndex(tab => tab.id === activeId));
    const activeGlyph = tabs[activeIndex]?.glyph ?? 'compass';

    /** 圆球左边缘相对 nav 左边缘的偏移 = 目标按钮水平中心 − 球半径。 */
    const measure = React.useCallback(() => {
        const nav = navRef.current;
        const target = tabRefs.current[activeIndex];
        if (!nav || !target) return;
        const navRect = nav.getBoundingClientRect();
        const tabRect = target.getBoundingClientRect();
        setPillX(tabRect.left - navRect.left + tabRect.width / 2 - TAB_PILL_SIZE / 2);
        setPillReady(true);
    }, [activeIndex]);

    React.useLayoutEffect(measure, [measure, tabs.length]);

    // 窗口/手势区变化会让标签栏重新布局；不重算的话圆球会停在旧位置。
    React.useEffect(() => {
        const nav = navRef.current;
        if (!nav) return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(nav);
        tabRefs.current.forEach(node => node && observer.observe(node));
        return () => observer.disconnect();
    }, [measure, tabs.length]);

    return (
        <div style={{ paddingBottom: bottomInset }} data-nt-tabbar-inset={bottomInset}>
            <nav
                ref={navRef}
                className="relative flex shrink-0 items-stretch border-t"
                style={{ background: 'var(--nt-elevated)', borderColor: 'var(--nt-divider)', height: '54px' }}
            >
                {/* 圆球层：压在按钮之上且不吃点击事件（pointer-events-none），否则会挡住标签。 */}
                <motion.div
                    className="pointer-events-none absolute flex items-center justify-center rounded-full"
                    style={{
                        top: (54 - TAB_PILL_SIZE) / 2,
                        left: 0,
                        width: TAB_PILL_SIZE,
                        height: TAB_PILL_SIZE,
                        background: 'var(--nt-accent)',
                        // 写死纯白（用户明确要求「白色实心」），不用 onAccent —— 后者在强调色
                        // 偏浅时自动翻成近黑，与「白图标」的视觉约定不符。
                        // 代价是浅强调色主题下对比度会掉下来；若日后要补，
                        // 正确做法是给强调色加深，而不是把图标改回深色。
                        color: '#ffffff',
                    }}
                    initial={false}
                    animate={{ x: pillReady ? pillX : 0 }}
                    transition={reducedTab
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }}
                    aria-hidden
                >
                    {/* key 跟随选中项：切页时换一枚新实例，生长动画才会重播。 */}
                    <NeteaseTabGlyph key={activeGlyph} glyph={activeGlyph} />
                </motion.div>

                {tabs.map((tab, index) => {
                    const active = tab.id === activeId;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            ref={node => { tabRefs.current[index] = node; }}
                            onClick={() => onChange(tab.id)}
                            aria-current={active ? 'page' : undefined}
                            className="relative flex flex-1 flex-col items-center justify-center"
                        >
                            {/* 选中项的内容整体让位给圆球：淡出而不是 display:none，
                                这样切换时没有布局跳动，圆球滑过去的过程本来就是内容交接。 */}
                            <span
                                className="flex flex-col items-center justify-center gap-0.5 transition-opacity"
                                style={{
                                    opacity: active ? 0 : 1,
                                    color: 'var(--nt-text-muted)',
                                    transitionDuration: reducedTab ? '0s' : '0.15s',
                                }}
                            >
                                {tab.icon}
                                {/* 原来 text-[10px] leading-none：行高等于字号，汉字/假名有裁切风险。 */}
                                <span className="nt-t-label">{tab.label}</span>
                            </span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

/** 顶部标题栏：左侧标题、右侧可选操作。滚动时会加深底色，模仿原生导航栏。 */
export const NeteaseHeader: React.FC<{
    title: string;
    /** 标题靠左（首页）还是居中（详情页）。 */
    align?: 'left' | 'center';
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
}> = ({ title, align = 'left', leading, trailing }) => (
    <header
        className="flex min-h-[56px] shrink-0 items-center gap-2 px-4"
        style={align === 'center'
            ? { justifyContent: 'center', position: 'relative' }
            : { justifyContent: 'flex-start' }}
    >
        {leading}
        <h1
            className={`nt-t-display min-w-0 flex-1 truncate ${align === 'left' ? 'text-left' : 'text-center'}`}
            style={{ color: 'var(--nt-text)' }}
        >
            {title}
        </h1>
        {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </header>
);

/**
 * 搜索条。手机版网易云顶部常驻一条，点击进入过滤；
 * 有 query 时右侧出清除键。过滤词通过 onChange 交给宿主（命令面板会话），
 * suite 本身不持有过滤状态。
 */
export const NeteaseSearchBar: React.FC<{
    query: string;
    placeholder: string;
    onQueryChange: (query: string) => void;
}> = ({ query, placeholder, onQueryChange }) => (
    <div className="px-4 pb-2 shrink-0">
        <div
            className="flex items-center gap-2 rounded-full px-3"
            // 高固定 44。**刻意不给纵向内边距**：给了就会叠在高度上——
            // 清除键的 44 触控区 + py-2 的 16 = 整条框被撑到 60px。
            // 改由 min-height 兜底，清除键出现与否高度都不变（实测 48 → 60 的教训）。
            style={{ background: 'var(--nt-field)', minHeight: 'var(--nt-touch-min)' }}
        >
            <Search size={18} className="shrink-0" style={{ color: 'var(--nt-text-muted)' }} />
            <input
                value={query}
                onChange={event => onQueryChange(event.target.value)}
                placeholder={placeholder}
                // nt-input 提供 ::placeholder 的色。占位符色是**伪元素**，
                // inline style 表达不了，原来它就一直吃浏览器默认值，实测对比度不合格。
                className="nt-input min-w-0 flex-1 bg-transparent outline-none nt-t-item"
                style={{ color: 'var(--nt-text)' }}
            />
            {query.length > 0 && (
                <button
                    type="button"
                    onClick={() => onQueryChange('')}
                    aria-label="clear"
                    // 触控区 44，但**视觉圆点只有 32**。两层分开：按钮本身透明且撑满 44，
                    // 里面再放一颗 32 的实心圆。
                    // 之前图省事把整颗做成 32，触控区就跟着缩到 32 —— 低于 Android 无障碍下限。
                    // 也别图省事直接做成 44 的实心圆：那会让搜索框从 44 撑到 60 高。
                    className="flex shrink-0 items-center justify-center rounded-full"
                    style={{ width: 'var(--nt-touch-min)', height: 'var(--nt-touch-min)' }}
                >
                    <span
                        className="flex items-center justify-center rounded-full"
                        style={{
                            width: 32,
                            height: 32,
                            background: 'var(--nt-text-faint)',
                            color: 'var(--nt-bg)',
                        }}
                    >
                        <X size={14} />
                    </span>
                </button>
            )}
        </div>
    </div>
);

/** 「⋯」菜单里的一项。tone=danger 用危险色（删除一类）。 */
export type NeteaseMenuAction = {
    id: string;
    label: string;
    onSelect: () => void;
    tone?: 'default' | 'danger';
};

/**
 * 「⋯」操作按钮。关键点：**常显**，不做 group-hover。
 * 展开一个轻量下拉，动作由外面传进来（不同 surface 的动作集不同）。
 */
export const NeteaseMoreMenu: React.FC<{
    label: string;
    actions: readonly NeteaseMenuAction[];
}> = ({ label, actions }) => {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef<HTMLDivElement>(null);

    // 点击别处或 Esc 收起。下拉是覆盖在内容之上的浮层，不参与文档流。
    React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                type="button"
                aria-label={label}
                aria-expanded={open}
                onClick={event => {
                    event.stopPropagation();
                    setOpen(value => !value);
                }}
                className="flex items-center justify-center rounded-full transition-colors"
                // 触控区 ≥44：原来 p-2 + 17px 图标 = 33px，低于无障碍下限。
                style={{
                    width: 'var(--nt-touch-min)',
                    height: 'var(--nt-touch-min)',
                    background: open ? 'var(--nt-hover)' : 'transparent',
                }}
            >
                <MoreHorizontal size={18} style={{ color: 'var(--nt-text-muted)' }} />
            </button>
            {open && (
                <div
                    // L2 浮层：radius-lg(16) + 1px 边框 + 投影。改造前是 rounded-xl(12) + shadow-lg，
                    // 圆角比迷你条还小、投影不受控。
                    className="absolute right-0 top-full z-30 mt-1 min-w-[9.5rem] overflow-hidden py-1"
                    style={{
                        background: 'var(--nt-elevated)',
                        border: '1px solid var(--nt-divider)',
                        borderRadius: 'var(--nt-radius-lg)',
                        boxShadow: 'var(--nt-shadow-2)',
                    }}
                >
                    {actions.map(action => (
                        <button
                            key={action.id}
                            type="button"
                            onClick={event => {
                                event.stopPropagation();
                                setOpen(false);
                                action.onSelect();
                            }}
                            // 高 ≥44：原来 px-3 py-3 = 16+24 = 40px，差 4px。
                            className="flex w-full items-center px-3 text-left nt-t-label transition-colors"
                            style={{ minHeight: 'var(--nt-touch-min)', color: action.tone === 'danger' ? 'var(--nt-danger)' : 'var(--nt-text)' }}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/** 歌曲行里左边那个序号 / 正在播放的跳动图标。 */
export const NeteaseTrackIndex: React.FC<{
    index: number;
    isPlaying: boolean;
}> = ({ index, isPlaying }) => (
    <span
        className="w-6 shrink-0 text-center nt-t-meta"
        style={{ color: isPlaying ? 'var(--nt-accent-text)' : 'var(--nt-text-muted)' }}
    >
        {isPlaying ? (
            <span className="inline-flex items-end gap-[2px]" aria-label="now playing">
                {[0, 1, 2].map(bar => (
                    <span
                        key={bar}
                        className="w-[2px] rounded-full"
                        style={{
                            background: 'var(--nt-accent)',
                            height: `${6 + ((bar * 3) % 7)}px`,
                            animation: `nt-eq 900ms ease-in-out ${bar * 160}ms infinite alternate`,
                        }}
                    />
                ))}
            </span>
        ) : (
            index
        )}
    </span>
);

/**
 * 底部播放条（迷你条）。位置与体量照网易云手机版：贴在 tab 栏正上方、左右各留一点边距的胶囊，
 * 左侧小圆封面、中间歌名 + 歌手、右侧播放/暂停与队列键。
 * 点整条进播放页；点右侧两颗按钮不冒泡，避免误触。
 */
export const NeteaseMiniPlayer: React.FC<{
    title: string;
    subtitle: string;
    coverUrl?: string | null;
    isPlaying: boolean;
    seed: string;
    onOpenPlayer: () => void;
    onTogglePlayback: () => void;
    onOpenQueue: () => void;
    /**
     * 播放进度 0..1。缺省 0（不画进度条）。调用方用 useNeteaseProgress 取真实值。
     * 传数字而不是在组件里订阅，是为了让 suite 的其它 surface 也能复用同一个 hook，
     * 也让这个纯展示组件保持无 store 依赖（可以直接渲染、单测）。
     */
    progress?: number;
}> = ({ title, subtitle, coverUrl, isPlaying, seed, onOpenPlayer, onTogglePlayback, onOpenQueue, progress = 0 }) => (
    <div className="shrink-0 px-4 pb-2">
        <div
            role="button"
            tabIndex={0}
            onClick={onOpenPlayer}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenPlayer();
                }
            }}
            // relative + overflow-hidden：进度条绝对贴在胶囊底边（网易云迷你条同款），靠这一层裁掉。
            className="relative flex items-center gap-2 overflow-hidden px-2 py-2"
            style={{
                background: 'var(--nt-elevated)',
                border: '1px solid var(--nt-divider)',
                // 圆角统一到 radius-lg(16)（规格 §4.3：底部区只统一视觉，不改结构）。
                // 投影**刻意不加**：迷你条与 tab 栏同层，两者都加投影会打架。
                borderRadius: 'var(--nt-radius-lg)',
            }}
        >
            {/* 封面 44px：网易云迷你条的封面是 40dp 圆角小方块。
                顺带把 40→44，理由同外层容器——它是这颗圆角里唯一被点到的部位。 */}
            <div
                className="h-11 w-11 shrink-0 overflow-hidden"
                style={{ ...placeholderTint(seed, false), borderRadius: 'var(--nt-radius-sm)' }}
            >
                {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                    <span className="flex h-full w-full items-center justify-center">
                        <Disc3 size={16} style={{ color: 'var(--nt-text-faint)' }} />
                    </span>
                )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate nt-t-item" style={{ color: 'var(--nt-text)' }}>
                    {title}
                </span>
                <span className="truncate nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                    {subtitle}
                </span>
            </div>

            <button
                type="button"
                aria-label={isPlaying ? '暂停' : '播放'}
                onClick={event => {
                    event.stopPropagation();
                    onTogglePlayback();
                }}
                className="flex shrink-0 items-center justify-center rounded-full"
                // 触控区 ≥44：原来 p-2 + 19px 图标 = 35px。
                style={{ width: 'var(--nt-touch-min)', height: 'var(--nt-touch-min)' }}
            >
                {isPlaying
                    ? <Pause size={19} fill="var(--nt-text)" style={{ color: 'var(--nt-text)' }} />
                    : <Play size={19} fill="var(--nt-text)" style={{ color: 'var(--nt-text)' }} />}
            </button>
            <button
                type="button"
                aria-label="播放队列"
                onClick={event => {
                    event.stopPropagation();
                    onOpenQueue();
                }}
                className="flex shrink-0 items-center justify-center rounded-full"
                style={{ width: 'var(--nt-touch-min)', height: 'var(--nt-touch-min)' }}
            >
                <ListMusic size={18} style={{ color: 'var(--nt-text)' }} />
            </button>

            {/* 进度条：胶囊底边一条 2dp 细线，只在真正在播且时长已知时画（网易云迷你条同款）。
                transform: scaleX 由档位提交驱动，不写 width —— 后者每帧都会触发重排。 */}
            {isPlaying && progress > 0 && (
                <span
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left"
                    style={{
                        background: 'var(--nt-accent)',
                        transform: `scaleX(${progress})`,
                    }}
                />
            )}
        </div>
    </div>
);

/** 圆形播放 / 暂停主按钮。collection 头部用。 */
export const NeteasePlayButton: React.FC<{
    isPlaying: boolean;
    label: string;
    onClick: () => void;
    size?: number;
}> = ({ isPlaying, label, onClick, size = 56 }) => (
    <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
        style={{ width: size, height: size, background: 'var(--nt-accent)' }}
    >
        {isPlaying
            ? <span className="flex gap-[3px]">{[0, 1].map(bar => (
                <span
                    key={bar}
                    className="w-[3px] rounded-full"
                    style={{
                        background: 'var(--nt-on-accent)',
                        height: `${size * 0.3}px`,
                        animation: 'nt-eq 800ms ease-in-out infinite alternate',
                    }}
                />
            ))}</span>
            : <Play size={size * 0.42} fill="var(--nt-on-accent)" style={{ color: 'var(--nt-on-accent)' }} />}
    </button>
);

/** 分区标题（列表上方的灰字小标题）。 */
export const NeteaseSectionTitle: React.FC<{ children: React.ReactNode; count?: number }> = ({ children, count }) => (
    <div className="flex items-baseline gap-2 px-4 pb-2 pt-6">
        <span className="nt-t-title" style={{ color: 'var(--nt-text)' }}>{children}</span>
        {typeof count === 'number' && (
            <span className="nt-t-meta" style={{ color: 'var(--nt-text-muted)' }}>{count}</span>
        )}
    </div>
);

/**
 * 空状态占位。列表为空时给一句说明，不留白屏。
 *
 * `fill` 区分两种用法，这个区分是必需的：
 * - **整屏空态**（未登录、歌单空、艺人无内容）—— 内容区整块都是空的，
 *   文案该**真居中**。改造前它只在 1/4 高度处，底下留一大片无意义留白。
 * - **区块内嵌空态**（某个推荐位加载中、某组没有专辑）—— 这时父容器里
 *   还有别的区块，居中反而会把它顶到奇怪的位置，保持原来的顶部排布。
 * 一刀切改成居中会把后者做坏，所以用 props 分开。
 */
export const NeteaseEmpty: React.FC<{ message: string; hint?: string; fill?: boolean }> = ({ message, hint, fill = false }) => (
    <div
        className={`flex flex-col items-center justify-center gap-1 px-8 text-center ${fill ? 'min-h-full py-16' : 'py-16'}`}
    >
        <p className="nt-t-title" style={{ color: 'var(--nt-text-muted)' }}>{message}</p>
        {hint && <p className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>{hint}</p>}
    </div>
);

/** 折叠区块（歌单详情的「简介」等），默认收起。 */
export const NeteaseCollapsible: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                className="flex w-full items-center justify-between px-4 py-3"
            >
                <span className="nt-t-item" style={{ color: 'var(--nt-text-muted)' }}>{label}</span>
                <ChevronDown
                    size={16}
                    style={{
                        color: 'var(--nt-text-muted)',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 180ms ease',
                    }}
                />
            </button>
            {open && <div className="px-4 pb-3 nt-t-meta" style={{ color: 'var(--nt-text-muted)' }}>{children}</div>}
        </div>
    );
};

/** 等距数字里的分钟秒（手机版列表右侧）。 */
export const formatTrackDuration = (durationMs?: number): string => {
    if (!durationMs || durationMs <= 0) return '';
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** 全 suite 共用的样式表：字阶、滚动条隐藏、均衡器动画。
 *
 *  安全区**不在这张表里**：底部避让由 useSafeInsets 量出来，以内联 padding 施加
 *  （env(safe-area-inset-bottom) 在本机恒为 0，写进 CSS 等于没写）。
 *
 *  字阶（2026-10-15 重设计第二步）：**六级，锁死字号 + 字重 + 行高**，组件不再自己写
 *  text-sm / text-[13px]。改之前实测出来的现状是 7 个字号挤在 10–16px、页标题只比卡片
 *  标题大 3px、行高比在 1.00 / 1.25 / 1.33 / 1.43 / 1.50 之间混用——主次几乎消失。
 *
 *  行高**跟字号档走，不跟组件走**：≥17px 给 1.4 倍，其余 1.38–1.45。
 *  这条直接修掉一个 bug 级取值：底部 tab 标签原来是 text-[10px] leading-none，
 *  **行高等于字号**，「专辑」「推荐」这些汉字和假名有溢出裁切风险。
 *
 *  tabular-nums：时长、计数、序号一律等宽数字，修掉列表滚动时数字宽度跳动。
 */
export const NETEASE_STYLES = `
.nt-t-display { font-size:24px; font-weight:700; line-height:32px; letter-spacing:-.3px; font-variant-numeric:tabular-nums; }
.nt-t-title   { font-size:17px; font-weight:600; line-height:24px; letter-spacing:-.1px; font-variant-numeric:tabular-nums; }
.nt-t-item    { font-size:15px; font-weight:500; line-height:21px; font-variant-numeric:tabular-nums; }
.nt-t-meta    { font-size:13px; font-weight:400; line-height:18px; font-variant-numeric:tabular-nums; }
.nt-t-label   { font-size:12px; font-weight:500; line-height:16px; letter-spacing:.2px; }
.nt-t-caption { font-size:11px; font-weight:400; line-height:15px; font-variant-numeric:tabular-nums; }

/* 占位符色是伪元素，inline style 表达不了，必须走这条规则。
   改造前搜索框占位符一直吃浏览器默认值，实测对 --nt-field 的对比度不合格。 */
.nt-input::placeholder { color: var(--nt-text-faint); opacity: 1; }

@keyframes nt-eq { from { transform: scaleY(0.45); } to { transform: scaleY(1); } }
.nt-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; }
.nt-scroll::-webkit-scrollbar { display: none; }
.nt-scroll { scrollbar-width: none; }
`;

/**
 * 铺一层「页面底色 + 全套配色变量」的外壳，四个 surface 共用。
 *
 * `surface` 非空时切成分层变体（歌单 / 歌手页）。**这不是样式偏好，是宿主的层叠契约**：
 * 集合层挂在首页挂载点（App.tsx 的 `absolute inset-0 z-10`）里，而宿主的转场背景板
 * （GridViewOverlayHost.tsx:654）是它的兄弟节点、`fixed z-[49]` 且不透明。
 * 集合 surface 不自己抬到 49 之上，就整页被那层底板盖住 —— DOM 里内容齐全、命中测试也正常
 * （底板是 pointer-events-none），但屏幕上就是一片空白。三套内建 UI 都自带这一层：
 * GridView `z-[110]` / ArtistGridView `z-50` / TUI 两个 surface 都 `z-[110]`
 * （契约写在 grid/transitions/morphGeometry.ts:135-140 的注释里）。
 *
 * 首页不能这么干：它本来就该待在 home mount point 的层叠上下文里，由宿主决定可见性。
 */
export const NeteaseShell: React.FC<{
    palette: NeteasePalette;
    /** 传 'collection' / 'artist' 表示这是叠在首页之上的层；首页不传。 */
    surface?: 'collection' | 'artist';
    children: React.ReactNode;
}> = ({ palette, surface, children }) => {
    const insets = useSafeInsets();
    return (
        <div
            className={surface ? 'fixed inset-0 z-[110] flex flex-col overflow-hidden' : 'flex h-full min-h-0 flex-col'}
            style={{
                background: 'var(--nt-bg)',
                color: 'var(--nt-text)',
                // 安卓端专属的自带无衬线族（--nt-font 定义见 neteaseTheme.ts）。
                // 2026-10-15 真机实测：安卓端原本没锁字体，整套 UI 跟着设备的 sans-serif
                // 通用回退走，在一加 Ace 3 上被解析成宋体（横细竖粗 + 三角衬线末端）。
                // 挂在最外层这一处，四个 surface 一次全生效。
                // **只在安卓端挂**：桌面端的 netease suite 观感保持原样，不跟着变。
                fontFamily: isAndroidShell() ? 'var(--nt-font)' : undefined,
                // 状态栏避让。immersive 全屏（insetsHandling: 'disable'）下内容会铺到状态栏底下，
                // 而本套件所有页面顶部都是「52px 标题栏顶到 y=0」的写法，没有一处留状态栏高度 ——
                // 真机实测（2026-10-15 一加 Ace 3 / PJE110）header top:0、标题 h1 top:14~38，
                // 而 env(safe-area-inset-top)=40：标题整个埋在状态栏里。
                // 垫在最外层而不是各页 header 里：底色照样铺满状态栏区域（视觉上是导航栏延伸上去），
                // 只有内容下移；四个 surface 一次全修，改一处不会漏。
                // 底部不归这里管：底栏/迷你条的避让是各页自己用 bottomBarPadding(insets) 内联施加的。
                paddingTop: insets.top,
                ...paletteToCssVars(palette),
            }}
            data-netease-root="true"
            // 转场测量与 dev 的 renderer 切换按这两个属性定位当前层（见 morphGeometry 的说明）。
            data-library-renderer={surface ? 'netease' : undefined}
            data-library-surface={surface}
        >
            <style>{NETEASE_STYLES}</style>
            {children}
        </div>
    );
};