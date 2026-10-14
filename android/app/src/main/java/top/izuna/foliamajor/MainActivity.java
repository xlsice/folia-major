package top.izuna.foliamajor;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * 主 Activity。注册自写的 SafeInsetsPlugin（安全区桥接，见该类注释）。
 * 其余行为全部沿用 BridgeActivity 默认。
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SafeInsetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}