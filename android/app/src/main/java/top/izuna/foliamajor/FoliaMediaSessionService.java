package top.izuna.foliamajor;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

/**
 * 媒体会话前台服务 —— 只做「影子」，不发声。
 *
 * 真正出声的是 WebView 里的 HTMLAudioElement。这个 service 负责三件事：
 *   1. 持有 mediaPlayback 前台服务，把进程从后台 cgroup(b/) 提到感知级(prcp + FGS)；
 *      **这是后台能自动续播的关键**，2026-10-15 实测，见 docs/dev/BACKGROUND-PLAYBACK.md
 *   2. 维护 MediaSession，让通知栏 / 锁屏 / 耳机键 / 蓝牙控制认得本应用
 *   3. 监听音频焦点，来电等场景下把暂停回传给 JS
 *
 * 前台服务的启停策略：
 *   - MainActivity.onCreate 用 startService（普通服务）拉起，不立刻占前台
 *   - 第一次 sync(playing=true) 时才 startForeground —— 避免「只是打开 App 却挂着一条通知」
 *   - 暂停时**保留**前台服务与通知（和主流音乐 App 一致，锁屏控件还在）
 *   - MainActivity.onDestroy 时 stopSelf，通知随之消失
 */
public class FoliaMediaSessionService extends Service {

    private static final String TAG = "FoliaMedia";
    private static final String CHANNEL_ID = "folia_media_session";
    private static final int NOTIFICATION_ID = 1001;

    /** 权限别名必须是编译期常量，注解里要用。 */
    public static final String NOTIFICATION_PERMISSION_ALIAS = "notifications";

    private static FoliaMediaSessionService sInstance;

    // 服务还没起来时先存住，onCreate 时补上 —— JS 可能在 Activity 之前就推状态。
    private static volatile boolean sPendingPlaying = false;
    private static volatile int sPendingPosition = 0;
    private static volatile int sPendingDuration = 0;
    private static volatile float sPendingRate = 1.0f;
    private static volatile String sPendingTitle = null;
    private static volatile String sPendingArtist = null;
    private static volatile String sPendingAlbum = null;

    private MediaSessionCompat session;
    private boolean inForeground = false;
    /** 上一次发通知时的播放态，用来判断「要不要重发」。 */
    private boolean lastNotifiedPlaying = false;

    // 封面是从下载线程送进来的，setMetadata / notify 都挪回主线程再落地。
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // MediaSessionCompat.setMetadata 是整体替换、没有读回 API，所以自己留一份。
    //
    // ⚠️ 封面必须也留一份（2026-10-15 踩坑）：
    // setMetadata 会**整份替换** metadata，applyNow() 又是跟着 onTimeUpdate 以约 4Hz 调用的，
    // 它每次都重新组一份只带 title/artist/album 的 metadata 并写回去 ——
    // 于是 setArtwork 刚写进去的封面图，250ms 后就被下一次 timeupdate 抹掉。
    // 现象是 metadata 永远只有 3 个字段（size=3）、通知栏永远没有封面。
    // 所以每次重建 metadata 都必须把 currentArtwork 一起带上。
    private String currentTitle;
    private String currentArtist;
    private String currentAlbum;
    private Bitmap currentArtwork;
    // 时长（毫秒）。⛔ 不能漏：系统媒体面板/锁屏的进度条靠 METADATA_KEY_DURATION 才知道总长，
    // 缺了它就退化成固定 04:00 占位且位置恒为 00:00（真机 ColorOS 控制中心实测）。
    private long currentDurationMs = 0;

