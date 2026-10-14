import React from 'react';
import { ChevronLeft, Download, ListPlus, Play, Share2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { SongResult } from '../../../types';
import type { LibraryCollectionSurfaceProps } from '../../core/contracts/suite';
import { buildNeteasePalette, placeholderTint } from './neteaseTheme';
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

    const tracks: SongResult[] = snapshot?.tracks ?? [];
    const detail = snapshot?.detail ?? null;
    const title = detail?.name || collection.name;

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
                className="flex items-center gap-2 px-3 py-2"
                style={{ borderTop: index === 0 ? 'none' : '1px solid var(--nt-divider)' }}
            >
                <NeteaseTrackIndex index={index + 1} isPlaying={false} />
                <button
                    type="button"
                    disabled={!isInteractive}
                    onClick={() => playback.playTrack(track, tracks)}
                    className="flex min-w-0 flex-1 flex-col items-start py-0.5 text-left"
                >
                    <span
                        className="max-w-full truncate text-sm"
                        style={{ color: 'var(--nt-text)' }}
                    >
                        {track.name}
                    </span>
                    <span className="max-w-full truncate text-xs" style={{ color: 'var(--nt-text-faint)' }}>
                        {artistName}
                    </span>
                </button>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--nt-text-faint)' }}>
                    {formatTrackDuration(track.durationMs)}
                </span>
                {/* ⋯ 常显 */}
                <NeteaseMoreMenu label="更多操作" actions={trackActions(track, index)} />
            </div>
        );
    };

    return (
        <NeteaseShell palette={palette}>
            {/* 返回栏 */}
            <div className="flex min-h-[48px] shrink-0 items-center gap-1 px-2">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="返回"
                    className="rounded-full p-2"
                >
                    <ChevronLeft size={20} style={{ color: 'var(--nt-text)' }} />
                </button>
                <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium" style={{ color: 'var(--nt-text)' }}>
                    {title}
                </span>
                {headerActions.length > 0 && (
                    <NeteaseMoreMenu label="歌单操作" actions={headerActions} />
                )}
            </div>

            <div className="nt-scroll min-h-0 flex-1">
                {/* 头部：大封面 + 标题 + 播放 */}
                <div className="flex gap-4 px-4 pb-4 pt-2">
                    <div
                        className="h-[30vw] max-h-[150px] min-h-[92px] w-[30vw] max-w-[150px] min-w-[92px] shrink-0 overflow-hidden rounded-xl"
                        style={placeholderTint(String(collection.id), isDaylight)}
                    >
                        {detail?.coverUrl && (
                            <img src={detail.coverUrl} alt="" className="h-full w-full object-cover" />
                        )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-end gap-1.5">
                        <h1 className="line-clamp-2 text-lg font-bold leading-tight" style={{ color: 'var(--nt-text)' }}>
                            {title}
                        </h1>
                        {detail?.creator && (
                            <span className="truncate text-xs" style={{ color: 'var(--nt-text-muted)' }}>
                                {detail.creator.nickname}
                            </span>
                        )}
                        <span className="text-xs" style={{ color: 'var(--nt-text-faint)' }}>
                            {tracks.length} 首
                        </span>
                    </div>
                </div>

                {/* 操作条 */}
                <div className="flex items-center gap-3 px-4 pb-3">
                    <NeteasePlayButton
                        isPlaying={false}
                        label="播放全部"
                        onClick={() => playback.playAll(tracks)}
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
                        message={snapshot.error?.kind === 'not-public' ? '该歌单不可公开访问' : '加载失败'}
                        hint="下拉重试"
                    />
                )}
                {snapshot?.status === 'ready' && tracks.length === 0 && (
                    <NeteaseEmpty message="这里还没有歌曲" hint="切换来源或导入本地曲库" />
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
                            className="rounded-full px-4 py-2 text-xs"
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