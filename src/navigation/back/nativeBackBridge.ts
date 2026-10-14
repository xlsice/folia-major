// src/navigation/back/nativeBackBridge.ts
// 返回键的原生桥接：整个项目里唯一 import '@capacitor/app' 的地方。
//
// 为什么需要它（2026-10-14 真机实测）：
// Capacitor 8 的 Android 壳**不做任何返回键桥接**——`BridgeActivity` 没有 onBackPressed，
// Activity 默认行为就是 finish()，于是系统返回键在任何界面都直接回桌面。
// 装上 @capacitor/app 之后，AppPlugin.load() 会注册一个 OnBackPressedCallback：
//
//     handleOnBackPressed() {
//         if (!hasListeners("backButton")) { if (canGoBack) goBack(); }
//         else { notifyListeners("backButton", {canGoBack}, true); }
//     }
//
// 注意两点：
// 1. 装了插件就已经接管返回键（哪怕没注册 listener），此时行为从「直接 finish」变成
//    「能退就退、不能退就无反应」。所以只装不接会得到一个"按返回没反应"的壳。
// 2. 一旦注册了 backButton listener，退出 App 必须由我们显式调 App.exitApp()。
//
// 平台隔离：只在 Capacitor 原生壳里订阅。网页版 / Electron 桌面端没有任何系统返回键，
// 不该被这段逻辑影响 —— 两道闸（构建期 VITE_ANDROID_BUILD + 运行期 isNativePlatform）。

import { Capacitor } from '@capacitor/core';

/** @capacitor/app 只在原生壳有意义；动态导入，网页构建直接把它消掉。 */
type AppModule = typeof import('@capacitor/app');

const NOOP_UNSUBSCRIBE = () => {};

/** 这个构建是不是安卓壳（构建期标记 + 运行期平台，二者都要过）。 */
export const isNativeShell = (): boolean => {
    const env = import.meta.env as Record<string, unknown> | undefined;
    if (!env?.VITE_ANDROID_BUILD) return false;
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
};

const loadAppModule = async (): Promise<AppModule | null> => {
    try {
        return await import('@capacitor/app');
    } catch (error) {
        // 没装插件 / 原生侧未 sync：返回键退回系统默认行为，不影响其余功能。
        console.warn('[nativeBackBridge] failed to load @capacitor/app:', error);
        return null;
    }
};

/**
 * 订阅系统返回键。非原生壳返回空函数（调用方可以无条件调用）。
 * 返回的函数用于取消订阅；调用方需自己处理 await 期间卸载的竞态。
 */
export const subscribeNativeBackButton = async (onBack: () => void): Promise<() => void> => {
    if (!isNativeShell()) return NOOP_UNSUBSCRIBE;
    const app = await loadAppModule();
    if (!app) return NOOP_UNSUBSCRIBE;
    try {
        const listener = await app.App.addListener('backButton', () => {
            onBack();
        });
        return () => {
            void listener.remove();
        };
    } catch (error) {
        console.warn('[nativeBackBridge] failed to subscribe backButton:', error);
        return NOOP_UNSUBSCRIBE;
    }
};

/** 真正结束 Activity。非原生壳是空操作（网页/桌面没有这一步）。 */
export const exitNativeApp = async (): Promise<void> => {
    if (!isNativeShell()) return;
    const app = await loadAppModule();
    if (!app) return;
    try {
        await app.App.exitApp();
    } catch (error) {
        console.error('[nativeBackBridge] exitApp failed:', error);
    }
};
