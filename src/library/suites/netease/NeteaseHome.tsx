import React from 'react';
import { FolderOpen, ListMusic, Radio, RefreshCw, Plus } from 'lucide-react';
import type { LibraryHomeSurfaceProps } from '../../core/contracts/suite';
import type { ProviderCollection } from '../../../types/onlineMusic';
import { buildNeteasePalette, placeholderTint } from './neteaseTheme';
import {
    NeteaseEmpty,
    NeteaseHeader,
    NeteaseMoreMenu,
    NeteaseSearchBar,
    NeteaseSectionTitle,
    NeteaseShell,
    NeteaseTabBar,
} from './neteaseParts';

// src/library/suites/netease/NeteaseHome.tsx
// netease suite 的首页：手机版网易云的结构 —— 常驻搜索条 + 横向歌单卡 + 底部标签栏。
//
// 跟 bravais 的根本差别：bravais 把内容铺成一整面「墙」，导航靠缝裂开；
// 这里是一列可纵向滚动的列表，卡片是方图，切换靠底部标签栏。两套共用同一份契约数据，
// 换 suite 只换画法，不换数据源。

type HomeTabId = 'playlist' | 'local' | 'albums' | 'navidrome';

const TAB_LABELS: Record<HomeTabId, string> = {
    playlist: '在线',
    local: '本地',
    albums: '专辑',
    navidrome: '远程',
};

