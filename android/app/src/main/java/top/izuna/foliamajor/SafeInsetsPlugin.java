package top.izuna.foliamajor;

import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 安全区桥接（自写，替代 SystemBars 的 insetsHandling）。
 *
 * 为什么需要它（2026-10-14 实测）：
 * capacitor.config.ts 里 SystemBars.insetsHandling 用了 'disable'，因为本机 WebView 是
 * 138.x < Capacitor 源码里 WEBVIEW_VERSION_WITH_SAFE_AREA_FIX = 140 的阈值，走 'css' 分支时
 * Capacitor 会给 decorView 加原生 setPadding（露出的 decorView 背景是白的，三侧各一条白带），
 * 还要把 --safe-area-inset-* 强制写成 0。真全屏是对的，代价是**拿不到真实 inset**。
 *
 * 后果实测：env(safe-area-inset-bottom) = 0，于是底部标签栏贴到视口最底，
 * 系统手势导航条（Android 实测 frame=[0,2724][1264,2780]、bottom=56px=16dp）压在按钮上，
 * 点「在线/本地/专辑/远程」其实点在手势条上。
 *
 * 所以这里自己读 WindowInsetsCompat 并把真实值注入成 CSS 变量（--nt-inset-*），
 * 不走 env()，也不碰 decorView 的 padding —— WebView 仍然全屏，只是多了几个变量。
 */
@CapacitorPlugin(name = "SafeInsets")
public class SafeInsetsPlugin extends Plugin {

    private static final String VAR_PREFIX = "--nt-inset-";

    @Override
    public void load() {
        super.load();
        final View decorView = getBridge().getWebView().getRootView();
        // post 一次：此刻 WebView 还没 attach，第一次 insets 回调可能不来。
        decorView.post(() -> attach(decorView));
        // 页面可能晚于 insets 回调才加载完（首次启动尤甚），那时变量还写不进去。
        // 这里再挂一个延时兜底：直接读一次当前值补注入，前端也能随时主动调 getInsets。
        getBridge().getWebView().postDelayed(() -> {
            final WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decorView);
            if (insets == null) return;
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            inject(bars.left, bars.top, bars.right, bars.bottom, ime.bottom);
        }, 1200);
    }

    private void attach(View decorView) {
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            inject(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom), ime.bottom);
            // 原样返回，不消费：系统栏隐藏状态与其它插件的行为都不受影响。
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(decorView);
    }

    /**
     * 把 inset 写进 WebView 的 CSS 变量，供前端 --nt-inset-bottom 等直接取用。
     *
     * @param keyboard IME（软键盘）高度，**不能**拿 bottom 顶替 —— 前端 bottomBarPadding 取
     *                Math.max(bottom, keyboard)，两条路径给的值不一致时，搜歌弹键盘底部栏就抬不起来。
     */
    private void inject(int left, int top, int right, int bottom, int keyboardPx) {
        final float density = getBridge().getWebView().getResources().getDisplayMetrics().density;
        // 隐藏态下 inset 的 bottom 是 0，但手势条仍占着 → 与 getInsets 同一套兜底。
        final float minBottomPx = fallbackGestureDp() * density;
        final float effectiveBottom = Math.max(bottom, minBottomPx);
        // 原生是物理 px，CSS 变量要的是 CSS px：除以 density（WebView 里 1 CSS px = 1 dp）。
        final String l = trim(left / density);
        final String t = trim(top / density);
        final String r = trim(right / density);
        final String b = trim(effectiveBottom / density);
        final String k = trim(keyboardPx / density);
        // 逐条 setProperty —— 不能把 "a:1px;b:2px" 整串当成一个属性名传进去（那样什么都没设上）。
        final String script = String.format(
                java.util.Locale.US,
                "(function(){var s=document.documentElement.style;"
                        + "s.setProperty('%sleft','%spx');"
                        + "s.setProperty('%stop','%spx');"
                        + "s.setProperty('%sright','%spx');"
                        + "s.setProperty('%sbottom','%spx');"
                        + "s.setProperty('%skeyboard','%spx');"
                        + "return s.getPropertyValue('%sbottom');})()",
                VAR_PREFIX, l,
                VAR_PREFIX, t,
                VAR_PREFIX, r,
                VAR_PREFIX, b,
                VAR_PREFIX, k,
                VAR_PREFIX, b);
        getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(script, value ->
                        android.util.Log.i("SafeInsets", "injected bottom=" + value)));
    }

    /** 去掉 3.0 这种多余的 .0，纯粹为了日志好看。 */
    private static String trim(double value) {
        if (value == Math.floor(value) && !Double.isInfinite(value)) {
            return String.valueOf((long) value);
        }
        return String.format(java.util.Locale.US, "%.2f", value);
    }

    /**
 * 稳定态的兜底手势区高度（dp）。
 *
 * 为什么需要它（2026-10-14 真机实测）：本应用为了真全屏设了 SystemBars.hidden = true，
 * 系统导航条被 WindowInsetsController 隐藏之后，WindowInsetsCompat.getInsets(navigationBars())
 * **返回 bottom = 0**（实测 getInsets() → {left:0, top:40, right:0, bottom:0}）。
 * 但手势条**在屏幕上仍然占着 16dp**（dumpsys 实测 navigationBars frame=[0,2724][1264,2780]、
 * bottom=56px @ density 560 = 16dp），照样会吃掉底部按钮的点击。
 *
 * 也就是说：拿不到 inset ≠ 那一块没人占。这里用系统自己报的手势区高度兜底，
 * 前提是导航模式确实是 gestural（adb shell cmd overlay list android 可查）。
 * 非手势导航（三键 / 两键）时强制返回 0。
 */
