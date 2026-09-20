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
import java.net.HttpURLConnection;
import java.net.ProtocolException;
import java.net.URL;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.RecordedRequest;

@RunWith(AndroidJUnit4.class)
public class LocalDataPluginTest {
    @Test public void legacyConnectionRejectsMkcolBeforeConnecting() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("https://127.0.0.1/").openConnection();
        try {
            connection.setRequestMethod("MKCOL");
            fail("Expected Android HttpURLConnection method restriction");
        } catch (ProtocolException expected) {
            assertNotNull(expected);
        } finally { connection.disconnect(); }
    }

    @Test public void nativeWebDavMethodsPreserveBodiesHeadersAndStatus() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.start();
            String url = server.url("/%E9%A3%9F%E5%85%89/test.json").toString();
            for (String method : new String[]{"MKCOL", "PUT", "GET", "DELETE", "POST", "PROPFIND"}) {
                int status = method.equals("MKCOL") ? 201 : method.equals("PROPFIND") ? 207 : 200;
                server.enqueue(new MockResponse().setResponseCode(status).setHeader("ETag", "\"v1\"").setBody("测试响应"));
                JSObject args = new JSObject().put("url", url).put("method", method)
                    .put("headers", new JSObject().put("Authorization", "Basic TEST_ONLY").put("If-Match", "\"v0\"").put("Content-Type", "application/json"));
                if (method.equals("PUT") || method.equals("POST")) args.put("body", "{\"name\":\"测试菜\"}");
                Call call = new Call(args); plugin.request(call); call.await(); assertNull(call.error);
                assertEquals(status, (int) call.result.getInteger("status"));
                assertEquals("测试响应", call.result.getString("data"));
                assertEquals("\"v1\"", call.result.getJSObject("headers").getString("etag"));
                RecordedRequest sent = server.takeRequest(2, TimeUnit.SECONDS); assertNotNull(sent);
                assertEquals(method, sent.getMethod()); assertEquals("Basic TEST_ONLY", sent.getHeader("Authorization"));
                assertEquals("\"v0\"", sent.getHeader("If-Match"));
                if (method.equals("PUT") || method.equals("POST")) assertEquals("{\"name\":\"测试菜\"}", sent.getBody().readUtf8());
            }
            for (int status : new int[]{401, 403, 405, 412, 500}) {
                server.enqueue(new MockResponse().setResponseCode(status).setBody("failure"));
                Call call = new Call(new JSObject().put("url", url).put("method", "MKCOL"));
                plugin.request(call); call.await(); assertNull(call.error);
                assertEquals(status, (int) call.result.getInteger("status"));
                server.takeRequest(2, TimeUnit.SECONDS);
            }
            server.enqueue(new MockResponse().setResponseCode(302).setHeader("Location", server.url("/redirect-target")));
            int before = server.getRequestCount();
            Call redirect = new Call(new JSObject().put("url", url).put("method", "GET"));
            plugin.request(redirect); redirect.await(); assertNull(redirect.error);
            assertEquals(302, (int) redirect.result.getInteger("status"));
            assertEquals(before + 1, server.getRequestCount());
        } finally { plugin.handleOnDestroy(); }
    }

    @Test public void invalidNetworkRequestIsDiagnosableWithoutLeakingSecrets() throws Exception {
        Call invalid = new Call(new JSObject().put("url", "file:///private/SECRET_URL")
            .put("method", "GET").put("headers", new JSObject().put("Authorization", "SECRET_HEADER")).put("body", "SECRET_BODY"));
        plugin.request(invalid); invalid.await();
        assertNotNull(invalid.error); assertTrue(invalid.error.contains("GET / prepare / IllegalArgumentException"));
        assertFalse(invalid.error.contains("SECRET"));
        plugin.handleOnDestroy();
    }
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
    @Test public void exportRejectsPathsBeforeOpeningActivity() throws Exception {
        for (String name : new String[]{"../outside.doc", "folder/file.png", "folder\\file.png", "", ".."}) {
            Call call = new Call(new JSObject().put("name", name).put("mime", "image/png").put("data", "AAAA"));
            plugin.exportFile(call); call.await(); assertNotNull(call.error);
        }
        assertEquals("采购清单.png", LocalDataPlugin.exportName("采购清单.png"));
        plugin.handleOnDestroy();
    }
}
