import React from 'react';
import { useSyncExternalStore } from 'react';
import { ChevronLeft, Play } from 'lucide-react';
import type { SongResult } from '../../../types';
import type { LibraryArtistSurfaceProps } from '../../core/contracts/suite';
import { buildNeteasePalette, placeholderTint } from './neteaseTheme';
import { NeteaseEmpty, NeteaseMoreMenu, NeteasePlayButton, NeteaseShell, NeteaseSectionTitle } from './neteaseParts';
import { useNeteaseScopePlaying } from './useNeteasePlayback';

// src/library/suites/netease/NeteaseArtist.tsx
// 歌手页：网易云的结构是「顶部头像 + 名字 + 关注」+「热门歌曲」+「专辑」两段。
// 与 collection 一样走订阅式快照（resource.getSnapshot + subscribe）。

const NeteaseArtist: React.FC<LibraryArtistSurfaceProps> = ({
    collection,
    resource,
    playback,
    theme,
    isDaylight,
    declaredActions,
    isInteractive,
    onBack,
    onOpenAlbum,
}) => {
    const snapshot = useSyncExternalStore(
        React.useCallback(listener => resource?.subscribe(listener) ?? (() => {}), [resource]),
        React.useCallback(() => resource?.getSnapshot() ?? null, [resource]),
    );

    const can = new Set(declaredActions.actions);
    const palette = React.useMemo(() => buildNeteasePalette(theme, isDaylight), [theme, isDaylight]);

    const topSongs: SongResult[] = snapshot?.topSongs ?? [];
    const albums = snapshot?.albums ?? [];
    const artistName = snapshot?.detail?.name || collection.name;

    // 热门歌曲的「播放全部」：正在放这批时按钮画成播放态、点击改为暂停（同 collection 页的语义）。
    const topSongsPlaying = useNeteaseScopePlaying(topSongs);

    return (
        <NeteaseShell palette={palette} surface="artist">
            {/* 这条头部没有复用 NeteaseHeader，自己写了一份，所以边距也要自己跟上：
                原来是 px-2（8px），比全站统一的 16px 少一半。 */}
            <div className="flex min-h-[56px] shrink-0 items-center gap-1 px-4">
                <button type="button" onClick={onBack} aria-label="返回"
                    className="flex shrink-0 items-center justify-center rounded-full"
                    style={{ width: 'var(--nt-touch-min)', height: 'var(--nt-touch-min)' }}>
                    <ChevronLeft size={22} style={{ color: 'var(--nt-text)' }} />
                </button>
                <span className="min-w-0 flex-1 truncate px-1 nt-t-item" style={{ color: 'var(--nt-text)' }}>
                    {artistName}
                </span>
                {can.has('reload') && (
                    <NeteaseMoreMenu
                        label="更多"
                        actions={[{ id: 'reload', label: '重新加载', onSelect: () => resource?.reload() }]}
                    />
                )}
            </div>

            <div className="nt-scroll min-h-0 flex-1 pb-4">
                {/* 艺人头部 */}
                <div className="flex flex-col items-center gap-2 px-4 pb-6 pt-3">
                    <div
                        className="h-28 w-28 overflow-hidden rounded-full"
                        style={placeholderTint(artistName, isDaylight)}
                    >
                        {snapshot?.detail?.coverUrl && (
                            <img src={snapshot.detail.coverUrl} alt="" className="h-full w-full object-cover" />
                        )}
                    </div>
                    <h1 className="mt-1 nt-t-display" style={{ color: 'var(--nt-text)' }}>{artistName}</h1>
                </div>

                {snapshot?.status === 'loading' && !topSongs.length && !albums.length && (
                    <NeteaseEmpty message="加载中…" />
                )}
                {snapshot?.status === 'error' && (
                    <NeteaseEmpty message="加载失败" hint="检查网络后重试" />
                )}

                {/* 热门歌曲 */}
                {topSongs.length > 0 && (
                    <>
                        <div className="flex items-center gap-3 px-4 pb-1">
                            <NeteasePlayButton
                                isPlaying={topSongsPlaying}
                                label={topSongsPlaying ? '暂停' : '播放热门歌曲'}
                                size={38}
                                onClick={() => {
                                    if (topSongsPlaying && playback.togglePlayback) playback.togglePlayback();
                                    else playback.playAll(topSongs);
                                }}
                            />
                            <span className="nt-t-title" style={{ color: 'var(--nt-text)' }}>
                                热门歌曲
                            </span>
                        </div>
                        {can.has('enqueue-scope') && (
                            <div className="px-4 pb-2">
                                <button
                                    type="button"
                                    onClick={() => playback.enqueueAll(topSongs, { suppressToast: true })}
                                    className="rounded-full px-3 py-2 nt-t-label"
                                    style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                                >
                                    收藏热门歌曲
                                </button>
                            </div>
                        )}
                        <div>
                            {topSongs.map((track, index) => (
                                <div
                                    key={`${String(track.id)}-${index}`}
                                    className="flex items-center gap-3 px-4 py-3"
                                    style={{ borderTop: index === 0 ? 'none' : '1px solid var(--nt-divider)' }}
                                >
                                    <span className="w-5 shrink-0 text-center nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                                        {index + 1}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={!isInteractive}
                                        onClick={() => playback.playTrack(track, topSongs)}
                                        className="flex min-w-0 flex-1 flex-col items-start text-left"
                                    >
                                        <span className="max-w-full truncate nt-t-item" style={{ color: 'var(--nt-text)' }}>
                                            {track.name}
                                        </span>
                                        <span className="max-w-full truncate nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                                            {track.album?.name ?? ''}
                                        </span>
                                    </button>
                                    <NeteaseMoreMenu
                                        label="更多操作"
                                        actions={[
                                            { id: 'enqueue', label: '添加到队列', onSelect: () => playback.enqueueTrack(track) },
                                            {
                                                id: 'go-album',
                                                label: '查看专辑',
                                                onSelect: () => onOpenAlbum(track.album?.id ?? track.name, undefined, track),
                                            },
                                        ]}
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* 专辑 */}
                {albums.length > 0 && (
                    <>
                        <NeteaseSectionTitle count={albums.length}>专辑</NeteaseSectionTitle>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-4 px-4 sm:grid-cols-3">
                            {albums.map(album => (
                                <button
                                    key={album.id}
                                    type="button"
                                    disabled={!isInteractive}
                                    onClick={() => onOpenAlbum(album.id, { name: album.name, coverUrl: album.coverUrl })}
                                    className="flex flex-col gap-1 text-left"
                                >
                                    <div
                                        className="aspect-square w-full overflow-hidden rounded-lg"
                                        style={placeholderTint(String(album.id), isDaylight)}
                                    >
                                        {album.coverUrl && (
                                            <img src={album.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                                        )}
                                    </div>
                                    <span className="truncate nt-t-item" style={{ color: 'var(--nt-text)' }}>{album.name}</span>
                                    {album.publishedAt ? (
                                        <span className="nt-t-meta" style={{ color: 'var(--nt-text-faint)' }}>
                                            {new Date(album.publishedAt).getFullYear()}
                                        </span>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* 专辑分页中断 */}
                {snapshot?.albumSync?.state === 'interrupted' && snapshot.albumSync.reason === 'failed' && (
                    <div className="px-4 py-3 text-center">
                        <button
                            type="button"
                            onClick={() => resource?.retryAlbums()}
                            className="rounded-full px-4 py-2 nt-t-label"
                            style={{ background: 'var(--nt-hover)', color: 'var(--nt-text-muted)' }}
                        >
                            继续加载专辑
                        </button>
                    </div>
                )}

                {snapshot?.status === 'ready' && topSongs.length === 0 && albums.length === 0 && (
                    <NeteaseEmpty fill message="没有这位歌手的内容" />
                )}
            </div>
        </NeteaseShell>
    );
};

export default NeteaseArtist;