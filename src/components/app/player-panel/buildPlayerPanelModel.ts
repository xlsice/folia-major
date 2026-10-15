import type React from 'react';
import type { RefObject } from 'react';
import type UnifiedPanel from '../../UnifiedPanel';
import { setIsPanelOpen, setPanelTab } from '../../../stores/useAppViewStore';
import { handleSetVisualizerMode } from '../../../stores/useVisualizerSettingsStore';
import { handleSetVolume, handleToggleMute, setAudioQuality } from '../../../stores/useAudioSettingsStore';
import { openSettings } from '../../../stores/useSettingsModalStore';
import { handleToggleCoverColorBg } from '../../../stores/useThemeSettingsStore';
import type { MotionValue } from 'framer-motion';

// src/components/app/player-panel/buildPlayerPanelModel.ts

type UnifiedPanelProps = React.ComponentProps<typeof UnifiedPanel>;

export type PlayerPanelViewModel = {
    panelProps: UnifiedPanelProps;
};

// What usePlayerPanelModel can produce for itself: store reads, two theme constants, the four
// "open what is playing in the grid" entries and the copy-success handler. All 28 used to be named
// in App.tsx twice - once as an argument and once as a dependency.
type PlayerPanelAmbient = {

    isPanelOpen: boolean;
    panelTab: UnifiedPanelProps['playback']['currentTab'];
    coverUrl: string | null;
    isLiked: boolean;
    hasLyrics: boolean;
    defaultTheme: UnifiedPanelProps['playback']['defaultTheme'];
    daylightTheme: UnifiedPanelProps['playback']['daylightTheme'];
    visualizerMode: UnifiedPanelProps['playback']['visualizerMode'];
    transparentPlayerBackground: UnifiedPanelProps['playback']['transparentPlayerBackground'];
    onlineLyricsState: UnifiedPanelProps['playback']['onlineLyricsState'];
    lyricTimelineOffsetMs: number;
    replayGainMode: UnifiedPanelProps['playback']['replayGainMode'];
    /**
     * 窄屏封面页签进度条的位置与总长（手机版二开）。currentTime 是全局 MotionValue，实例稳定；
     * duration 读显示时长，交叉淡入时跟淡入的那首。
     */
    currentTime: MotionValue<number>;
    duration: number;
    isFmMode: boolean;
    playerState: UnifiedPanelProps['playback']['playerState'];
    volume: UnifiedPanelProps['playback']['volume'];
    isMuted: UnifiedPanelProps['playback']['isMuted'];
    showOpenPanelCloseButton: UnifiedPanelProps['playback']['showOpenPanelCloseButton'];
    isPanelGuideHotspotActive: boolean;
    hideToggleButton: boolean;
    activePlaybackContext: 'main' | 'stage';
    openCurrentLocalAlbum: UnifiedPanelProps['library']['onOpenCurrentLocalAlbum'];
    openCurrentLocalArtist: UnifiedPanelProps['library']['onOpenCurrentLocalArtist'];
    openCurrentNavidromeAlbum: UnifiedPanelProps['library']['onOpenCurrentNavidromeAlbum'];
    openCurrentNavidromeArtist: UnifiedPanelProps['library']['onOpenCurrentNavidromeArtist'];
    handleCopySongInfoSuccess: UnifiedPanelProps['library']['onCopySongInfoSuccess'];
    audioQuality: UnifiedPanelProps['account']['audioQuality'];
    useCoverColorBg: UnifiedPanelProps['account']['useCoverColorBg'];
    isDaylight: UnifiedPanelProps['account']['isDaylight'];
};