    private final PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY
                    | PlaybackStateCompat.ACTION_PAUSE
                    | PlaybackStateCompat.ACTION_PLAY_PAUSE
                    | PlaybackStateCompat.ACTION_SEEK_TO
                    | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                    | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackStateCompat.ACTION_STOP);

    // ---------------------------------------------------------------- 静态入口

    /** 由 {@link NativeMediaSessionPlugin} 调用。 */
    static void applyState(boolean playing, int positionMs, int durationMs, float rate,
                           String title, String artist, String album, Context ctx) {
        sPendingPlaying = playing;
        sPendingPosition = positionMs;
        sPendingDuration = durationMs;
        sPendingRate = rate;
        sPendingTitle = title;
        sPendingArtist = artist;
        sPendingAlbum = album;

        FoliaMediaSessionService svc = sInstance;
        if (svc != null) {
            svc.applyNow(playing, positionMs, durationMs, rate, title, artist, album);
        } else if (ctx != null) {
            // 服务还没起（理论上 MainActivity 先起，但保险起见兜一下）
            try {
                ctx.startService(new Intent(ctx, FoliaMediaSessionService.class));
            } catch (Throwable t) {
                Log.w(TAG, "startService failed", t);
            }
        }
    }

    /** 由 {@link NativeMediaSessionPlugin} 调用；null 表示清空封面。 */
    static void setArtwork(Bitmap bitmap) {
        FoliaMediaSessionService svc = sInstance;
        if (svc == null) return;
        svc.applyArtwork(bitmap);
    }

    // ---------------------------------------------------------------- 生命周期

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        createChannel();

        session = new MediaSessionCompat(this, "FoliaSession");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                emitAction("play", null);
            }

            @Override
            public void onPause() {
                emitAction("pause", null);
            }

            @Override
            public void onStop() {
                emitAction("pause", null);
            }

            @Override
            public void onSkipToNext() {
                emitAction("next", null);
            }

            @Override
            public void onSkipToPrevious() {
                emitAction("prev", null);
            }

            @Override
            public void onSeekTo(long positionMs) {
                com.getcapacitor.JSObject data = new com.getcapacitor.JSObject();
                data.put("action", "seek");
                data.put("positionMs", (int) positionMs);
                NativeMediaSessionPlugin.emit("mediaAction", data);
            }
        });
        session.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);

        // 补上服务创建之前就到达的状态
        applyNow(sPendingPlaying, sPendingPosition, sPendingDuration, sPendingRate,
                sPendingTitle, sPendingArtist, sPendingAlbum);
        Log.i(TAG, "service created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (session != null) {
            session.setActive(false);
            session.release();
            session = null;
        }
        if (inForeground) {
            stopForeground(true);
            inForeground = false;
        }
        sInstance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // ---------------------------------------------------------------- 状态应用

    private void applyNow(boolean playing, int positionMs, int durationMs, float rate,
                          String title, String artist, String album) {
        if (session == null) return;

        // 只在文本/时长真的变了才重建 metadata：
        // 顺手挡掉了 4Hz 无意义的 setMetadata（那不只是浪费，每次重设还会让系统重新解码封面图）。
        boolean metadataChanged =
                !equal(currentTitle, title) || !equal(currentArtist, artist) || !equal(currentAlbum, album);
        if (currentDurationMs != Math.max(0L, durationMs)) {
            currentDurationMs = Math.max(0L, durationMs);
            metadataChanged = true;
        }
        if (metadataChanged) {
            currentTitle = title;
            currentArtist = artist;
            currentAlbum = album;
            applyMetadata();
        }

        session.setPlaybackState(stateBuilder
                .setState(
                        playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        Math.max(0, positionMs),
                        rate <= 0 ? 1.0f : rate)
                .build());
        session.setActive(true);

        // 通知只在「播放态翻转」或「曲目/封面变了」时重发，不要跟着 4Hz 的进度一起刷。
        // setPlaybackState 是给系统媒体面板算进度用的，它自己会根据 position+rate 走；
        // 而 notify() 每次都要让 SystemUI 重新解码封面图（实测日志里 4Hz 一条 onMediaDataLoaded）。
        // ⚠️ 但首次 startForeground 必须在这里发生 —— 系统要求 5s 内进入前台。
        if (playing != lastNotifiedPlaying || metadataChanged) {
            lastNotifiedPlaying = playing;
            if (playing) {
                startForegroundCompat();
            } else if (inForeground) {
                // 暂停时保留通知与前台服务（锁屏控件要还在），只是状态变 PAUSED。
                // 反过来，暂停状态下不该凭空拉起通知 —— 打开 App 还没播就挂一条没意义。
                notifyCompat();
            }
        }
    }

    /** 重建 metadata 的唯一入口 —— 文本与封面永远一起写，避免任何一侧被单独覆盖掉。 */
    private void applyMetadata() {
        if (session == null) return;
        MediaMetadataCompat.Builder mb = new MediaMetadataCompat.Builder();
        if (currentTitle != null) mb.putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle);
        if (currentArtist != null) mb.putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist);
        if (currentAlbum != null) mb.putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum);
        // 只在拿到真实时长时才写。写 0 等于告诉系统「这首歌 0 毫秒」，
        // 进度条会变成一个空的、永远在 0 的条 —— 比不写还糟。
        if (currentDurationMs > 0) {
            mb.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDurationMs);
        }
        if (currentArtwork != null) mb.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentArtwork);
        session.setMetadata(mb.build());
    }

    private static boolean equal(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }

    private void applyArtwork(Bitmap bitmap) {
        mainHandler.post(() -> {
            if (session == null) return;
            currentArtwork = bitmap;
            applyMetadata();
            // 只在已经有通知时才补发一次：封面通常比播放早到几十到几百毫秒，
            // 那时还不该凭空把通知拉起来（更不该凭空进入前台）。
            if (inForeground) {
                notifyCompat();
            }
        });
    }

    // ---------------------------------------------------------------- 音频焦点
    //
    // ⛔ 这里**故意不去请求音频焦点**（2026-10-15 真机实测踩出来的坑）。
    //
    // 发声的是 WebView 里的 <audio>，Chromium 自己就通过 AudioManager 持有焦点。
    // 服务这边再发一次 AUDIOFOCUS_GAIN 会把 WebView 的焦点抢走，于是：
    //     播放 → playing 事件 → applyState(playing=true) → requestAudioFocus
    //          → Chromium 的元素被挤掉焦点 → 我们收到 AUDIOFOCUS_LOSS
    //          → notifyListeners("mediaAction","pause") → JS 暂停
    // 实测表现为「播放刚开始约 250ms 就自己暂停」，是个自造的反馈环。
    //
    // 所以焦点这件事整个交给 Chromium。来电/抢占这类场景由 Chromium 自己处理
    // （媒体元素被夺焦时会自行暂停），我们不插手。
    // 若日后确实需要在通知栏同步显示「因来电暂停」，再单独找不抢焦点的观察方案。

    // ---------------------------------------------------------------- 通知

    private void emitAction(String action, Integer positionMs) {
        com.getcapacitor.JSObject data = new com.getcapacitor.JSObject();
        data.put("action", action);
        if (positionMs != null) data.put("positionMs", positionMs);
        NativeMediaSessionPlugin.emit("mediaAction", data);
    }

    private void startForegroundCompat() {
        if (inForeground) {
            notifyCompat();
            return;
        }
        startForegroundCompat(buildNotification());
        inForeground = true;
    }

    private void notifyCompat() {
        if (session == null) return;
        if (!inForeground) {
            startForegroundCompat();
        } else {
            getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private void startForegroundCompat(Notification n) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, n,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private Notification buildNotification() {
        // 必须用 androidx.media.app.NotificationCompat.MediaStyle：
        // 框架 Notification.MediaStyle.setMediaSession() 收的是框架 MediaSession.Token，
        // 而 MediaSessionCompat.getSessionToken() 给的是 compat Token，类型不兼容。
        androidx.core.app.NotificationCompat.Builder b =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? new androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
                        : new androidx.core.app.NotificationCompat.Builder(this);

        String notifyTitle = currentTitle != null ? currentTitle
                : (sPendingTitle == null ? "Folia" : sPendingTitle);
        String notifyArtist = currentArtist != null ? currentArtist
                : (sPendingArtist == null ? "" : sPendingArtist);

        b.setContentTitle(notifyTitle)
                .setContentText(notifyArtist)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(sPendingPlaying)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
                .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(PendingIntent.getActivity(
                        this, 0, new Intent(this, MainActivity.class),
                        PendingIntent.FLAG_IMMUTABLE))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(session.getSessionToken()));

        // 通知栏下拉卡片的大图。锁屏/系统媒体面板自己会从 session metadata 取图，
        // 但通知栏这一张得显式给 —— 两边都设上，任何一端都保证有封面。
        if (currentArtwork != null) {
            b.setLargeIcon(currentArtwork);
        }

        return b.build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
        ch.setShowBadge(false);
        ch.setSound(null, null);
        nm.createNotificationChannel(ch);
    }
}