private int fallbackGestureDp() {
    try {
        // 判据：系统「导航模式」是不是手势。用公开 API 读 resource id
        // com.android.internal.R.integer.config_navBarInteractionMode：2 = gestural，
        // 0 = 三键。拿不到（拿不到就按手势处理）时返回 DEFAULT_GESTURE_DP ——
        // 本应用是竖屏全屏播放器，留 16dp 空白永远比被手势条吃掉点击要好。
        final android.content.res.Resources res = getContext().getResources();
        final int id = res.getIdentifier("config_navBarInteractionMode", "integer", "android");
        if (id != 0) {
            final int mode = res.getInteger(id);
            if (mode == 0) {
                return 0; // 三键导航：没有悬浮手势条，不用留白
            }
        }
        return DEFAULT_GESTURE_DP;
    } catch (Throwable ignored) {
        return DEFAULT_GESTURE_DP;
    }
}

private static final int DEFAULT_GESTURE_DP = 16;

@PluginMethod
    public void getInsets(PluginCall call) {
        final View decorView = getBridge().getWebView().getRootView();
        final WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decorView);
        float density = getBridge().getWebView().getResources().getDisplayMetrics().density;

        float bottomPx = 0f, topPx = 0f, leftPx = 0f, rightPx = 0f, keyboardPx = 0f;
        if (insets != null) {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            leftPx = bars.left;
            topPx = bars.top;
            rightPx = bars.right;
            bottomPx = bars.bottom;
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            keyboardPx = ime.bottom;
        }
        // 隐藏态下 bottom 是 0，但手势条还在 → 至少给出手势区高度。
        final float minBottomDp = fallbackGestureDp();
        if (bottomPx < minBottomDp * density) {
            bottomPx = minBottomDp * density;
        }

        JSObject result = new JSObject();
        result.put("left", leftPx / density);
        result.put("top", topPx / density);
        result.put("right", rightPx / density);
        result.put("bottom", bottomPx / density);
        result.put("keyboard", keyboardPx / density);
        call.resolve(result);
    }

    /** 供 MainActivity 在 onResume 时补一次 —— insets 在某些机型上首帧后才会变。 */
    public static void refresh(Plugin plugin) {
        View decor = plugin.getBridge().getWebView().getRootView();
        ViewCompat.requestApplyInsets(decor);
    }
}