// What only the caller can supply: controller callbacks and values App.tsx computes.
export type PlayerPanelDeps = {
    navigateToHome: UnifiedPanelProps['playback']['onNavigateHome'];
    navigateToLattice: UnifiedPanelProps['queue']['onOpenLattice'];
    handleDirectHomeFromPanel: UnifiedPanelProps['playback']['onNavigateHomeDirect'];
    currentSong: UnifiedPanelProps['playback']['currentSong'];
    handleAlbumSelect: UnifiedPanelProps['playback']['onAlbumSelect'];
    handleArtistSelect: UnifiedPanelProps['playback']['onSelectArtist'];
    effectiveLoopMode: UnifiedPanelProps['playback']['loopMode'];
    toggleLoop: UnifiedPanelProps['playback']['onToggleLoop'];
    handleLike: UnifiedPanelProps['playback']['onLike'];
    generateAITheme: () => void;
    isGeneratingTheme: boolean;
    canGenerateAITheme: boolean;
    theme: UnifiedPanelProps['playback']['theme'];
    setTheme: UnifiedPanelProps['playback']['onThemeChange'];
    bgMode: UnifiedPanelProps['playback']['bgMode'];
    handleBgModeChange: UnifiedPanelProps['playback']['onBgModeChange'];
    hasCustomTheme: UnifiedPanelProps['playback']['hasCustomTheme'];
    themeSourceModel: UnifiedPanelProps['playback']['themeSourceModel'];
    handleResetTheme: UnifiedPanelProps['playback']['onResetTheme'];
    toggleTransparentModeWithHandoff: UnifiedPanelProps['playback']['onToggleTransparentPlayerBackground'];
    handleManualMatchOnline: UnifiedPanelProps['playback']['onMatchOnline'];
    handleUpdateLocalLyrics: UnifiedPanelProps['playback']['onUpdateLocalLyrics'];
    handleChangeLyricsSource: UnifiedPanelProps['playback']['onChangeLyricsSource'];
    handleImportOnlineLyrics: UnifiedPanelProps['playback']['onImportOnlineLyrics'];
    handleChangeOnlineLyricsSource: UnifiedPanelProps['playback']['onChangeOnlineLyricsSource'];
    handleMatchOnlineLyrics: UnifiedPanelProps['playback']['onMatchOnlineLyrics'];
    handleClearOnlineLyricsState: () => void;
    handleLyricTimelineOffsetChange: UnifiedPanelProps['playback']['onLyricTimelineOffsetChange'];
    handleChangeReplayGainMode: UnifiedPanelProps['playback']['onChangeReplayGainMode'];
    fmModeLabel: string;
    handleOpenFmModePicker?: () => void;
    handleFmTrash: UnifiedPanelProps['playback']['onFmTrash'];
    handleNextTrack: UnifiedPanelProps['playback']['onNextTrack'];
    handlePrevTrack: UnifiedPanelProps['playback']['onPrevTrack'];
    /** 窄屏封面页签进度条的 seek（手机版二开）。 */
    seekMainAudio: (time: number) => void;
    togglePlay: UnifiedPanelProps['playback']['onTogglePlay'];
    handlePreviewVolume: UnifiedPanelProps['playback']['onVolumePreview'];
    isNowPlayingControlDisabled: boolean;
    openCommandPalette?: UnifiedPanelProps['playback']['onOpenCommandPalette'];
    isCommandPaletteOpen?: boolean;
    playQueue: UnifiedPanelProps['queue']['playQueue'];
    playSong: UnifiedPanelProps['queue']['onPlaySong'];
    queueScrollRef: RefObject<HTMLDivElement | null>;
    shuffleQueue: UnifiedPanelProps['queue']['onShuffle'];
    removeQueueSong: UnifiedPanelProps['queue']['onRemoveSong'];
    moveQueueSongToEnd: UnifiedPanelProps['queue']['onMoveSongToEnd'];
    moveQueueSongToNext: UnifiedPanelProps['queue']['onMoveSongToNext'];
    saveCurrentQueueAsLocalPlaylist: UnifiedPanelProps['library']['onSaveCurrentQueueAsPlaylist'];
    user: UnifiedPanelProps['account']['user'];
    accountController: UnifiedPanelProps['account']['accountController'];
    cacheSize: UnifiedPanelProps['account']['cacheSize'];
    handleClearCache: UnifiedPanelProps['account']['onClearCache'];
    handleSyncData: UnifiedPanelProps['account']['onSyncData'];
    isSyncing: UnifiedPanelProps['account']['isSyncing'];
    handleToggleDaylight: () => void;
};

type BuildPlayerPanelModelParams = PlayerPanelAmbient & PlayerPanelDeps;

