import type { CapacitorConfig } from '@capacitor/cli';

// 当前文件：Folia Android Capacitor 容器的构建与 WebView 配置。
//
// 路线说明见 docs/dev/ANDROID.md：Android 版不移植 Electron 主进程，而是把已有的
// Web 构建（vite → dist/）装进 Capacitor WebView 壳，音源后端走远端服务。

const config: CapacitorConfig = {
  // 与桌面版沿用同一个 appId，避免两套身份。
  appId: 'top.izuna.foliamajor',
  appName: 'Folia',
  // vite 的产物目录。构建时务必带 VITE_ANDROID_BUILD=1，
  // 由 dev/android/stripCdnImportmapPlugin.mjs 剥离 aistudiocdn.com 的 CDN importmap，
  // 否则 WebView 冷启动会去外网拉 react，离线直接白屏。
  webDir: 'dist',
  loggingBehavior: 'debug',
  backgroundColor: '#09090b',
  server: {
    // 加载打进 APK 的本地 dist/，不走远程站点。androidScheme 用 https 才能拿到
    // 安全上下文（File System Access API 等依赖它），cleartext 关闭对应
    // AndroidManifest 里的 android:usesCleartextTraffic="false"。
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: '#09090b',
      showSpinner: false,
    },
    // Capacitor 8 内置的 SystemBars（不需要额外安装插件）。
    // targetSdk 36 下 Android 15/16 强制 edge-to-edge，且 Android 16 已删除
    // windowOptOutEdgeToEdgeEnforcement 退避开关，没有出口。
    // insetsHandling: 'css' 让框架用 WindowInsetsCompat 读真实 inset 并注入
    // --safe-area-inset-* 变量 —— 这一步绕开了 Android WebView < 140 上
    // env(safe-area-inset-*) 返回错误值的已知 bug，必须靠它而不是只靠 env()。
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // 浅色图标配深色底（Folia 主题底色 #09090b 为近黑）。
      style: 'LIGHT',
    },
  },
};

export default config;
