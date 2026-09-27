package com.shiguang.mealplanner;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.core.splashscreen.SplashScreen;

public class MainActivity extends BridgeActivity {
    private volatile boolean uiReady;
    public void finishStartup(){uiReady=true;}
    @Override public void onResume(){super.onResume();try{WeeklyReminders.foreground(this,true);}catch(RuntimeException error){android.util.Log.e("WeeklyReminder","resume scheduling failed");}}
    @Override public void onPause(){WeeklyReminders.foreground(this,false);super.onPause();}
    @Override protected void onNewIntent(android.content.Intent intent){super.onNewIntent(intent);setIntent(intent);}

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        registerPlugin(LocalDataPlugin.class);
        super.onCreate(savedInstanceState);
        splashScreen.setKeepOnScreenCondition(() -> !uiReady);
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> uiReady=true, 15000);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(0xFFFAF9F6);
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            private boolean pending;

            @Override
            public void handleOnBackPressed() {
                if (pending) return;
                // 键盘优先收起，不能顺带关闭正在编辑的页面或弹窗。
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
                if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) {
                    new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView())
                        .hide(WindowInsetsCompat.Type.ime());
                    return;
                }
                if (getBridge() == null || getBridge().getWebView() == null) {
                    defaultBack();
                    return;
                }
                pending = true;
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new Event('shiguang:back', {cancelable: true}))",
                    result -> {
                        pending = false;
                        if (!"false".equals(result)) defaultBack();
                    }
                );
            }

            private void defaultBack() {
                setEnabled(false);
                try {
                    getOnBackPressedDispatcher().onBackPressed();
                } finally {
                    setEnabled(true);
                }
            }
        });
    }
}