// Builds the player panel model from raw app state and actions so App.tsx no longer assembles nested props inline.
export const buildPlayerPanelModel = ({
    isPanelOpen,
    panelTab,
    navigateToHome,
    navigateToLattice,
    handleDirectHomeFromPanel,
    coverUrl,
    currentSong,
    handleAlbumSelect,
    handleArtistSelect,
    effectiveLoopMode,
    toggleLoop,
    handleLike,
    isLiked,
    generateAITheme,
    isGeneratingTheme,
    hasLyrics,
    canGenerateAITheme,
    theme,
    setTheme,
    bgMode,
    handleBgModeChange,
    hasCustomTheme,
    themeSourceModel,
    handleResetTheme,
    defaultTheme,
    daylightTheme,
    visualizerMode,
    transparentPlayerBackground,
    toggleTransparentModeWithHandoff,
    handleManualMatchOnline,
    handleUpdateLocalLyrics,
    handleChangeLyricsSource,
    onlineLyricsState,
    handleImportOnlineLyrics,
    handleChangeOnlineLyricsSource,
    handleMatchOnlineLyrics,
    handleClearOnlineLyricsState,
    lyricTimelineOffsetMs,
    handleLyricTimelineOffsetChange,
    replayGainMode,
    handleChangeReplayGainMode,
    isFmMode,
    fmModeLabel,
    handleOpenFmModePicker,
    handleFmTrash,
    handleNextTrack,
    handlePrevTrack,
    currentTime,
    duration,
    seekMainAudio,
    playerState,
    togglePlay,
    volume,
    isMuted,
    handlePreviewVolume,
    showOpenPanelCloseButton,
    isPanelGuideHotspotActive,
    hideToggleButton,
    activePlaybackContext,
    isNowPlayingControlDisabled,
    openCommandPalette,
    isCommandPaletteOpen,
    playQueue,
    playSong,
    queueScrollRef,
    shuffleQueue,
    removeQueueSong,
    moveQueueSongToEnd,
    moveQueueSongToNext,
    saveCurrentQueueAsLocalPlaylist,
    openCurrentLocalAlbum,
    openCurrentLocalArtist,
    openCurrentNavidromeAlbum,
    openCurrentNavidromeArtist,
    handleCopySongInfoSuccess,
    user,
    accountController,
    audioQuality,
    cacheSize,
    handleClearCache,
    handleSyncData,
    isSyncing,
    useCoverColorBg,
    isDaylight,
    handleToggleDaylight,
}: BuildPlayerPanelModelParams): PlayerPanelViewModel => ({
    panelProps: {
        playback: {
            isOpen: isPanelOpen,
            currentTab: panelTab,
            onTabChange: setPanelTab,
            onToggle: () => setIsPanelOpen(!isPanelOpen),
            onNavigateHome: navigateToHome,
            onNavigateHomeDirect: handleDirectHomeFromPanel,
            coverUrl,
            currentSong,
            onAlbumSelect: handleAlbumSelect,
            onSelectArtist: handleArtistSelect,
            loopMode: effectiveLoopMode,
            onToggleLoop: toggleLoop,
            onLike: handleLike,
            isLiked,
            onGenerateAITheme: generateAITheme,
            isGeneratingTheme,
            hasLyrics,
            canGenerateAITheme,
            theme,
            onThemeChange: setTheme,
            bgMode,
            onBgModeChange: handleBgModeChange,
            hasCustomTheme,
            themeSourceModel,
            onResetTheme: handleResetTheme,
            defaultTheme,
            daylightTheme,
            visualizerMode,
            onVisualizerModeChange: handleSetVisualizerMode,
            transparentPlayerBackground,
            onToggleTransparentPlayerBackground: toggleTransparentModeWithHandoff,
            onMatchOnline: handleManualMatchOnline,
            onUpdateLocalLyrics: handleUpdateLocalLyrics,
            onChangeLyricsSource: handleChangeLyricsSource,
            onlineLyricsState,
            onImportOnlineLyrics: handleImportOnlineLyrics,
            onChangeOnlineLyricsSource: handleChangeOnlineLyricsSource,
            onMatchOnlineLyrics: handleMatchOnlineLyrics,
            onClearOnlineLyricsState: handleClearOnlineLyricsState,
            lyricTimelineOffsetMs,
            onLyricTimelineOffsetChange: handleLyricTimelineOffsetChange,
            replayGainMode,
            onChangeReplayGainMode: handleChangeReplayGainMode,
            isFmMode,
            fmModeLabel,
            onOpenFmModePicker: handleOpenFmModePicker,
            onFmTrash: handleFmTrash,
            onNextTrack: handleNextTrack,
            onPrevTrack: handlePrevTrack,
            // 窄屏封面页签的进度条要能拖动，所以把位置与 seek 一起交给面板（手机版二开）。
            // currentTime 是全局 MotionValue，直接给实例；duration 读 store 的显示时长（交叉淡入时是淡入那首的）。
            currentTime,
            duration,
            onSeek: seekMainAudio,
            playerState,
            onTogglePlay: togglePlay,
            volume,
            isMuted,
            onVolumePreview: handlePreviewVolume,
            onVolumeChange: handleSetVolume,
            onToggleMute: handleToggleMute,
            showOpenPanelCloseButton,
            isPanelGuideHotspotActive,
            hideToggleButton,
            isStageContext: activePlaybackContext === 'stage',
            playbackControlsDisabled: isNowPlayingControlDisabled,
            onOpenSettings: () => {
                openSettings('options');
            },
            onOpenCommandPalette: openCommandPalette,
            isCommandPaletteOpen,
        },
        queue: {
            playQueue,
            onPlaySong: playSong,
            queueScrollRef,
            onShuffle: shuffleQueue,
            onRemoveSong: removeQueueSong,
            onMoveSongToEnd: moveQueueSongToEnd,
            onMoveSongToNext: moveQueueSongToNext,
            onOpenLattice: navigateToLattice,
        },
        library: {
            onSaveCurrentQueueAsPlaylist: saveCurrentQueueAsLocalPlaylist,
            onOpenCurrentLocalAlbum: openCurrentLocalAlbum,
            onOpenCurrentLocalArtist: openCurrentLocalArtist,
            onOpenCurrentNavidromeAlbum: openCurrentNavidromeAlbum,
            onOpenCurrentNavidromeArtist: openCurrentNavidromeArtist,
            onCopySongInfoSuccess: handleCopySongInfoSuccess,
        },
        account: {
            user,
            accountController,
            audioQuality,
            onAudioQualityChange: setAudioQuality,
            cacheSize,
            onClearCache: handleClearCache,
            onSyncData: handleSyncData,
            isSyncing,
            useCoverColorBg,
            onToggleCoverColorBg: handleToggleCoverColorBg,
            isDaylight,
            onToggleDaylight: handleToggleDaylight,
        },
    },
});
