package com.shiguang.mealplanner;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.ClipData;
import android.app.Activity;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Iterator;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "LocalData")
public class LocalDataPlugin extends Plugin {
    private final ExecutorService storage = Executors.newSingleThreadExecutor();
    private final ExecutorService network = Executors.newCachedThreadPool();
    private static final String KEY_ALIAS = "shiguang.credentials.v1";
    private boolean exportActive;

    private interface Work { JSObject run() throws Exception; }
    private void run(PluginCall call, ExecutorService executor, Work work) {
        executor.execute(() -> {
            try { call.resolve(work.run()); }
            catch (Exception error) { call.reject("操作失败：" + error.getClass().getSimpleName()); }
        });
    }
    private JSObject value(String value) {
        JSObject result = new JSObject();
        result.put("value", value == null ? JSONObject.NULL : value);
        return result;
    }
    private String required(PluginCall call, String key) {
        String text = call.getString(key);
        if (text == null) throw new IllegalArgumentException(key);
        return text;
    }
    private SQLiteDatabase database() {
        SQLiteDatabase db = getContext().openOrCreateDatabase("shiguang.db", Context.MODE_PRIVATE, null);
        db.execSQL("CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
        return db;
    }
    @PluginMethod public void loadState(PluginCall call) {
        run(call, storage, () -> {
            try (SQLiteDatabase db = database(); Cursor rows = db.rawQuery("SELECT value FROM app_state WHERE key = ?", new String[]{"state"})) {
                return value(rows.moveToFirst() ? rows.getString(0) : null);
            }
        });
    }
    @PluginMethod public void saveState(PluginCall call) {
        run(call, storage, () -> {
            String json = required(call, "value");
            new JSONObject(json);
            try (SQLiteDatabase db = database()) {
                db.beginTransaction();
                try {
                    ContentValues values = new ContentValues();
                    values.put("key", "state"); values.put("value", json);
                    if (db.insertWithOnConflict("app_state", null, values, SQLiteDatabase.CONFLICT_REPLACE) == -1) throw new IOException("State write failed");
                    db.setTransactionSuccessful();
                } finally { db.endTransaction(); }
            }
            return new JSObject();
        });
    }
    @PluginMethod public void getPreference(PluginCall call) {
        run(call, storage, () -> value(getContext().getSharedPreferences("preferences", Context.MODE_PRIVATE).getString(required(call, "key"), null)));
    }
    @PluginMethod public void setPreference(PluginCall call) {
        run(call, storage, () -> {
            boolean saved = getContext().getSharedPreferences("preferences", Context.MODE_PRIVATE).edit().putString(required(call, "key"), call.getString("value")).commit();
            if (!saved) throw new IOException("Preference write failed");
            return new JSObject();
        });
    }
    private SecretKey secretKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }
    @PluginMethod public void setSecret(PluginCall call) {
        run(call, storage, () -> {
            String key = required(call, "key"), plain = call.getString("value"), encrypted = null;
            if (plain != null && !plain.isEmpty()) {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, secretKey());
                encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            }
            if (!getContext().getSharedPreferences("credentials", Context.MODE_PRIVATE).edit().putString(key, encrypted).commit()) throw new IOException("Credential write failed");
            return new JSObject();
        });
    }
    @PluginMethod public void getSecret(PluginCall call) {
        run(call, storage, () -> {
            String encrypted = getContext().getSharedPreferences("credentials", Context.MODE_PRIVATE).getString(required(call, "key"), null);
            if (encrypted == null) return value(null);
            String[] parts = encrypted.split(":", 2);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return value(new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
        });
    }
    private File imageFile(String path) throws IOException {
        File directory = new File(getContext().getFilesDir(), "images");
        if (!directory.exists() && !directory.mkdirs()) throw new IOException("Image directory unavailable");
        File file = new File(directory, path);
        if (!file.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile())) throw new IOException("Invalid image path");
        return file;
    }
    @PluginMethod public void saveImage(PluginCall call) {
        run(call, storage, () -> {
            String mime = call.getString("mime", "image/jpeg");
            if (!mime.equals("image/jpeg") && !mime.equals("image/png") && !mime.equals("image/webp") && !mime.equals("image/gif")) throw new IllegalArgumentException("Unsupported image format");
            String suffix = mime.equals("image/png") ? ".png" : mime.equals("image/webp") ? ".webp" : mime.equals("image/gif") ? ".gif" : ".jpg";
            String path = UUID.randomUUID() + suffix;
            byte[] bytes = Base64.decode(required(call, "data"), Base64.DEFAULT);
            try (FileOutputStream output = new FileOutputStream(imageFile(path))) { output.write(bytes); }
            JSObject result = new JSObject(); result.put("path", path); return result;
        });
    }
    private byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        return output.toByteArray();
    }
    @PluginMethod public void readImage(PluginCall call) {
        run(call, storage, () -> {
            String path = required(call, "path");
            try (FileInputStream input = new FileInputStream(imageFile(path))) {
                JSObject result = new JSObject(); result.put("data", Base64.encodeToString(readAll(input), Base64.NO_WRAP));
                result.put("mime", path.endsWith(".png") ? "image/png" : path.endsWith(".webp") ? "image/webp" : path.endsWith(".gif") ? "image/gif" : "image/jpeg"); return result;
            }
        });
    }
    @PluginMethod public void request(PluginCall call) {
        run(call, network, () -> {
            URL url = new URL(required(call, "url"));
            if (!url.getProtocol().equals("https") && !url.getProtocol().equals("http")) throw new IllegalArgumentException("Invalid protocol");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            try {
                connection.setConnectTimeout(30000); connection.setReadTimeout(120000);
                connection.setInstanceFollowRedirects(false);
                String method = call.getString("method", "GET").toUpperCase(java.util.Locale.ROOT);
                connection.setRequestMethod(method);
                JSObject headers = call.getObject("headers", new JSObject());
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) { String key = keys.next(); connection.setRequestProperty(key, headers.getString(key)); }
                String body = call.getString("body");
                if (body != null) {
                    if (method.equals("GET") || method.equals("HEAD")) throw new IllegalArgumentException("Request method does not accept a body");
                    connection.setDoOutput(true);
                    try (OutputStream output = connection.getOutputStream()) { output.write(body.getBytes(StandardCharsets.UTF_8)); }
                }
                int status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                String data = "";
                if (stream != null) try (InputStream input = stream) { data = new String(readAll(input), StandardCharsets.UTF_8); }
                JSObject responseHeaders = new JSObject();
                connection.getHeaderFields().forEach((key, values) -> { if (key != null) responseHeaders.put(key.toLowerCase(java.util.Locale.ROOT), android.text.TextUtils.join(", ", values)); });
                JSObject result = new JSObject(); result.put("status", status); result.put("data", data); result.put("headers", responseHeaders); return result;
            } finally { connection.disconnect(); }
        });
    }
    static String exportName(String name) {
        if (name == null || name.trim().isEmpty() || name.contains("/") || name.contains("\\") || name.equals(".") || name.equals("..")) throw new IllegalArgumentException("Invalid export filename");
        return name;
    }
    @PluginMethod public void exportFile(PluginCall call) {
        synchronized (this) {
            if (exportActive) { call.reject("请先完成当前保存或分享操作"); return; }
            exportActive = true;
        }
        storage.execute(() -> {
            try {
                String name = exportName(required(call, "name"));
                String mime = required(call, "mime");
                byte[] bytes = Base64.decode(required(call, "data"), Base64.DEFAULT);
                Intent intent;
                String callback;
                if (Boolean.TRUE.equals(call.getBoolean("share", false))) {
                    File directory = new File(getContext().getCacheDir(), "exports");
                    if (!directory.exists() && !directory.mkdirs()) throw new IOException("Export directory unavailable");
                    File file = new File(directory, name);
                    try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
                    Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                    Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    send.setClipData(ClipData.newRawUri(name, uri));
                    intent = Intent.createChooser(send, "分享文件");
                    callback = "shareFinished";
                } else {
                    intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(mime).putExtra(Intent.EXTRA_TITLE, name);
                    callback = "documentSelected";
                }
                getActivity().runOnUiThread(() -> {
                    try { startActivityForResult(call, intent, callback); }
                    catch (Exception error) { finishExport(); call.reject("无法打开系统文件面板"); }
                });
            } catch (Exception error) { finishExport(); call.reject("文件导出失败：" + error.getClass().getSimpleName()); }
        });
    }
    private synchronized void finishExport() { exportActive = false; }
    @ActivityCallback private void documentSelected(PluginCall call, ActivityResult result) {
        if (call == null) { finishExport(); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            finishExport(); call.resolve(new JSObject().put("cancelled", true)); return;
        }
        Uri uri = result.getData().getData();
        run(call, storage, () -> {
            try {
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new IOException("Document unavailable");
                    output.write(Base64.decode(required(call, "data"), Base64.DEFAULT));
                }
                return new JSObject().put("cancelled", false).put("status", "saved");
            } finally { finishExport(); }
        });
    }
    @ActivityCallback private void shareFinished(PluginCall call, ActivityResult result) {
        finishExport();
        // ACTION_SEND does not reliably distinguish successful sending from cancellation.
        if (call != null) call.resolve(new JSObject().put("cancelled", JSONObject.NULL).put("status", "share-sheet-closed"));
    }
    @Override protected void handleOnDestroy() {
        storage.shutdown(); network.shutdown();
    }
}
