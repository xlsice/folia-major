import React from 'react';

// src/library/suites/netease/neteaseParts.tsx
// netease suite 的共享零件。拆出来是因为四个 surface 反复用到同一批东西，
// 而每一批都是「上一轮 group-hover 隐身」的高发区——这里一律常显，不做悬停显形。

import { useState } from 'react';
import { ChevronDown, MoreHorizontal, Play, Search, X } from 'lucide-react';
import { paletteToCssVars, type NeteasePalette } from './neteaseTheme';

/** 底部标签栏。网易云手机版的核心导航：常驻底部，选中项高亮（accent 来自当前主题）。 */
export const NeteaseTabBar: React.FC<{
    tabs: readonly { id: string; label: string }[];
    activeId: string;
    onChange: (id: string) => void;
}> = ({ tabs, activeId, onChange }) => (
    <nav
        className="flex shrink-0 items-stretch border-t"
        style={{ background: 'var(--nt-elevated)', borderColor: 'var(--nt-divider)' }}
    >
        {tabs.map(tab => {
            const active = tab.id === activeId;
            return (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => onChange(tab.id)}
                    aria-current={active ? 'page' : undefined}
                    className="flex-1 py-2.5 text-xs font-medium transition-colors"
                    style={{ color: active ? 'var(--nt-accent)' : 'var(--nt-text-muted)' }}
                >
                    {tab.label}
                </button>
            );
        })}
    </nav>
);

/** 顶部标题栏：左侧标题、右侧可选操作。滚动时会加深底色，模仿原生导航栏。 */
export const NeteaseHeader: React.FC<{
    title: string;
    /** 标题靠左（首页）还是居中（详情页）。 */
    align?: 'left' | 'center';
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
}> = ({ title, align = 'left', leading, trailing }) => (
    <header
        className="flex min-h-[52px] shrink-0 items-center gap-2 px-3"
        style={align === 'center'
            ? { justifyContent: 'center', position: 'relative' }
            : { justifyContent: 'flex-start' }}
    >
        {leading}
        <h1
            className={`min-w-0 flex-1 truncate text-base font-semibold ${align === 'left' ? 'text-left' : 'text-center'}`}
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
    <div className="px-3 pb-2 shrink-0">
        <div
            className="flex items-center gap-2 rounded-full px-3 py-2"
            style={{ background: 'var(--nt-field)' }}
        >
            <Search size={15} className="shrink-0" style={{ color: 'var(--nt-text-faint)' }} />
            <input
                value={query}
                onChange={event => onQueryChange(event.target.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--nt-text)' }}
            />
            {query.length > 0 && (
                <button
                    type="button"
                    onClick={() => onQueryChange('')}
                    aria-label="clear"
                    className="shrink-0 rounded-full p-0.5"
                    style={{ background: 'var(--nt-text-faint)' }}
                >
                    <X size={11} style={{ color: 'var(--nt-bg)' }} />
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
                className="rounded-full p-2 transition-colors"
                style={{ background: open ? 'var(--nt-hover)' : 'transparent' }}
            >
                <MoreHorizontal size={17} style={{ color: 'var(--nt-text-muted)' }} />
            </button>
            {open && (
                <div
                    className="absolute right-0 top-full z-30 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl py-1 shadow-lg"
                    style={{ background: 'var(--nt-elevated)', border: '1px solid var(--nt-divider)' }}
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
                            className="block w-full px-3 py-2.5 text-left text-sm transition-colors"
                            style={{
                                color: action.tone === 'danger' ? '#e5484d' : 'var(--nt-text)',
                            }}
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
        className="w-6 shrink-0 text-center text-xs tabular-nums"
        style={{ color: isPlaying ? 'var(--nt-accent)' : 'var(--nt-text-faint)' }}
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

/** 圆形播放 / 暂停主按钮。collection 头部用。 */
export const NeteasePlayButton: React.FC<{
    isPlaying: boolean;
    label: string;
    onClick: () => void;
    size?: number;
}> = ({ isPlaying, label, onClick, size = 44 }) => (
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
    <div className="flex items-baseline gap-2 px-4 pb-1.5 pt-4">
        <span className="text-sm font-semibold" style={{ color: 'var(--nt-text)' }}>{children}</span>
        {typeof count === 'number' && (
            <span className="text-xs" style={{ color: 'var(--nt-text-faint)' }}>{count}</span>
        )}
    </div>
);

/** 空状态占位。列表为空时给一句说明，不留白屏。 */
export const NeteaseEmpty: React.FC<{ message: string; hint?: string }> = ({ message, hint }) => (
    <div className="flex flex-col items-center justify-center gap-1 px-8 py-16 text-center">
        <p className="text-sm" style={{ color: 'var(--nt-text-muted)' }}>{message}</p>
        {hint && <p className="text-xs" style={{ color: 'var(--nt-text-faint)' }}>{hint}</p>}
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
                <span className="text-sm" style={{ color: 'var(--nt-text-muted)' }}>{label}</span>
                <ChevronDown
                    size={15}
                    style={{
                        color: 'var(--nt-text-faint)',
                        transform: open ? 'rotate(180deg)' : 'none',
                        transition: 'transform 180ms ease',
                    }}
                />
            </button>
            {open && <div className="px-4 pb-3 text-sm" style={{ color: 'var(--nt-text-muted)' }}>{children}</div>}
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

/** 全 suite 共用的样式表：滚动条隐藏、均衡器动画、底部安全区。 */
export const NETEASE_STYLES = `
@keyframes nt-eq { from { transform: scaleY(0.45); } to { transform: scaleY(1); } }
.nt-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; }
.nt-scroll::-webkit-scrollbar { display: none; }
.nt-scroll { scrollbar-width: none; }
.nt-safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
`;

/** 铺一层「页面底色 + 全套配色变量」的外壳，四个 surface 共用。 */
export const NeteaseShell: React.FC<{
    palette: NeteasePalette;
    children: React.ReactNode;
}> = ({ palette, children }) => (
    <div
        className="flex h-full min-h-0 flex-col"
        style={{ background: 'var(--nt-bg)', color: 'var(--nt-text)', ...paletteToCssVars(palette) }}
        data-netease-root="true"
    >
        <style>{NETEASE_STYLES}</style>
        {children}
    </div>
);