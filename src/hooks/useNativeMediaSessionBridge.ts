import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { PlayerState } from '../types';
import type { SongResult } from '../types';
import { getSongAlbumLabel, getSongArtistLabel, getSongCoverUrl } from '../services/onlineMusic/songMetadata';
import { toSafeRemoteUrl } from '../utils/appPlaybackHelpers';
import {
    imageUrlToDataUri,
    isNativeMediaSessionAvailable,
    onNativeMediaAction,
    requestNativeNotificationPermission,
    setNativeArtwork,
    syncNativeMediaSession,
} from '../utils/nativeMediaSession';

// 安卓端的媒体会话桥。原生侧：NativeMediaSessionPlugin + FoliaMediaSessionService。
//
// 与 hooks/useMediaSessionBridge.ts 是**并列的两条路**，不是替代关系：
// 后者写的是 navigator.mediaSession，而实测 Android WebView 里这个 API 根本不存在
// （取 playbackState 得到 "unsupported"），它的三个 effect 在安卓上全部第一行就 return。
// 所以这里单独把同一份播放状态镜像给原生，由系统去画通知栏/锁屏。
//
// 发声的仍然是页面里的 HTMLAudioElement —— 这里只同步状态、只接控制指令。

type UseNativeMediaSessionBridgeOptions = {
    audioRef: RefObject<HTMLAudioElement | null>;
    /** 同 useMediaSessionBridge：正在显示的是哪个 deck 的元素。 */
    getDisplayAudioElement?: () => HTMLAudioElement | null;
    audioSrc: string | null;
    currentSong: SongResult | null;
    cachedCoverUrl: string | null;
    playerState: PlayerState;
    isNowPlayingStageActive: boolean;
    unknownArtistLabel: string;
    mediaSessionPlayRef: RefObject<() => Promise<void>>;
    mediaSessionPauseRef: RefObject<() => void>;
    mediaSessionPrevRef: RefObject<() => void>;
    mediaSessionNextRef: RefObject<() => Promise<void> | void>;
    isNowPlayingControlDisabledRef: RefObject<boolean>;
};

