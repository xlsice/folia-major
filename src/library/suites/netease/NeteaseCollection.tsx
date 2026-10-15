import React from 'react';
import { ChevronLeft, Download, ListPlus, Play, Share2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { SongResult } from '../../../types';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';
import { buildNeteasePalette, placeholderTint } from './neteaseTheme';
import { useSafeInsets } from './useSafeInsets';
import { NETEASE_HERO_ATTR, NETEASE_HERO_KEY_ATTR } from './neteaseMorph';
import { useNeteaseCurrentKey, useNeteaseIsPlaying, useNeteaseScopePlaying } from './useNeteasePlayback';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import {
    NeteaseCollapsible,
    NeteaseEmpty,
    NeteaseMoreMenu,
    NeteasePlayButton,
    NeteaseShell,
    NeteaseTrackIndex,
    formatTrackDuration,
    type NeteaseMenuAction,
} from './neteaseParts';

// entry.ts 不能静态 import 推移模块，由本模块把转场声明转出去。见 NeteaseHome 里的同一句说明。
export { neteaseTransitions } from './neteaseLayerTransition';

// src/library/suites/netease/NeteaseCollection.tsx
// netease suite 的歌单 / 专辑详情：手机版网易云的详情结构 ——
// 顶部返回栏 → 大封面 + 名称 + 播放按钮 → 操作条 → 歌曲列表（序号 / 标题 / ⋯ 常显）。
//
// 资源是订阅式快照（resource.getSnapshot + subscribe），不是数组：
// 用 useSyncExternalStore 订阅它，取到的 snapshot 每次变化都是新对象，React 能正常比对。

const useIsDaylight = (backgroundColor: string | undefined): boolean => React.useMemo(() => {
    const match = /^#?([0-9a-f]{6})$/i.exec((backgroundColor ?? '').trim());
    if (!match) return false;
    const n = parseInt(match[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}, [backgroundColor]);

const NeteaseCollection: React.FC<LibraryCollectionSurfaceProps> = ({
    collection,
    resource,
    playback,
    mutations,
    theme,
    declaredActions,
    isInteractive,
    onBack,
    onOpenAlbum,
    onOpenArtist,
    onStatusMessage,
}) => {
    const snapshot = useSyncExternalStore(
        React.useCallback(listener => resource?.subscribe(listener) ?? (() => {}), [resource]),
        React.useCallback(() => resource?.getSnapshot() ?? null, [resource]),
    );

    // mutations 同样是订阅式快照（订阅态、可加入的歌单、能力都在里面）
    const mutationsSnapshot = useSyncExternalStore(
        React.useCallback(listener => mutations?.subscribe(listener) ?? (() => {}), [mutations]),
        React.useCallback(() => mutations?.getSnapshot() ?? null, [mutations]),
    );

    const can = new Set(declaredActions.actions);
    const isDaylight = useIsDaylight(theme?.backgroundColor);
    const palette = React.useMemo(() => buildNeteasePalette(theme, isDaylight), [theme, isDaylight]);
    const insets = useSafeInsets();

    const tracks: SongResult[] = snapshot?.tracks ?? [];
    const detail = snapshot?.detail ?? null;

    // 播放态提到组件顶层订阅：renderRow 是普通函数不是组件，不能在里面调 hook。
    // 序号与「播放全部」按钮都要用；之前两处都是写死的 false。
    const scopePlaying = useNeteaseScopePlaying(tracks);
    const playingKey = useNeteaseCurrentKey();
    const isPlayingNow = useNeteaseIsPlaying();
    const rowPlaying = (track: SongResult) => (
        isPlayingNow && playingKey !== null && getPlaybackSongKey(track) === playingKey
    );
    const title = detail?.name || collection.name;
    // 落点那张图优先用快照里的真实封面（更高清、与歌单一致），拿不到才退回描述符里那个。
    const heroCover = detail?.coverUrl || collection.coverUrl || null;

    const headerActions = React.useMemo(() => {
        const entries: NeteaseMenuAction[] = [];
        if (can.has('rename')) {
            entries.push({ id: 'rename', label: '重命名', onSelect: () => mutations?.rename?.(title) });
        }
        if (can.has('export-playlist')) {
            entries.push({ id: 'export', label: '导出歌单', onSelect: () => mutations?.exportPlaylist?.() });
        }
        if (can.has('delete-collection')) {
            entries.push({ id: 'delete', label: '删除歌单', onSelect: () => mutations?.deleteCollection?.(), tone: 'danger' });
        }
        if (can.has('reload')) {
            entries.push({ id: 'reload', label: '重新加载', onSelect: () => resource?.reload() });
        }
        return entries;
    }, [can, mutations, title, resource]);

    const trackActions = (track: SongResult, index: number) => {
        const entries: NeteaseMenuAction[] = [
            { id: 'play-next', label: '下一首播放', onSelect: () => playback.enqueueTrack(track) },
            { id: 'enqueue', label: '添加到队列', onSelect: () => playback.enqueueTrack(track) },
        ];
        if (can.has('remove-entry') && mutations?.removeEntry) {
            entries.push({
                id: 'remove',
                label: '从歌单移除',
                tone: 'danger',
                onSelect: () => {
                    // removeEntry 要的是 entryKey（`${playbackKey}-${occurrence}`），不是 track；
                    // 资源侧的删除走 removeTracks 按歌匹配。
                    void mutations.removeEntry?.({
                        entryKey: `${String(track.id)}-${index}`,
                        track,
                    });
                    void resource?.removeTracks(candidate => candidate.id === track.id);
                },
            });
        }
        if (can.has('add-to-playlist')) {
            const target = mutationsSnapshot?.availablePlaylists?.[0];
            entries.push({
                id: 'add-to',
                label: '添加到歌单',
                onSelect: () => {
                    if (target) void mutations?.addToPlaylist?.(target.id, [track]);
                },
            });
        }
        if (can.has('open-artist')) {
            entries.push({ id: 'go-artist', label: '查看歌手', onSelect: () => onOpenArtist(track.artists?.[0]?.id ?? track.name, undefined, track) });
        }
        return entries;
    };

    const renderRow = (track: SongResult, index: number) => {
        const artistName = track.artists?.map(a => a.name).join(' / ') || '';
        return (
            <div
                key={`${String(track.id)}-${index}`}
                className="flex items-center gap-2 px-4 py-2"
                style={{ borderTop: index === 0 ? 'none' : '1px solid var(--nt-divider)' }}
            >
                <NeteaseTrackIndex index={index + 1} isPlaying={rowPlaying(track)} />
                <button
                    type="button"
                    disabled={!isInteractive}
                    onClick={() => playback.playTrack(track, tracks)}
                    className="flex min-w-0 flex-1 flex-col items-start py-0.5 text-left"
                >
                    <span
                        className="max-w-full truncate nt-t-item"
                        style={{ color: 'var(--nt-text)' }}
                    >
                        {track.name}
                    </span>
                    <span className="max-w-full truncate nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                        {artistName}
                    </span>
                </button>
                <span className="shrink-0 nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                    {formatTrackDuration(track.durationMs)}
                </span>
                {/* ⋯ 常显 */}
                <NeteaseMoreMenu label="更多操作" actions={trackActions(track, index)} />
            </div>
        );
    };

    return (
        <NeteaseShell palette={palette} surface="collection">
            {/* ── 顶部大图：满屏宽的正方形，顶到屏幕最上（盖住状态栏） ──
                marginTop 的负值抵消 NeteaseShell 垫的 insets.top：那一层内边距是给常规顶栏用的，
                而这张图要的是**出血到 y=0**（参考视频的落点就是屏幕顶）。绝对定位的子元素不受
                padding 影响，所以返回栏不用写这层换算，写在这里一处就够。

                落点框量的是**这个盒子**（见 neteaseMorph.ts）。渐变故意做成它的**兄弟节点**而不是叠在它上面：
                飞行的封面全程盖在这张图上（转场层的 z-index 200 > 集合层 110），落位那一刻两者像素级重合、
                直接换掉即可 —— 要是把渐变叠在图里面，落位瞬间会突然多出一层渐变，看得见。 */}
            <div className="relative shrink-0" style={{ marginTop: -insets.top }}>
                <div
                    className="w-full overflow-hidden rounded-xl"
                    style={{ aspectRatio: '1 / 1', ...placeholderTint(String(collection.id), isDaylight) }}
                    {...{ [NETEASE_HERO_ATTR]: 'true', [NETEASE_HERO_KEY_ATTR]: String(collection.id) }}
                >
                    {/* 封面 URL 取自集合描述符（不是异步快照里的 detail.coverUrl）：描述符里已经带着它，
                        同一张图在首页卡片上已经解码过，这里立刻就能画，落位交换时不会露出占位底色。 */}
                    {heroCover && <img src={heroCover} alt="" className="h-full w-full object-cover" />}
                </div>
                {/* 图与页面底色之间的过渡带。顶端全透明，与图无缝。 */}
                <div
                    className="pointer-events-none h-32 w-full"
                    style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, var(--nt-bg) 82%)' }}
                />
            </div>

            {/* 返回栏浮在大图上。底下一道压暗才保证白色图标在任何封面颜色上都读得清。 */}
            <div
                className="absolute inset-x-0 top-0 z-10 flex min-h-[56px] items-center gap-1 px-4"
                style={{
                    paddingTop: insets.top,
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 100%)',
                }}
            >
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="返回"
                    className="flex shrink-0 items-center justify-center rounded-full"
                    style={{ width: 'var(--nt-touch-min)', height: 'var(--nt-touch-min)' }}
                >
                    <ChevronLeft size={22} color="#ffffff" />
                </button>
                <span className="flex-1" />
                {headerActions.length > 0 && (
                    <NeteaseMoreMenu label="歌单操作" actions={headerActions} />
                )}
            </div>

            <div className="nt-scroll min-h-0 flex-1">
                {/* 标题 / 创作者 / 曲数：落在渐变带下方 */}
                <div className="flex flex-col gap-1 px-4 pb-3 pt-1">
                    <h1 className="line-clamp-2 nt-t-display" style={{ color: 'var(--nt-text)' }}>
                        {title}
                    </h1>
                    {detail?.creator && (
                        <span className="truncate nt-t-meta" style={{ color: 'var(--nt-text-muted)' }}>
                            {detail.creator.nickname}
                        </span>
                    )}
                    <span className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                        {tracks.length} 首
                    </span>
                </div>

                {/* 操作条 */}
                <div className="flex items-center gap-3 px-4 pb-3">
                    <NeteasePlayButton
                        isPlaying={scopePlaying}
                        label={scopePlaying ? '暂停' : '播放全部'}
                        // 正在放这一批时按钮已经画成播放态，点击就必须是暂停；否则会出现
                        //「图标说在播、点击却从头播放」的新 bug。宿主没给开关时退回播放全部。
                        onClick={() => {
                            if (scopePlaying && playback.togglePlayback) playback.togglePlayback();
                            else playback.playAll(tracks);
                        }}
                    />
                    {can.has('play-scope') && tracks.length > 0 && (
                        <button
                            type="button"
                            onClick={() => playback.playAll(tracks)}
                            className="flex h-11 w-11 items-center justify-center rounded-full"
                            style={{ background: 'var(--nt-hover)' }}
                            aria-label="播放全部"
                        >
                            <ListPlus size={18} style={{ color: 'var(--nt-text-muted)' }} />
                        </button>
                    )}
                    {can.has('subscribe') && (
                        <button
                            type="button"
                            onClick={() => void mutations?.toggleSubscribe?.()}
                            disabled={mutationsSnapshot?.subscribing}
                            className="flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
                            style={{
                                background: mutationsSnapshot?.subscribed ? 'var(--nt-accent)' : 'var(--nt-hover)',
                            }}
                            aria-label={mutationsSnapshot?.subscribed ? '取消订阅' : '订阅歌单'}
                        >
                            <Share2 size={17} style={{ color: mutationsSnapshot?.subscribed ? 'var(--nt-on-accent)' : 'var(--nt-text-muted)' }} />
                        </button>
                    )}
                </div>

                {/* 简介 */}
                {detail?.description && (
                    <div style={{ borderTop: '1px solid var(--nt-divider)' }}>
                        <NeteaseCollapsible label="简介">{detail.description}</NeteaseCollapsible>
                    </div>
                )}

                {/* 加载 / 错误 / 空 / 列表 */}
                {snapshot?.status === 'loading' && tracks.length === 0 && (
                    <NeteaseEmpty message="加载中…" />
                )}
                {snapshot?.status === 'error' && (
                    <NeteaseEmpty
                        fill
                        message={snapshot.error?.kind === 'not-public' ? '该歌单不可公开访问' : '加载失败'}
                        hint="下拉重试"
                    />
                )}
                {snapshot?.status === 'ready' && tracks.length === 0 && (
                    <NeteaseEmpty
                        fill
                        message="这里还没有歌曲"
                        hint="在线音源没响应，或这个歌单确实没有可播放的曲目"
                    />
                )}
                {tracks.length > 0 && (
                    <div className="pb-2">
                        {tracks.map((track, index) => renderRow(track, index))}
                    </div>
                )}

                {/* 补页中断：可续传 */}
                {snapshot?.sync?.status === 'interrupted' && (
                    <div className="px-4 py-3 text-center">
                        <button
                            type="button"
                            onClick={() => resource?.resumeSync()}
                            className="rounded-full px-4 py-2 nt-t-label"
                            style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                        >
                            继续加载剩余歌曲
                        </button>
                    </div>
                )}
            </div>
        </NeteaseShell>
    );
};

export default NeteaseCollection;