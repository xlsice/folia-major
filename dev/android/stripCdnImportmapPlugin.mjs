// dev/android/stripCdnImportmapPlugin.mjs

/**
 * Android 构建时剥离 index.html 里的 CDN importmap。
 *
 * 背景：index.html 用 `<script type="importmap">` 把 react / react-dom / framer-motion /
 * lucide-react / i18next 等核心库全部指向 `https://aistudiocdn.com/`（Google AI Studio 的 CDN）。
 * 这是给网页版（Vercel 部署）准备的，vite 不会移除它，会原样保留到产物 HTML，
 * 于是运行时浏览器优先按 importmap 去 CDN 取包，而不是用 vite 打进 dist 的那份。
 *
 * 对 Android 壳（Capacitor）这是致命的：WebView 加载的是 APK 内置的 dist/，
 * 冷启动却要访问外网 CDN 拉核心依赖 —— 断网白屏，且该域名在国内基本不可达。
 * 另外 importmap 里的版本（react ^19.2.0 / framer-motion ^12.23.24 / lucide-react ^0.554.0）
 * 与 package.json（^19.3.0 / ^13.4.3 / ^1.48.0）对不上，网页版和桌面版本来就不是同一套库。
 *
 * 只在设置 VITE_ANDROID_BUILD=1 时生效，网页版构建行为完全不变。
 * 剥离后这些依赖走 vite 的常规解析，被正常 bundle 进 dist/，APK 自包含。
 *
 * order: 'pre' —— 必须在 vite 内置的 importmap 处理之前动手，否则可能已经来不及。
 */

/** 匹配一整块 <script type="importmap"> … </script>，容忍换行与缩进。 */
const IMPORTMAP_BLOCK = /<script\s+type=["']importmap["'][^>]*>[\s\S]*?<\/script>/gi;

export function stripCdnImportmapPlugin() {
    return {
        name: 'folia-android-strip-cdn-importmap',
        apply: 'build',
        transformIndexHtml: {
            order: 'pre',
            handler(html) {
                if (process.env.VITE_ANDROID_BUILD !== '1') {
                    return html;
                }
                return html.replace(IMPORTMAP_BLOCK, '');
            },
        },
    };
}
