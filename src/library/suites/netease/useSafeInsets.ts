import { useEffect, useState } from 'react';

// src/library/suites/netease/useSafeInsets.ts
// 安全区（顶部 / 底部 / 左右）。**不要用 env(safe-area-inset-*)**——它在这台机器上大部分恒为 0（见下）。
//
// 背景（2026-10-14 真机实测）：capacitor.config.ts 的 SystemBars.insetsHandling = 'disable'
// 是为了真全屏（本机 WebView 138.x < Capacitor 判定修复的 140，用 'css' 会给 decorView
// 加原生 padding，露出白色背景，三侧白带）。代价就是拿不到真实 inset：
//   env(safe-area-inset-bottom)  = 0     ← 底部
//   env(safe-area-inset-top)     = 40    ← 顶部（只有底部是 0）
// 而 Android 实测手势导航条 frame=[0,2724][1264,2780]、bottom=56px=16dp，
// 也就是底部 tab 需要的 16dp 避让拿不到 → 系统手势条压在「在线/本地/专辑/远程」上，
// 点标签其实点在手势条。
//
// 顶部同理不能省：沉浸式下页面内容铺到状态栏底下，套件里每个页面顶栏都是 y=0 起排，
// 标题会整个埋进 40px 的状态栏（2026-10-15 实测 h1 top:14~38 vs inset 40）。
// NeteaseShell 在最外层垫 insets.top，四个 surface 一次全修。
//
// 解法：SafeInsetsPlugin.java 用 WindowInsetsCompat 读真实值，注入成 --nt-inset-* CSS 变量，
// 这个 hook 只负责读它。没有原生插件时（web / 桌面）回落到 env()，此时取 0 也安全，
// 因为桌面没有系统手势条 / 状态栏。

export type SafeInsets = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    /** 软键盘高度（弹起时底部栏要让位）。0 表示收起。 */
    keyboard: number;
};

/** 全部为 0：没有任何可用来源时的安全回落。 */
const ZERO: SafeInsets = { left: 0, top: 0, right: 0, bottom: 0, keyboard: 0 };

/** 从 CSS 变量读一个 inset；变量缺失或不可解析时用 env()，再不行给 0。 */
const readVar = (name: string, envName: string): number => {
    if (typeof window === 'undefined') return 0;
    const raw = document.documentElement.style.getPropertyValue(name);
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && raw.trim() !== '') return parsed;

    // 没有注入变量（web / 桌面构建）：用 env() 试试，都是 0 也没关系。
    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;left:0;top:0;width:0;height:0;padding-${envName}:env(${envName});`;
    document.body.appendChild(probe);
    const value = Number.parseFloat(getComputedStyle(probe).getPropertyValue(`padding-${envName}`)) || 0;
    probe.remove();
    return value;
};

const readInsets = (): SafeInsets => ({
    left: readVar('--nt-inset-left', 'left'),
    top: readVar('--nt-inset-top', 'top'),
    right: readVar('--nt-inset-right', 'right'),
    bottom: readVar('--nt-inset-bottom', 'bottom'),
    keyboard: readVar('--nt-inset-keyboard', 'bottom'),
});

/** Capacitor 原生插件 SafeInsets（android/app/.../SafeInsetsPlugin.java）。 */
type SafeInsetsPluginShape = {
    getInsets: () => Promise<{
        left?: number; top?: number; right?: number; bottom?: number; keyboard?: number;
    }>;
};

/**
 * 首帧主动问原生要一次 inset。
 *
 * 为什么需要：原生 insets 回调可能在页面加载完之前就触发完了，那次 setProperty
 * 写进的是「还没建好的文档」，前端永远读不到（2026-10-14 真机实测就是这个症状：
 * logcat 显示 injected bottom="16px"，但页面里 --nt-inset-bottom 是空）。
 * 所以 CSS 变量不可信时，直接问插件要数值。
 */
const pullFromNative = async (): Promise<SafeInsets | null> => {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> } }).Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    const plugin = cap.Plugins?.SafeInsets as SafeInsetsPluginShape | undefined;
    if (!plugin?.getInsets) return null;
    try {
        const result = await plugin.getInsets();
        if (!result || typeof result.bottom !== 'number') return null;
        return {
            left: result.left ?? 0,
            top: result.top ?? 0,
            right: result.right ?? 0,
            bottom: result.bottom,
            keyboard: result.keyboard ?? 0,
        };
    } catch {
        // 插件不可用（老 APK 没重编）时静默：回落 env()，桌面/网页上本来就该是 0。
        return null;
    }
};

/**
 * 订阅安全区变化。原生插件在 insets 变化时写 CSS 变量，这里用 MutationObserver
 * 盯着 style 属性——比轮询便宜，也不会漏掉转屏 / 键盘弹起。
 */
export const useSafeInsets = (): SafeInsets => {
    const [insets, setInsets] = useState<SafeInsets>(ZERO);

    useEffect(() => {
        let cancelled = false;

        const apply = (next: SafeInsets) => {
            if (cancelled) return;
            setInsets(previous => (
                previous.left === next.left && previous.top === next.top
                && previous.right === next.right && previous.bottom === next.bottom
                && previous.keyboard === next.keyboard
                    ? previous
                    : next
            ));
        };

        const sync = () => apply(readInsets());

        // 先用 CSS 变量（同步，立刻生效），再异步问原生补一次（防注入时机早于页面）。
        sync();
        void pullFromNative().then(native => {
            if (native) apply(native);
        });

        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
        // 键盘弹起 / 转屏时窗口尺寸也会变，双保险。
        const onOrientation = () => {
            sync();
            void pullFromNative().then(native => native && apply(native));
        };
        window.addEventListener('resize', sync);
        window.addEventListener('orientationchange', onOrientation);

        return () => {
            cancelled = true;
            observer.disconnect();
            window.removeEventListener('resize', sync);
            // 监听器换了引用，必须解绑同一个，否则每次重渲染都泄漏一个。
            window.removeEventListener('orientationchange', onOrientation);
        };
    }, []);

    return insets;
};

/**
 * 底部固定栏该垫多高。
 *
 * 键盘弹起时整条栏要抬到键盘上方（网易云是直接把底栏隐藏，这里选抬起来，
 * 因为队列 tab 在弹键盘时仍有用）。所以取两者里更大的那个。
 */
export const bottomBarPadding = (insets: SafeInsets): number => Math.max(insets.bottom, insets.keyboard);

/** 左右两侧的安全垫（刘海屏 / 曲面屏边缘）。 */
export const sideBarPadding = (insets: SafeInsets): { paddingLeft: number; paddingRight: number } => ({
    paddingLeft: insets.left,
    paddingRight: insets.right,
});