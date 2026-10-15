import { useCallback, useMemo, useReducer, useRef } from 'react';
import { useMotionValueEvent } from 'framer-motion';
import { PlayerState, type SongResult } from '../../../types';
import { usePlaybackStore, selectDisplayDuration, selectDisplayPlayerState } from '../../../stores/usePlaybackStore';
import { currentTime } from '../../../stores/motionSignals';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';

// src/library/suites/netease/useNeteasePlayback.ts
// netease suite 的播放态订阅（迷你播放条、圆形播放按钮、歌曲行序号共用）。
//
// 为什么 suite 直接订阅 store，而不改 core 的 surface 契约：
// core 的 LibraryHomeData 只给了 onTogglePlayback 这条**命令**，没有给状态；而这个 suite 是
// 二开新增的（上游统一用播放胶囊，手机上不好操作才在这里另做一条），它的播放态与 core 那套
// 导航/资源模型无关。为此往契约里加字段会让所有 suite 都背上这个依赖，不值。
//
// 播放态读 selectDisplayPlayerState 而不是 playerState：交叉淡入（automix）时 listener 听到的
// 已经是淡入的那首，但 playerState 还停在 IDLE（见 usePlaybackStore 里那条注释）。少这一步，
// 淡入窗口里迷你条会短暂显示成「暂停」。

/** 进度条的档位数：约每 0.5% 一档。够细到看不出跳，又不会每帧触发重渲染。 */
const PROGRESS_STEPS = 200;

/**
 * 当前播放进度（0..1）。
 *
 * 进度是每帧变化的，进度条**不能**每帧走 React state —— 那会让整条迷你条按帧率重渲染。
 * 这里只在跨过一个离散档位时才提交一次，时长未知（在线歌时长常缺）时恒为 0。
 */
export const useNeteaseProgress = (): number => {
    const duration = usePlaybackStore(selectDisplayDuration);
    const [, bump] = useReducer((value: number) => value + 1, 0);
    const stepRef = useRef(-1);

    const onTimeChange = useCallback((time: number) => {
        const step = duration > 0
            ? Math.round(Math.min(1, Math.max(0, time / duration)) * PROGRESS_STEPS)
            : 0;
        if (step !== stepRef.current) {
            stepRef.current = step;
            bump();
        }
    }, [bump, duration]);

    useMotionValueEvent(currentTime, 'change', onTimeChange);

    // 切歌后时长变了，上一次提交的档位不再可比，下一帧要重新提交一次。
    useMemo(() => { stepRef.current = -1; }, [duration]);

    const fraction = duration > 0
        ? Math.min(1, Math.max(0, currentTime.get() / duration))
        : 0;
    return fraction;
};

/** 当前是否在播放。交叉淡入窗口里也算播放中（理由见文件头）。 */
export const useNeteaseIsPlaying = (): boolean => (
    usePlaybackStore(selectDisplayPlayerState) === PlayerState.PLAYING
);

/** 当前歌曲的播放身份键（与墙上磁贴、队列浮岛同一份判定）。 */
export const useNeteaseCurrentKey = (): string | null => {
    const currentSong = usePlaybackStore(state => state.currentSong);
    return useMemo(() => (currentSong ? getPlaybackSongKey(currentSong) : null), [currentSong]);
};

/**
 * 某一首是否正在播放。
 *
 * 按播放键比对，而不是按对象引用：列表里那首歌和 store 里那首是两次不同的取数结果，
 * 引用相等判断不了「同一首」。
 */
export const useNeteaseTrackPlaying = (track: SongResult | null | undefined): boolean => {
    const currentKey = useNeteaseCurrentKey();
    const isPlaying = useNeteaseIsPlaying();
    return Boolean(track) && isPlaying && getPlaybackSongKey(track as SongResult) === currentKey;
};

/**
 * 「正在播的就是这一批」——歌单 / 歌手页的「播放全部」按钮用它。
 *
 * 存在的理由是点击语义：这个按钮的默认动作是 playAll(整批)。如果只是把 isPlaying 换成
 * 「全局在播」，按钮会在播放中变成播放态图形，点击却仍然 playAll —— 那就从「图标不更新」
 * 变成「图标说谎且点击行为与图标相反」的新 bug。所以这里要求**正在播的歌确实属于这一批**，
 * 命中时把动作换成 togglePlayback（暂停），没命中时保持 Play + 播放全部。
 *
 * 判定用「当前这首歌在这批里」，不比对整条队列：那批列表可能只取了前 N 首（分页），
 * 队列却是全量，逐项比对会永远不相等。
 */
export const useNeteaseScopePlaying = (tracks: readonly SongResult[] | undefined): boolean => {
    const currentKey = useNeteaseCurrentKey();
    const isPlaying = useNeteaseIsPlaying();
    return useMemo(() => {
        if (!isPlaying || !currentKey || !tracks?.length) return false;
        return tracks.some(track => getPlaybackSongKey(track) === currentKey);
    }, [currentKey, isPlaying, tracks]);
};
