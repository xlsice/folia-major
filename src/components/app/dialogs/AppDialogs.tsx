import React from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import LyricMatchModal from '../../modal/LyricMatchModal';
import NaviLyricMatchModal from '../../modal/NaviLyricMatchModal';
import OnlineLyricMatchModal from '../../modal/OnlineLyricMatchModal';
import UnavailableReplacementDialog from '../../modal/UnavailableReplacementDialog';
import SettingsModal from '../../modal/SettingsModal';
import ConfirmDialog from '../../shared/ConfirmDialog';
import type { AppDialogsModel } from './buildAppDialogsModel';
import { countRender } from '../../../dev/renderCount';

// Centralized app-level dialog and toast renderer for the player shell.
type AppDialogsProps = {
    model: AppDialogsModel;
};

const AppDialogs: React.FC<AppDialogsProps> = ({ model }) => {
    countRender('AppDialogs');
    const { statusToast, lyricMatchDialog, naviLyricMatchDialog, onlineLyricMatchDialog, unavailableReplacementDialog, settingsDialog, wallpaperEntryConfirmDialog } = model;

    return (
        <>
            {createPortal(
                <AnimatePresence>
                    {statusToast && (
                        // 居中用 inset-x-0 + mx-auto，不要用 left-1/2 + x:-50%。
                        // 绝对定位只设 left 时，可用宽度 = 视口宽 - left = 半屏；长文案（尤其中文，
                        // min-content 只有一个字）会触发 flex 收缩被压成一列窄条，再被 rounded-full
                        // 渲染成圆、字溢出圆外。inset-x-0 让可用宽度回到整个视口，w-fit 再收回到内容宽。
                        <motion.div
                            key={statusToast.toastKey}
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 30 }}
                            exit={{ opacity: 0, y: -20 }}
                            className={`fixed top-0 inset-x-0 z-[210] mx-auto w-fit max-w-[calc(100vw-2rem)] px-6 py-3 backdrop-blur-md rounded-full font-medium text-sm shadow-xl flex flex-wrap items-center justify-center gap-x-3 gap-y-2 ${statusToast.onAction || statusToast.onCancel ? 'pointer-events-auto' : 'pointer-events-none'} ${statusToast.isDaylight ? 'bg-white/70 text-zinc-800 border border-black/5' : 'bg-white/10 text-white'}`}
                        >
                            {statusToast.type === 'error'
                                ? <AlertCircle size={18} className={statusToast.isDaylight ? 'text-red-500' : 'text-red-400'} />
                                : statusToast.type === 'success'
                                    ? <CheckCircle2 size={18} className={statusToast.isDaylight ? 'text-green-600' : 'text-green-400'} />
                                    : <Sparkles size={18} className={statusToast.isDaylight ? 'text-blue-600' : 'text-blue-400'} />}
                            <span>{statusToast.text}</span>
                            {statusToast.onCancel && statusToast.cancelLabel && (
                                <button
                                    type="button"
                                    onClick={statusToast.onCancel}
                                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${statusToast.isDaylight ? 'text-zinc-500 hover:bg-black/5 hover:text-zinc-800' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                                >
                                    {statusToast.cancelLabel}
                                </button>
                            )}
                            {statusToast.onAction && statusToast.actionLabel && (
                                <button
                                    type="button"
                                    onClick={statusToast.onAction}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${statusToast.isDaylight ? 'bg-zinc-900 text-white hover:bg-zinc-700' : 'bg-white text-zinc-950 hover:bg-white/85'}`}
                                >
                                    {statusToast.actionIcon && <statusToast.actionIcon size={14} className={statusToast.isDaylight ? 'text-amber-300' : 'text-amber-500'} />}
                                    {statusToast.actionLabel}
                                </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body,
            )}

            {lyricMatchDialog && <LyricMatchModal {...lyricMatchDialog} />}
            {naviLyricMatchDialog && <NaviLyricMatchModal {...naviLyricMatchDialog} />}
            {onlineLyricMatchDialog && <OnlineLyricMatchModal {...onlineLyricMatchDialog} />}
            {unavailableReplacementDialog && <UnavailableReplacementDialog {...unavailableReplacementDialog} />}
            {wallpaperEntryConfirmDialog && <ConfirmDialog {...wallpaperEntryConfirmDialog} />}
            <AnimatePresence>
                {settingsDialog && <SettingsModal {...settingsDialog} />}
            </AnimatePresence>
        </>
    );
};

export default React.memo(AppDialogs);