export const useNativeMediaSessionBridge = ({
    audioRef,
    getDisplayAudioElement,
    audioSrc,
    currentSong,
    cachedCoverUrl,
    playerState,
    isNowPlayingStageActive,
    unknownArtistLabel,
    mediaSessionPlayRef,
    mediaSessionPauseRef,
    mediaSessionPrevRef,
    mediaSessionNextRef,
    isNowPlayingControlDisabledRef,
}: UseNativeMediaSessionBridgeOptions) => {
    const available = isNativeMediaSessionAvailable();

    // --- 系统媒体控制 → JS ------------------------------------------------------
    // 通知栏 / 锁屏 / 耳机键最终都汇到这一条回调上。
    useEffect(() => {
        if (!available) return;

        return onNativeMediaAction((action) => {
            // 舞台播放态下宿主控件是禁用的，这里跟着同一把闸，
            // 否则会出现「通知栏能暂停、页面里却按不动」的分裂。
            if (isNowPlayingControlDisabledRef.current) return;

            switch (action.action) {
                case 'play':
                    void mediaSessionPlayRef.current().catch((error) => {
                        console.error('[nativeMediaSession] play failed', error);
                    });
                    break;
                case 'pause':
                    mediaSessionPauseRef.current();
                    break;
                case 'prev':
                    mediaSessionPrevRef.current();
                    break;
                case 'next':
                    void mediaSessionNextRef.current();
                    break;
                case 'seek': {
                    const audio = getDisplayAudioElement?.() ?? audioRef.current;
                    if (!audio) return;
                    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
                    if (duration <= 0) return;
                    audio.currentTime = Math.min(Math.max(0, action.positionMs / 1000), duration);
                    break;
                }
                default:
                    break;
            }
        });
    }, [
        available,
        audioRef,
        getDisplayAudioElement,
        isNowPlayingControlDisabledRef,
        mediaSessionNextRef,
        mediaSessionPauseRef,
        mediaSessionPlayRef,
        mediaSessionPrevRef,
    ]);

    // --- 播放状态 → 原生（onTimeUpdate 节奏，约 4Hz） ----------------------------
    useEffect(() => {
        if (!available) return;

        const audio = getDisplayAudioElement?.() ?? audioRef.current;
        if (!audio || !audioSrc) {
            // 没有曲目时把原生那边也收干净，否则通知栏会一直挂着上一首。
            syncNativeMediaSession({
                playing: false, positionMs: 0, durationMs: 0, rate: 1,
                title: null, artist: null, album: null,
            });
            return;
        }

        const push = () => {
            const durationMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
            const artist = getSongArtistLabel(currentSong) || unknownArtistLabel;
            syncNativeMediaSession({
                playing: !audio.paused && !audio.ended,
                positionMs: Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : 0,
                durationMs,
                rate: Number.isFinite(audio.playbackRate) && audio.playbackRate > 0 ? audio.playbackRate : 1,
                title: currentSong?.name ?? null,
                artist,
                album: getSongAlbumLabel(currentSong),
            });
        };

        audio.addEventListener('timeupdate', push);
        audio.addEventListener('play', push);
        audio.addEventListener('pause', push);
        audio.addEventListener('ended', push);
        audio.addEventListener('seeked', push);
        audio.addEventListener('loadedmetadata', push);
        audio.addEventListener('durationchange', push);
        push();

        return () => {
            audio.removeEventListener('timeupdate', push);
            audio.removeEventListener('play', push);
            audio.removeEventListener('pause', push);
            audio.removeEventListener('ended', push);
            audio.removeEventListener('seeked', push);
            audio.removeEventListener('loadedmetadata', push);
            audio.removeEventListener('durationchange', push);
        };
    }, [
        available, audioRef, audioSrc, currentSong,
        getDisplayAudioElement, unknownArtistLabel,
    ]);

    // --- 封面 → 原生 -----------------------------------------------------------
    // 同一首歌只送一次。http(s) 直接给 URL 让原生下载（页面 fetch 跨域会被 CORS 拒），
    // blob: 才转 base64 兜底 —— 两条路都过同一个 setNativeArtwork。
    //
    // ⛔ 别漏掉 toSafeRemoteUrl（与 createCoverUrlResolver 同一个消毒）：
    // netease / kugou 至今还发 http:// 封面，原生 HttpURLConnection 同样吃 cleartext 策略，
    // 不升级就是一次必然失败的下载。
    useEffect(() => {
        if (!available || !currentSong) return;

        let disposed = false;
        const artworkUrl = toSafeRemoteUrl(cachedCoverUrl)
            || toSafeRemoteUrl(getSongCoverUrl(currentSong))
            || '';
        if (!artworkUrl) {
            setNativeArtwork('');
            return;
        }
        console.info('[nativeMediaSession] artwork <-', artworkUrl);

        if (artworkUrl.startsWith('http://') || artworkUrl.startsWith('https://')) {
            setNativeArtwork(artworkUrl);
            return;
        }

        void imageUrlToDataUri(artworkUrl).then((dataUri) => {
            if (disposed) return;
            setNativeArtwork(dataUri ?? '');
        });

        return () => {
            disposed = true;
        };
    }, [available, cachedCoverUrl, currentSong]);

    // --- 首次播放时申请通知权限 -----------------------------------------------
    // 只在「真的开始播了」时申请一次：挂在 currentSong 上会每换一首歌弹一次框，
    // 用户第二次就会直接拒绝。进程重启后 ref 复位，会再问一次 —— 这是对的，
    // 权限没被记住才需要重新问。
    const permissionRequestedRef = useRef(false);
    useEffect(() => {
        if (!available) return;
        if (permissionRequestedRef.current) return;
        if (!currentSong || isNowPlayingStageActive) return;
        if (playerState !== PlayerState.PLAYING) return;
        permissionRequestedRef.current = true;
        void requestNativeNotificationPermission();
    }, [available, currentSong, isNowPlayingStageActive, playerState]);

    // playerState 参与依赖是为了让「暂停/恢复」即使没有媒体事件也一定同步一次。
    useEffect(() => {
        if (!available) return;
        const audio = getDisplayAudioElement?.() ?? audioRef.current;
        if (!audio || !currentSong) return;
        syncNativeMediaSession({
            playing: playerState === PlayerState.PLAYING && !audio.paused,
            positionMs: Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : 0,
            durationMs: Number.isFinite(audio.duration) ? audio.duration * 1000 : 0,
            rate: 1,
            title: currentSong.name,
            artist: getSongArtistLabel(currentSong) || unknownArtistLabel,
            album: getSongAlbumLabel(currentSong),
        });
    }, [
        available, audioRef, currentSong, getDisplayAudioElement,
        playerState, unknownArtistLabel,
    ]);
};
