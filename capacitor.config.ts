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
    //
    // insetsHandling: 'disable' —— 2026-10-14 实测后改。
    //
    // 为什么不能用 'css'（本文件之前写的就是它，注释里的理由是错的）：
    // Capacitor 内置 SystemBars.java 的 initWindowInsetsListener() 里
    //   shouldPassthroughInsets = getWebViewMajorVersion() >= 140 && hasViewportCover
    // 本机 WebView 是 138.0.7204.179（dumpsys webviewupdate 实测），低于 140，
    // 于是永远走不到那条「setPadding(0,0,0,0) + 把 inset 注入 --safe-area-inset-*」的分支，
    // 而是落到 fallback：
    //   v.setPadding(systemBarsInsets.left, top, right, bottom);   // 给 decorView 加原生内边距
    //   ...setInsets(systemBars|displayCutout, Insets.of(0,0,0,0)); // 再故意把 CSS 变量写成 0
    // 实测后果：WebView 视口 754x305，而屏幕是 795x362 —— 左边被缩掉 140px、
    // 上面 140px、下面 56px，露出的 decorView 背景是白的，三侧各一条白带；
    // 同时 --safe-area-inset-* 恒为 0（那是被强制置零的，不是「没有 inset」）。
    // 也就是说 'css' 在 WebView < 140 上不但没起到作用，反而制造了 padding，
    // CSS 侧无法补救 —— 必须在原生层关掉。
    //
    // 'disable' 的效果：initWindowInsetsListener() 直接 return，不再给 decorView
    // 加 padding。targetSdk 36 的强制 edge-to-edge 本来就让 WebView 铺满整屏，
    // 于是内容真正全屏，正是播放器要的效果。
    //
    // 为什么关掉 inset 不会破坏布局：本仓库 src/ 下对 safe-area 的引用为 0 处，
    // 没有任何一个固定 UI 元素靠 inset 变量定位；播放页是整屏可视化舞台，
    // 本来就要铺满。代价是刘海/手势条区域下方的固定按钮（设置、进度条）可能被
    // 系统栏压住一点，这是全屏播放器的预期取舍。日后 WebView 升到 140+，
    // 'css' 才会真的生效，但本应用仍应保持 'disable'。
    SystemBars: {
      insetsHandling: 'disable',
      // 保留 viewport-fit=cover（index.html 里也有）：WebView ≥140 时
      // env(safe-area-inset-*) 才能给出真实值，留着没有副作用。
      initialViewportFitValueHint: 'cover',
      // 浅色图标配深色底（Folia 主题底色 #09090b 为近黑）。
      // 隐藏时这个图标明暗无意义，但保留一个明确值避免落到 DEFAULT 走主题推断。
      style: 'LIGHT',
      // 沉浸式全屏：隐藏状态栏与手势导航条。
      // Capacitor 内置 SystemBars 的 hidden → WindowInsetsControllerCompat
      // .hide(Type.systemBars())，systemBars 同时含 statusBars 与 navigationBars，
      // 正好是「状态栏 + 底部小黑/白条」一起消失。
      //
      // hidden 与 insetsHandling 是两件独立的事：SystemBars.java 的 initSystemBars()
      // 里 initWindowInsetsListener() 之后无条件执行 setHidden(hidden, "")，
      // 所以把 insetsHandling 改成 'disable' 不会让系统栏重新冒出来。
      // 注意 handleOnConfigurationChanged() 只重新 setStyle、不重新 setHidden，
      // 旋转屏幕后若系统栏被唤出需要重进 App 才会再次隐藏。
      hidden: true,
    },
  },
};

export default config;