const NeteaseHome: React.FC<LibraryHomeSurfaceProps> = ({
    declaredActions,
    playlists,
    localPlaylists,
    localSongs,
    user,
    theme,
    isInteractive,
    onPlaySong,
    onOpenGridView,
    onSearchCommitted,
    onRefreshUser,
    onRefreshLocalSongs,
    onStatusMessage,
    homeResources,
    localMusicState,
    setLocalMusicState,
}) => {
    const can = new Set(declaredActions.actions);
    const [tab, setTab] = React.useState<HomeTabId>('playlist');
    const [query, setQuery] = React.useState('');

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

    const needle = query.trim().toLowerCase();
    const matchName = (name?: string | null) => !needle || (name ?? '').toLowerCase().includes(needle);

    // 搜索词提交给宿主的浏览会话（命令面板 / grid 那一侧读它），
    // 本地同时做一遍即时过滤，两边都不阻塞。
    const applyQuery = (next: string) => {
        setQuery(next);
        onSearchCommitted(next, tab);
    };

    const onlineCollections = React.useMemo(
        () => playlists.filter(item => matchName(item.name)),
        [playlists, needle],
    );

    const openCollection = (collection: ProviderCollection) => onOpenGridView({
        id: collection.id,
        providerId: collection.providerId,
        name: collection.name,
        type: collection.type,
    } as Parameters<typeof onOpenGridView>[0]);

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

    /** 歌单大卡：方图 + 名称 + 曲数，右上角常显的「⋯」。 */
    const CollectionCard: React.FC<{ collection: ProviderCollection }> = ({ collection }) => (
        <button
            type="button"
            disabled={!isInteractive}
            onClick={() => openCollection(collection)}
            className="flex w-full flex-col gap-2 text-left"
        >
            <div className="relative aspect-square w-full overflow-hidden rounded-xl" style={placeholderTint(String(collection.id), isDaylight)}>
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
                        className="absolute bottom-1.5 right-2 text-[11px] tabular-nums"
                        style={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                    >
                        {collection.trackCount > 999 ? '999+' : collection.trackCount}
                    </span>
                )}
            </div>
            <span className="truncate text-[13px] leading-tight" style={{ color: 'var(--nt-text)' }}>
                {collection.name}
            </span>
            {typeof collection.trackCount === 'number' && (
                <span className="text-[11px]" style={{ color: 'var(--nt-text-faint)' }}>
                    {collection.trackCount} 首
                </span>
            )}
        </button>
    );

    const renderPlaylistTab = () => {
        if (!user) {
            return (
                <NeteaseEmpty
                    message="未登录"
                    hint="在「我的」标签页登录后，这里会显示你的歌单"
                />
            );
        }
        if (onlineCollections.length === 0) {
            return <NeteaseEmpty message={needle ? '没有匹配的歌单' : '还没有歌单'} hint="去「我的」页导入或创建" />;
        }
        return (
            <>
                <NeteaseSectionTitle count={onlineCollections.length}>我的歌单</NeteaseSectionTitle>
                <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 sm:grid-cols-3">
                    {onlineCollections.map(collection => (
                        <CollectionCard key={String(collection.id)} collection={collection} />
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
                    <div className="flex items-center gap-3 px-4 py-3.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--nt-hover)' }}>
                            <ListMusic size={17} style={{ color: 'var(--nt-text-muted)' }} />
                        </span>
                        <span className="flex-1 text-sm" style={{ color: 'var(--nt-text)' }}>全部歌曲</span>
                        <span className="text-xs" style={{ color: 'var(--nt-text-faint)' }}>{localSongs.length}</span>
                    </div>
                    {localCards.map(item => (
                        <button
                            key={String(item.id)}
                            type="button"
                            onClick={() => setLocalMusicState({ ...localMusicState, activeRow: 1 as 0 | 1 | 2 | 3 })}
                            className="flex w-full items-center gap-3 px-4 py-3.5"
                            style={{ borderTop: '1px solid var(--nt-divider)' }}
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--nt-hover)' }}>
                                <FolderOpen size={16} style={{ color: 'var(--nt-text-muted)' }} />
                            </span>
                            <span className="flex-1 truncate text-left text-sm" style={{ color: 'var(--nt-text)' }}>{item.name}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-3 flex gap-2 px-4">
                {can.has('home-import-folder') && (
                    <button
                        type="button"
                        onClick={() => setLocalMusicState({ ...localMusicState, activeRow: 0 as 0 | 1 | 2 | 3 })}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-xs"
                        style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                    >
                        <Plus size={14} />导入
                    </button>
                )}
                {can.has('home-refresh-folders') && (
                    <button
                        type="button"
                        onClick={() => void onRefreshLocalSongs()}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-xs"
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
                                <CollectionCard key={String(collection.id)} collection={collection} />
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
                    <span className="flex-1 text-left text-sm" style={{ color: 'var(--nt-text)' }}>连接自建音乐库</span>
                </button>
            </div>
        </>
    );

    const tabs: readonly { id: string; label: string }[] = [
        { id: 'playlist', label: TAB_LABELS.playlist },
        { id: 'local', label: TAB_LABELS.local },
        { id: 'albums', label: TAB_LABELS.albums },
        { id: 'navidrome', label: TAB_LABELS.navidrome },
    ];

    return (
        <NeteaseShell palette={palette}>
            <NeteaseHeader
                title="音乐库"
                trailing={(
                    <NeteaseMoreMenu
                        label="更多"
                        actions={[
                            { id: 'refresh', label: '刷新', onSelect: () => void onRefreshLocalSongs() },
                            { id: 'account', label: '账户', onSelect: () => setTab('playlist') },
                        ]}
                    />
                )}
            />
            <NeteaseSearchBar query={query} placeholder="搜索歌单" onQueryChange={applyQuery} />

            <div className="nt-scroll min-h-0 flex-1 pb-4">
                {tab === 'playlist' && renderPlaylistTab()}
                {tab === 'local' && renderLocalTab()}
                {tab === 'albums' && renderAlbumsTab()}
                {tab === 'navidrome' && renderRemoteTab()}
            </div>

            <div className="nt-safe-bottom shrink-0">
                <NeteaseTabBar tabs={tabs} activeId={tab} onChange={id => setTab(id as HomeTabId)} />
            </div>
        </NeteaseShell>
    );
};

export default NeteaseHome;