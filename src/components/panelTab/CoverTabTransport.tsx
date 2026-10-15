import React, { useCallback, useRef, useState } from 'react';
import { motion, motionValue, useMotionValueEvent, type MotionValue } from 'framer-motion';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';

// src/components/panelTab/CoverTabTransport.tsx
// 封面页签底部的窄屏播放控制（手机版二开，桌面端不画）。
//
// 为什么单独一个文件：CoverTab 是纯展示的，播放控制会带 seek 与每帧变化的位置，两者混在一起
// 会让「只是想显示歌名」这件事也背上拖动的复杂度。拆开后 CoverTab 只多一个 <CompactTransport/>。
//
// 为什么进度条不把位置写进 React state：播放位置每帧都变，进 state 等于让整张封面卡按帧率重渲染
// （这正是 skills/frontend-runtime-guardrails 说的那件事）。所以：
//   - 填充用 motion 的 scaleX 直接算，绕开 React；
//   - 左右两个时间文本按「整秒」才提交一次（LABEL_TICK_SECONDS），够读、不抖；
//   - 拖动时把 range 的 value 提到本地 state，让手指位置立刻跟手，松手才真正 seek。
//
// 全程不用 require：这是 ESM，require 不可用；而「没有 currentTime 时给个零值」如果用 hook
// 分支写，hook 调用顺序就会随 props 变化（违反 hooks 规则），所以改成模块级常量 —— 一个永远为 0 的
// MotionValue，与播放无关，全应用共用同一个实例。

/** 时间标签的更新粒度（秒）。整秒变化才重渲染一次文本。 */
const LABEL_TICK_SECONDS = 1;

/** 没有 currentTime 时使用的占位信号。全应用共用一个实例，不随组件重建。 */
const ZERO_TIME: MotionValue<number> = motionValue(0);

/** 秒 → mm:ss（超过一小时走 h:mm:ss）。 */
export const formatTransportTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
};

type CompactTransportProps = {
    isPlaying: boolean;
    onTogglePlay: () => void;
    onPrevTrack: () => void;
    onNextTrack: () => void;
    canGoPrev: boolean;
    canGoNext: boolean;
    controlsDisabled?: boolean;
    /** 播放位置（秒）。全局 MotionValue，改它不会触发 React 重渲染。 */
    currentTime?: MotionValue<number>;
    /** 曲目总长（秒）。0 或 undefined 表示时长未知（在线歌常见），此时不画进度条。 */
    duration?: number;
    onSeek?: (time: number) => void;
};

const CompactTransport: React.FC<CompactTransportProps> = ({
    isPlaying,
    onTogglePlay,
    onPrevTrack,
    onNextTrack,
    canGoPrev,
    canGoNext,
    controlsDisabled = false,
    currentTime,
    duration = 0,
    onSeek,
}) => {
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const timeSignal = currentTime ?? ZERO_TIME;

    // 拖动中：range 由本地 state 驱动，忽略外部的每帧位置，否则手会被播放进度拽回去。
    const [dragValue, setDragValue] = useState<number | null>(null);
    const [, setLabelTick] = useState(0);

    // 时间文本只在整秒变化时提交一次；拖动中不跟随（否则文字会在手指下乱跳）。
    useMotionValueEvent(timeSignal, 'change', time => {
        if (dragValue !== null) return;
        const tick = Math.floor(Number.isFinite(time) ? time : 0) / LABEL_TICK_SECONDS;
        setLabelTick(previous => (previous === tick ? previous : tick));
    });

    const rawPosition = dragValue ?? timeSignal.get();
    const position = Number.isFinite(rawPosition) ? Math.min(duration || Number.MAX_SAFE_INTEGER, Math.max(0, rawPosition)) : 0;
    // 填充比例走 scaleX(origin-left) 而不是 width：前者是合成层属性，不触发布局。
    const fillScale = hasDuration ? Math.min(1, position / duration) : 0;

    const handleSeek = useCallback((next: number) => {
        if (!hasDuration || !onSeek) return;
        onSeek(Math.min(duration, Math.max(0, next)));
    }, [duration, hasDuration, onSeek]);

    const buttonClass = 'flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40 disabled:active:scale-100';

    return (
        <div className="mt-1 flex w-full flex-col gap-2" data-cover-transport>
            <div className="flex items-center justify-center gap-6">
                <button
                    type="button"
                    className={buttonClass}
                    onClick={onPrevTrack}
                    disabled={!canGoPrev || controlsDisabled}
                    aria-label="上一首"
                    title="上一首"
                    data-cover-transport-prev
                >
                    <SkipBack size={22} fill="currentColor" className="opacity-70" />
                </button>
                <button
                    type="button"
                    className={`${buttonClass} !h-12 !w-12`}
                    onClick={onTogglePlay}
                    disabled={controlsDisabled}
                    aria-label={isPlaying ? '暂停' : '播放'}
                    title={isPlaying ? '暂停' : '播放'}
                    data-cover-transport-toggle={isPlaying ? 'playing' : 'paused'}
                >
                    {isPlaying
                        ? <Pause size={24} fill="currentColor" />
                        : <Play size={24} fill="currentColor" className="ml-0.5" />}
                </button>
                <button
                    type="button"
                    className={buttonClass}
                    onClick={onNextTrack}
                    disabled={!canGoNext || controlsDisabled}
                    aria-label="下一首"
                    title="下一首"
                    data-cover-transport-next
                >
                    <SkipForward size={22} fill="currentColor" className="opacity-70" />
                </button>
            </div>

            {/* 时长未知（在线歌常缺）时整条进度不画：给一个永远 0% 的假进度比没有更糟。 */}
            {hasDuration && (
                <div className="flex items-center gap-2 px-1" data-cover-progress>
                    <span className="w-9 shrink-0 text-right text-[10px] tabular-nums opacity-60">
                        {formatTransportTime(position)}
                    </span>
                    <div className="relative h-6 flex-1">
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-current opacity-20">
                            <motion.div
                                className="h-full w-full origin-left rounded-full bg-current"
                                style={{ scaleX: fillScale }}
                            />
                        </div>
                        {/* range 盖在轨道上：原生控件，触摸与鼠标都支持，不必自己写手势。 */}
                        <input
                            type="range"
                            min={0}
                            max={duration}
                            step={0.1}
                            value={Math.min(duration, position)}
                            onChange={event => setDragValue(Number(event.target.value))}
                            onPointerDown={() => setDragValue(timeSignal.get())}
                            onPointerUp={event => {
                                handleSeek(Number((event.target as HTMLInputElement).value));
                                setDragValue(null);
                            }}
                            onKeyUp={event => {
                                if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                                    handleSeek(Number((event.target as HTMLInputElement).value));
                                    setDragValue(null);
                                }
                            }}
                            onBlur={() => setDragValue(null)}
                            disabled={!onSeek || controlsDisabled}
                            aria-label="播放进度"
                            className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
                        />
                    </div>
                    <span className="w-9 shrink-0 text-[10px] tabular-nums opacity-60">
                        {formatTransportTime(duration)}
                    </span>
                </div>
            )}
        </div>
    );
};

export default CompactTransport;
