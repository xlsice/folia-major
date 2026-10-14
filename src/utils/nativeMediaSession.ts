// src/utils/nativeMediaSession.ts
//
// 安卓端的「影子媒体会话」桥。原生侧见
// android/app/src/main/java/top/izuna/foliamajor/NativeMediaSessionPlugin.java
//
// 为什么需要它（2026-10-15 真机实测）：
//   Android WebView 里 navigator.mediaSession **根本不存在**（取 playbackState 得到
//   "unsupported"），所以 utils/mediaSessionSync.ts 在安卓上是一段彻底的空操作 ——
//   useMediaSessionBridge 的三个 effect 全部在第一行就 return 了。
//   后果有两条：
//     1. 没有通知栏 / 锁屏 / 耳机键（没有 MediaSession）
//     2. 没有 mediaPlayback 前台服务把进程提离后台 cgroup，
//        隐藏页面上的 <audio>.play() 会被静默吞掉（Promise RESOLVED 但永远 paused=true），
//        表现就是「一首歌放完接不上下一首」
//
// 平台隔离：与 navigation/back/nativeBackBridge.ts 同一套两道闸 ——
// 构建期 VITE_ANDROID_BUILD + 运行期 Capacitor.isNativePlatform()，
// 网页版 / Electron 上本模块整体退化为空操作。

import { Capacitor } from '@capacitor/core';

export type NativeMediaAction =
    | { action: 'play' }
    | { action: 'pause' }
    | { action: 'next' }
    | { action: 'prev' }
    | { action: 'seek'; positionMs: number };

type SyncPayload = {
    playing: boolean;
    positionMs: number;
    durationMs: number;
    rate: number;
    title?: string | null;
    artist?: string | null;
    album?: string | null;
};

type PluginShape = {
    sync?: (payload: SyncPayload) => Promise<void>;
    setArtwork?: (payload: { src: string }) => Promise<void>;
    stop?: () => Promise<void>;
    requestNotificationPermission?: () => Promise<void>;
    addListener?: (event: 'mediaAction', cb: (data: unknown) => void) => { remove: () => void };
};

const NOOP_UNSUBSCRIBE = () => {};

const isAndroidShell = (): boolean => {
    const env = import.meta.env as Record<string, unknown> | undefined;
    if (!env?.VITE_ANDROID_BUILD) return false;
    try {
        return Capacitor.isNativePlatform();
    } catch {
        return false;
    }
};

const getPlugin = (): PluginShape | null => {
    if (!isAndroidShell()) return null;
    const cap = (globalThis as {
        Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
    }).Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    return (cap.Plugins?.NativeMediaSession as PluginShape | undefined) ?? null;
};

/** 本模块是否真的有原生实现可用（探针 / 自检用）。 */
export const isNativeMediaSessionAvailable = (): boolean => getPlugin() !== null;

/**
 * 推送播放状态。
 *
 * 频率照 onTimeUpdate 的节奏（约 4Hz）就够了 —— 通知栏进度条靠它更新，
 * 再密只是白白过桥。
 */
export const syncNativeMediaSession = (payload: SyncPayload): void => {
    const plugin = getPlugin();
    if (!plugin?.sync) return;
    // 原生侧用 getInt 取值，这里必须是整数，否则取不到会退回 0。
    void plugin.sync({
        ...payload,
        positionMs: Math.max(0, Math.round(payload.positionMs)),
        durationMs: Math.max(0, Math.round(payload.durationMs)),
    }).catch((error) => {
        console.warn('[nativeMediaSession] sync failed', error);
    });
};

/**
 * 上传封面。
 *
 * 优先直接把 http(s) URL 丢给原生让它自己下载 —— 实测走页面 fetch 这条路是走不通的：
 * 封面在 m801.music.126.net 之类的主机上，而 WebView 的 origin 是 https://localhost，
 * 跨域 fetch 被 CORS 拒掉，metadata 里就一直只有 3 个字段、没有封面。
 * 原生侧不受同源策略约束，而且不用把几百 KB 的图片过桥。
 *
 * 只有 blob: / data: 这类页面私有地址，原生拉不到，才转 base64 兜底。
 */
export const setNativeArtwork = (source: string): void => {
    const plugin = getPlugin();
    if (!plugin?.setArtwork || !source) return;
    void plugin.setArtwork({ src: source }).catch((error) => {
        console.warn('[nativeMediaSession] setArtwork failed', error);
    });
};

/**
 * 把 blob:/data: 地址转成 data URI 交给原生。
 * http(s) 的别走这里 —— 见 setNativeArtwork 的说明，直接给 URL 就行。
 */
const toDataUri = async (url: string, maxEdge: number): Promise<string | null> => {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        if (blob.size <= 0 || !blob.type.startsWith('image/')) return null;

        // 先缩到 maxEdge 再转 base64：原生侧要的是 Bitmap，
        // 直接把几百 KB 的原图丢过去既慢又没必要，通知栏显示也就那么点大。
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close?.();
        return canvas.toDataURL('image/jpeg', 0.85);
    } catch (error) {
        console.warn('[nativeMediaSession] artwork conversion failed', error);
        return null;
    }
};

const MAX_ARTWORK_EDGE = 512;

/**
 * 页面私有地址（blob:）转 data URI。失败返回 null，不抛。
 * 只在确实是 blob: 时才有意义，http(s) 交给原生下载。
 */
export const imageUrlToDataUri = async (url: string, maxEdge = MAX_ARTWORK_EDGE): Promise<string | null> => {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    if (!url.startsWith('blob:')) return null;
    return toDataUri(url, maxEdge);
};

/** 订阅系统媒体控制（通知栏 / 锁屏 / 耳机键）。 */
export const onNativeMediaAction = (handler: (action: NativeMediaAction) => void): (() => void) => {
    const plugin = getPlugin();
    if (!plugin?.addListener) return NOOP_UNSUBSCRIBE;

    let listener: { remove: () => void } | null = null;
    try {
        listener = plugin.addListener('mediaAction', (data) => {
            const raw = (data ?? {}) as { action?: string; positionMs?: number };
            if (!raw.action) return;
            if (raw.action === 'seek') {
                handler({ action: 'seek', positionMs: Number(raw.positionMs) || 0 });
                return;
            }
            if (raw.action === 'play' || raw.action === 'pause' || raw.action === 'next' || raw.action === 'prev') {
                handler({ action: raw.action });
            }
        });
    } catch (error) {
        console.warn('[nativeMediaSession] addListener failed', error);
        return NOOP_UNSUBSCRIBE;
    }

    return () => {
        try {
            listener?.remove();
        } catch {
            // 重复 remove 也无所谓
        }
    };
};

/**
 * 申请通知权限。
 *
 * 实测未授权时通知虽然被发布（dumpsys 里有 NotificationRecord），
 * 但 AppSettings importance=NONE，用户根本看不到 —— 通知栏这一项就废了。
 * 设备没有 root，adb pm grant 走不通，只能在应用内申请。
 *
 * 走插件自己的 @PluginMethod（内部 requestPermissionForAlias），
 * 而不是 @capacitor/core 的 Permissions —— 这个 Capacitor 版本的公开类型里没有导出它。
 */
export const requestNativeNotificationPermission = async (): Promise<boolean> => {
    if (!isAndroidShell()) return false;
    const plugin = getPlugin();
    if (!plugin?.requestNotificationPermission) return false;
    try {
        await plugin.requestNotificationPermission();
        return true;
    } catch (error) {
        console.warn('[nativeMediaSession] notification permission request failed', error);
        return false;
    }
};

/** 停止播放态（清空元数据 + 撤下通知）。 */
