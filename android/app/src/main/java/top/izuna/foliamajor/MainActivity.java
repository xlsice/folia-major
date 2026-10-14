package top.izuna.foliamajor;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

/**
 * 主 Activity。注册自写的 SafeInsetsPlugin（安全区桥接，见该类注释）
 * 与 NativeMediaSessionPlugin（媒体会话桥，见该类注释）。
 * 其余行为全部沿用 BridgeActivity 默认。
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "FoliaMedia";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafeInsetsPlugin.class);
        registerPlugin(NativeMediaSessionPlugin.class);
        super.onCreate(savedInstanceState);

        // 用 startService 而不是 startForegroundService：
        // 前台服务由 FoliaMediaSessionService 在第一次 sync(playing=true) 时自己起，
        // 这样「只是打开 App 翻一翻」不会莫名挂一条通知。
        try {
            Intent svc = new Intent(this, FoliaMediaSessionService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startService(svc);
            } else {
                startService(svc);
            }
            Log.i(TAG, "FoliaMediaSessionService requested");
        } catch (Throwable t) {
            Log.w(TAG, "failed to start media session service", t);
        }
    }

    @Override
    public void onDestroy() {
        // 撤掉媒体会话服务，否则通知会挂着不走。
        // 注意可见性必须是 public：BridgeActivity.onDestroy() 是 public void，
        // 写成 protected 会直接编译失败（报「无法覆盖」而不是「权限不足」）。
        try {
            stopService(new Intent(this, FoliaMediaSessionService.class));
        } catch (Throwable ignored) {
            // 撤服务失败不影响退出
        }
        super.onDestroy();
    }
}
