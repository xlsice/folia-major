package top.izuna.foliamajor;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * WebView → 原生 的媒体状态桥。
 *
 * 为什么需要它（2026-10-15 真机实测）：
 *   Android WebView 里 `navigator.mediaSession` **根本不存在**（实测 playbackState 取值是
 *   "unsupported"），所以 src/utils/mediaSessionSync.ts 在安卓上是一段彻底的空操作。
 *   而没有 MediaSession 就没有通知栏 / 锁屏 / 耳机键；
 *   更关键的是，没有 mediaPlayback 前台服务把进程提离后台 cgroup，**隐藏页面上的
 *   <audio>.play() 会被静默吞掉**（Promise RESOLVED 但永远 paused=true），
 *   表现就是一首歌放完后接不上下一首。
 *
 * 发声的仍然是 WebView 里的 HTMLAudioElement。这个插件只做「影子」：
 * 把播放状态镜像给系统，外加把系统的控制指令回传给 JS。
 */
@CapacitorPlugin(
        name = "NativeMediaSession",
        permissions = {
                @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = FoliaMediaSessionService.NOTIFICATION_PERMISSION_ALIAS)
        }
)
public class NativeMediaSessionPlugin extends Plugin {

    private static NativeMediaSessionPlugin sInstance;

    @Override
    public void load() {
        super.load();
        sInstance = this;
    }

    /**
     * 原生 → JS 的单向事件出口。Service 拿不到 Plugin 实例，所以走这个静态桥。
     */
    static void emit(String event, JSObject data) {
        if (sInstance != null) {
            sInstance.notifyListeners(event, data);
        }
    }

    /**
     * 推送一次完整的播放状态。
     *
     * 前端应当用 onTimeUpdate 的节奏（约 4Hz）调用它 ——
     * 系统通知栏的进度条靠这里的位置值更新，不要更高频，白白过桥。
     */
    @PluginMethod
    public void sync(PluginCall call) {
        final boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        final int positionMs = call.getInt("positionMs", 0) == null ? 0 : call.getInt("positionMs", 0);
        final int durationMs = call.getInt("durationMs", 0) == null ? 0 : call.getInt("durationMs", 0);
        final Float rate = call.getFloat("rate", 1.0f);

        String title = call.getString("title");
        String artist = call.getString("artist");
        String album = call.getString("album");

        FoliaMediaSessionService.applyState(
                playing, positionMs, durationMs, rate == null ? 1.0f : rate,
                title, artist, album, getContext());
        // 必须 resolve：不 resolve 的话 JS 侧那个 Promise 永远不落地，
        // 表现是 cdp 里 Runtime.evaluate 超时、页面里 sync 静默堆积。
        call.resolve();
    }

    /**
     * 上传封面。
     *
     * 入参可以是 URL 也可以是 data URI，优先用 URL：
     * 封面多半在 m801.music.126.net 之类的主机上，而 WebView 的 origin 是 https://localhost，
     * 页面里 fetch 跨域封面会被 CORS 直接拒掉 —— 实测 metadata 一直只有 3 个字段（无封面），
     * 就是卡在这。原生侧不受同源策略约束，可以自己拉。
     * 只有 blob: / data: 这类页面私有地址才走 base64 兜底。
     */
    @PluginMethod
    public void setArtwork(PluginCall call) {
        final String source = call.getString("src");
        call.resolve();
        if (source == null || source.isEmpty()) {
            FoliaMediaSessionService.setArtwork(null);
            return;
        }

        if (source.startsWith("http://") || source.startsWith("https://")) {
            android.util.Log.i("FoliaMedia", "setArtwork <- " + source);
            downloadArtworkAsync(source);
            return;
        }

        if (source.startsWith("data:")) {
            final int comma = source.indexOf(',');
            final String payload = comma >= 0 ? source.substring(comma + 1) : source;
            try {
                FoliaMediaSessionService.setArtwork(android.graphics.BitmapFactory.decodeStream(
                        new java.io.ByteArrayInputStream(
                                android.util.Base64.decode(payload, android.util.Base64.DEFAULT))));
            } catch (Throwable t) {
                android.util.Log.w("FoliaMedia", "artwork data-uri decode failed", t);
            }
        }
    }

    /** 后台线程拉封面；失败静默（封面挂掉不该影响播放）。 */
    private void downloadArtworkAsync(final String url) {
        new Thread(() -> {
            final java.net.HttpURLConnection[] holder = new java.net.HttpURLConnection[1];
            // 目标 SDK 36 默认禁明文，而 netease / kugou 至今还发 http:// 封面 ——
            // 不升级就会被 NetworkSecurityPolicy 直接拒掉（UnknownServiceException），
            // 表现是「URL 有值但下载永远失败」。与 App 里 toSafeRemoteUrl 的处理保持一致。
            final String target = url.startsWith("http://")
                    ? "https://" + url.substring("http://".length())
                    : url;
            try {
                java.net.HttpURLConnection conn =
                        (java.net.HttpURLConnection) new java.net.URL(target).openConnection();
                holder[0] = conn;
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "Folia/1.0");
                final int status = conn.getResponseCode();
                if (status != java.net.HttpURLConnection.HTTP_OK) {
                    android.util.Log.w("FoliaMedia", "artwork HTTP " + status + ": " + target);
                    return;
                }
                try (java.io.InputStream in = conn.getInputStream()) {
                    android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeStream(in);
                    if (bmp != null) {
                        FoliaMediaSessionService.setArtwork(bmp);
                    } else {
                        android.util.Log.w("FoliaMedia", "artwork decode returned null: " + target);
                    }
                }
            } catch (Throwable t) {
                android.util.Log.w("FoliaMedia", "artwork download failed: " + target, t);
            } finally {
                if (holder[0] != null) holder[0].disconnect();
            }
        }, "folia-artwork").start();
    }

    /** 停止播放态（清空元数据 + 撤下通知）。 */
    @PluginMethod
    public void stop(PluginCall call) {
        FoliaMediaSessionService.applyState(
                false, 0, 0, 1.0f, null, null, null, getContext());
        call.resolve();
    }

    /**
     * 首次播放时申请通知权限。
     *
     * 实测：未授权时通知虽然被发布（dumpsys 里有 NotificationRecord），
     * 但 AppSettings importance=NONE，用户根本看不到 —— 通知栏这一项就废了。
     * 设备没有 root，adb pm grant 走不通，只能在应用内申请。
     */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve();
            return;
        }
        requestPermissionForAlias(FoliaMediaSessionService.NOTIFICATION_PERMISSION_ALIAS, call, "permissionCallback");
    }

    /**
     * 权限回调。
     *
     * ⛔ @PermissionCallback 不能省：requestPermissionForAlias 靠这个注解读回调方法，
     * 少了它会抛 "No callback found for permission"，JS 侧只能看到一个空对象 {}。
     * （2026-10-15 实测踩到，日志里全是 `[nativeMediaSession] notification permission
     * request failed {}`，就是这个原因。）
     */
    @PermissionCallback
    @PluginMethod
    public void permissionCallback(PluginCall call) {
        call.resolve();
    }
}
