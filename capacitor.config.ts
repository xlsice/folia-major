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
    // 加载打进 APK 的本地 dist/，不走远程站点。
    //
    // androidScheme 用 https（2026-10-14 从 http 切回）：音源 API 已迁到公网
    // https://api.u2020682.nyat.app:18329（笔记本常驻 ncm + SakuraFRP TCP 隧道
    // #29523356，natfrp 为 *.u2020682.nyat.app 签发的是可信 CA 证书，
    // curl 实测 ssl_verify_result=0，不是自签），所以不必再为了明文 HTTP 降级 scheme。
    // 顺带说明：http://localhost 本来就被 Chromium 当 secure context，
    // 所以切 https 之后 Service Worker / vite-plugin-pwa 只会更稳，不会有回归。
    androidScheme: 'https',
    hostname: 'localhost',
    // 不再需要放行明文：音源 API 是可信 HTTPS，WebView 默认策略即可。
    // 如果要临时切回内网 http://<笔记本IP>:3000 调试，把这里改回 true，
    // 并恢复 android/app/src/main/AndroidManifest.xml 里的 networkSecurityConfig。
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
      // 隐藏时这个图标明暗无意义，但保留一个明确值避免落到 DEFAULT 走主题推断。
      style: 'LIGHT',
      // 沉浸式全屏：隐藏状态栏与手势导航条。
      // Capacitor 内置 SystemBars 的 hidden → WindowInsetsControllerCompat
      // .hide(Type.systemBars())，systemBars 同时含 statusBars 与 navigationBars，
      // 正好是「状态栏 + 底部小黑/白条」一起消失。
      // 隐藏后 WindowInsetsCompat.getInsets(systemBars) 归零：本机 WebView 138 < 140
      // 走的是 SystemBars.java 里 setPadding(0,0,0,0) 那条分支，内容因此天然铺满整屏，
      // 不需要给固定 UI 元素补 safe-area 内边距。
      hidden: true,
    },
  },
};

export default config;
