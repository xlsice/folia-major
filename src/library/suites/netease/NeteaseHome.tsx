import React from 'react';
import { Compass, FolderOpen, ListMusic, Radio, RefreshCw, Plus, HardDrive, Library as LibraryIcon, Server, User } from 'lucide-react';
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

// entry.ts 不能静态 import 推移模块（registry 是 eager glob 扫所有 entry 的），
// 由本模块把本套的转场声明转出去，四个 lazy loader 在 resolve 时灌进 manifest 的空壳。
export { neteaseTransitions } from './neteaseLayerTransition';
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
    const [tab, setTab] = React.useState<HomeTabId>('discover');
    // 推移方向。必须和 setTab 同一个渲染里落定，退场的那一页才知道该往哪边退。
    const [tabDirection, setTabDirection] = React.useState<1 | -1>(1);
    // 与集合层的整层推移共用同一个动效面（collectionMorph），用户关一次两边一起停。
    const reducedSlide = useReducedMotionFor('collectionMorph');
    const [query, setQuery] = React.useState('');

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
                        className="absolute bottom-1.5 right-2 nt-t-caption"
                        style={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                    >
                        {collection.trackCount > 999 ? '999+' : collection.trackCount}
                    </span>
                )}
            </div>
            <span className="truncate nt-t-item" style={{ color: 'var(--nt-text)' }}>
                {collection.name}
            </span>
            {typeof collection.trackCount === 'number' && (
                <span className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                    {collection.trackCount} 首
                </span>
            )}
        </button>
    );

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
                            <span className="nt-t-item" style={{ color: 'var(--nt-text)' }}>
                                每日推荐
                            </span>
                            {dailyCount > 0 && (
                                <span className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>{dailyCount} 首</span>
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
                            <span className="nt-t-item" style={{ color: 'var(--nt-text)' }}>私人 FM</span>
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
                            <CollectionCard key={String(collection.id)} collection={collection} />
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

    /** 我的页（最后一屏）：登录用户自己的歌单 + 收藏 + 云盘。 */
    const renderMineTab = () => {
        if (!user) {
            return (
                <NeteaseEmpty
                    message="未登录"
                    hint="登录网易云后这里会显示你的歌单"
                    fill
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
                        <div className="truncate nt-t-display" style={{ color: 'var(--nt-text)' }}>
                            {user.nickname}
                        </div>
                        <div className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                            {onlineCollections.length} 个歌单
                        </div>
                    </div>
                </div>

                <NeteaseSectionTitle count={onlineCollections.length}>我创建的歌单</NeteaseSectionTitle>
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
                    <div className="flex items-center gap-3 px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: 'var(--nt-hover)' }}>
                            <ListMusic size={17} style={{ color: 'var(--nt-text-muted)' }} />
                        </span>
                        <span className="flex-1 nt-t-title" style={{ color: 'var(--nt-text)' }}>全部歌曲</span>
                        <span className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>{localSongs.length}</span>
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
                            <span className="flex-1 truncate text-left nt-t-item" style={{ color: 'var(--nt-text)' }}>{item.name}</span>
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
                    <span className="flex-1 text-left nt-t-item" style={{ color: 'var(--nt-text)' }}>连接自建音乐库</span>
                </button>
            </div>
        </>
    );

    // 顺序同网易云：推荐在第一屏，「我的」在最后一屏
    const tabs: readonly { id: string; label: string; icon: React.ReactNode }[] = [
        { id: 'discover', label: TAB_LABELS.discover, icon: <Compass size={19} /> },
        { id: 'local', label: TAB_LABELS.local, icon: <HardDrive size={18} /> },
        { id: 'albums', label: TAB_LABELS.albums, icon: <LibraryIcon size={18} /> },
        { id: 'navidrome', label: TAB_LABELS.navidrome, icon: <Server size={18} /> },
        { id: 'mine', label: TAB_LABELS.mine, icon: <User size={18} /> },
    ];

    /** 当前标签页的内容。抽出来是为了让推移组件只按 tab id 换页，不关心每页长什么样。 */
    const renderTabContent = (current: HomeTabId) => {
        switch (current) {
            case 'discover': return renderDiscoverTab();
            case 'local': return renderLocalTab();
            case 'albums': return renderAlbumsTab();
            case 'navidrome': return renderRemoteTab();
            case 'mine': return renderMineTab();
        }
    };

    return (
        <NeteaseShell palette={palette}>
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
            <NeteaseSearchBar query={query} placeholder="搜索歌单" onQueryChange={applyQuery} />

            {/* 两层：外层裁切（推移时不让翻出去的半页漏到界面上），内层才滚动。
                推移期间新旧两页同时在 DOM 里（退场那页靠 AnimatePresence 留到动画结束），
                所以内层必须 absolute 叠在同一块地方，不能靠文档流排下去。 */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <NeteasePageSlide
                    slideKey={tab}
                    direction={tabDirection}
                    reduced={reducedSlide}
                    className="nt-scroll absolute inset-0 pb-4"
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
