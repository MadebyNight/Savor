package com.shiguang.mealplanner;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LocalDataPluginTest {
    private final LocalDataPlugin plugin = new LocalDataPlugin() {
        @Override public Context getContext() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    };
    private static class Call extends PluginCall {
        final CountDownLatch done = new CountDownLatch(1);
        JSObject result; String error;
        Call(JSObject data) { super(null, "LocalData", "test", "test", data); }
        @Override public void resolve(JSObject data) { result = data; done.countDown(); }
        @Override public void reject(String message) { error = message; done.countDown(); }
        void await() throws Exception { assertTrue("原生操作超时", done.await(10, TimeUnit.SECONDS)); }
    }
    @Test public void malformedStateDoesNotOverwriteExistingData() throws Exception {
        Call before = new Call(new JSObject()); plugin.loadState(before); before.await(); assertNull(before.error);
        Call invalid = new Call(new JSObject().put("value", "not-json")); plugin.saveState(invalid); invalid.await(); assertNotNull(invalid.error);
        Call after = new Call(new JSObject()); plugin.loadState(after); after.await(); assertNull(after.error);
        assertEquals(before.result.toString(), after.result.toString());
        plugin.handleOnDestroy();
    }
    @Test public void missingPreferenceAndTraversalAreExplicit() throws Exception {
        Call missing = new Call(new JSObject().put("key", "test-" + java.util.UUID.randomUUID()));
        plugin.getPreference(missing); missing.await(); assertNull(missing.error); assertTrue(missing.result.has("value")); assertTrue(missing.result.isNull("value"));
        Call path = new Call(new JSObject().put("path", "../shiguang.db")); plugin.readImage(path); path.await(); assertNotNull(path.error);
        Call format = new Call(new JSObject().put("data", "AAAA").put("mime", "image/unknown")); plugin.saveImage(format); format.await(); assertNotNull(format.error);
        plugin.handleOnDestroy();
    }
}
