import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Album, Artist, SongResult, UnifiedSong } from '../../types';
import { canResolveSongCatalogRef } from '../../services/onlineMusic/catalogRefs';
import { getProviderSongMetadata, getProviderSongPageUrl } from '../../services/onlineMusic/songMetadata';
import CompactTransport from './CoverTabTransport';
import type { MotionValue } from 'framer-motion';

interface CoverTabProps {
    currentSong: SongResult | null;
    onAlbumSelect: (song: SongResult, album: Album) => void;
    onSelectArtist: (song: SongResult, artist: Artist) => void;
    onOpenCurrentLocalAlbum: () => void;
    onOpenCurrentLocalArtist: (entityId?: string) => void;
    onOpenCurrentNavidromeAlbum: () => void;
    onOpenCurrentNavidromeArtist: () => void;
    onCopySongInfoSuccess: () => void;
    /**
     * 窄屏（手机）。面板在手机上不挂播放胶囊，所以歌名下面补一排「上一首 / 播放暂停 / 下一首 + 进度条」。
     * 桌面端为 false，保持原样——它有自己的播放胶囊，再加一份就是重复。
     */
    compact?: boolean;
    isPlaying?: boolean;
    onTogglePlay?: () => void;
    onPrevTrack?: () => void;
    onNextTrack?: () => void;
    canGoPrev?: boolean;
    canGoNext?: boolean;
    controlsDisabled?: boolean;
    currentTime?: MotionValue<number>;
    duration?: number;
    onSeek?: (time: number) => void;
}

const CoverTab: React.FC<CoverTabProps> = ({
    currentSong,
    onAlbumSelect,
    onSelectArtist,
    onOpenCurrentLocalAlbum,
    onOpenCurrentLocalArtist,
    onOpenCurrentNavidromeAlbum,
    onOpenCurrentNavidromeArtist,
    onCopySongInfoSuccess,
    compact = false,
    isPlaying = false,
    onTogglePlay,
    onPrevTrack,
    onNextTrack,
    canGoPrev = false,
    canGoNext = false,
    controlsDisabled = false,
    currentTime,
    duration = 0,
    onSeek,
}) => {
    const { t } = useTranslation();
    const isLocalSong = Boolean(currentSong && (((currentSong as any).isLocal === true) || (currentSong as any).localRef?.songId));
    const isNavidromeSong = Boolean(currentSong && (currentSong as any).isNavidrome === true);
    const isStageSong = Boolean(currentSong && (currentSong as any).isStage === true);
    const songMetadata = currentSong ? getProviderSongMetadata(currentSong) : null;
    const displayArtists = songMetadata?.artists || [];
    const displayAlbumName = songMetadata?.album?.name || '';
    const canOpenAlbum = Boolean(currentSong && !isStageSong && (
        isLocalSong
        || isNavidromeSong
        || canResolveSongCatalogRef(currentSong as UnifiedSong, 'album', currentSong.album)
    ));
    const displayArtistNames = displayArtists.map((artist) => artist.name).join(', ');
    const copyTitleLine = currentSong
        ? `${currentSong.name || ''} - ${displayArtistNames} - ${displayAlbumName}`
        : '';
    const songPageUrl = getProviderSongPageUrl(currentSong);
    const copyPayload = copyTitleLine
        ? [copyTitleLine, songPageUrl || ''].filter(Boolean).join('\n')
        : '';
    const canCopySongInfo = Boolean(copyPayload);

    const copyText = async (text: string) => {
        if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');
        } finally {
            document.body.removeChild(textarea);
        }
    };

    const openProviderSongPage = () => {
        if (!songPageUrl) {
            return;
        }

        const openSongPage = window.electron?.openExternalUrl
            ? window.electron.openExternalUrl(songPageUrl)
            : Promise.resolve(Boolean(window.open(songPageUrl, '_blank', 'noopener,noreferrer')));

        void openSongPage.catch((error) => {
            console.error('Failed to open provider song page:', error);
        });
    };

    // Normal click copies song info; Ctrl+click opens the provider song page when available.
    const handleSongTitleClick = (event: React.MouseEvent<HTMLHeadingElement>) => {
        if (event.ctrlKey && songPageUrl) {
            openProviderSongPage();
            return;
        }

        if (!copyPayload) {
            return;
        }

        void copyText(copyPayload)
            .then(() => {
                onCopySongInfoSuccess();
            })
            .catch((error) => {
                console.error('Failed to copy current song info:', error);
            });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center text-center space-y-4 mt-4"
        >
            <div className="space-y-1 relative w-full">
                <div className="flex items-start justify-center gap-2">
                    <h2
                        className={canCopySongInfo
                            ? 'text-2xl font-bold line-clamp-2 cursor-pointer hover:opacity-80 transition-opacity'
                            : 'text-2xl font-bold line-clamp-2'}
                        onClick={handleSongTitleClick}
                    >
                        {currentSong?.name || t('ui.noTrack')}
                    </h2>
                </div>
                <div className="text-sm opacity-60 space-y-1">
                    <div className="font-medium">
                        {displayArtists.map((a, i) => {
                            const canOpenArtist = Boolean(currentSong && !isStageSong && (
                                isLocalSong
                                || isNavidromeSong
                                || canResolveSongCatalogRef(currentSong as UnifiedSong, 'artist', a)
                            ));
                            return (
                            <React.Fragment key={`${a.entityId || a.id}-${i}`}>
                                {i > 0 && ", "}
                                <span
                                    className={canOpenArtist ? 'cursor-pointer hover:underline hover:opacity-100 transition-opacity' : ''}
                                    onClick={() => {
                                        if (!canOpenArtist) {
                                            return;
                                        }
                                        if (isLocalSong) {
                                            onOpenCurrentLocalArtist(a.entityId);
                                            return;
                                        }
                                        if (isNavidromeSong) {
                                            onOpenCurrentNavidromeArtist();
                                            return;
                                        }
                                        if (currentSong) onSelectArtist(currentSong, a);
                                    }}
                                >
                                    {a.name}
                                </span>
                            </React.Fragment>
                            );
                        })}
                    </div>
                    <div
                        className={canOpenAlbum ? 'opacity-60 cursor-pointer hover:opacity-100 hover:underline transition-all' : 'opacity-60'}
                        onClick={() => {
                            if (!canOpenAlbum) {
                                return;
                            }
                            if (isLocalSong) {
                                onOpenCurrentLocalAlbum();
                                return;
                            }
                            if (isNavidromeSong) {
                                onOpenCurrentNavidromeAlbum();
                                return;
                            }
                            const album = currentSong?.album;
                            if (currentSong && album) onAlbumSelect(currentSong, album);
                        }}
                    >
                        {displayAlbumName}
                    </div>
                </div>
            </div>
            {/* 窄屏播放控制：手机上面板里没有播放胶囊，歌名/专辑下面补一排（手机版二开）。 */}
            {compact && currentSong && (
                <CompactTransport
                    isPlaying={isPlaying}
                    onTogglePlay={onTogglePlay ?? (() => {})}
                    onPrevTrack={onPrevTrack ?? (() => {})}
                    onNextTrack={onNextTrack ?? (() => {})}
                    canGoPrev={canGoPrev}
                    canGoNext={canGoNext}
                    controlsDisabled={controlsDisabled}
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={onSeek}
                />
            )}
        </motion.div>
    );
};

export default CoverTab;
