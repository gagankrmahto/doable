package com.gaganmahto.doable;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import org.json.JSONObject;

/**
 * Live updates: downloads a web bundle from the website into app-private storage and tells Capacitor
 * to serve it on the next launch (Bridge reads CapWebViewSettings/serverBasePath at startup).
 * A new APK ignores the saved path automatically (Bridge.isNewBinary), so native updates start clean.
 * The JS side decides what to download and verifies the manifest; this class moves bytes and flips the switch.
 */
@CapacitorPlugin(name = "LiveUpdate")
public class LiveUpdatePlugin extends Plugin {
    private static final String PREFS = "DoableLiveUpdate";
    private static final String CAP_PREFS = "CapWebViewSettings";
    private static final String CAP_PATH = "serverBasePath";

    private File bundlesDir() {
        File d = new File(getContext().getFilesDir(), "bundles");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String activePath() {
        return getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).getString(CAP_PATH, null);
    }

    /** Native version and which bundle is serving right now. */
    @PluginMethod
    public void current(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("versionName", p.versionName);
            r.put("versionCode", (int) p.getLongVersionCode());
        } catch (Exception e) {
            r.put("versionName", "?");
            r.put("versionCode", 0);
        }
        String active = activePath();
        r.put("activeBuild", active != null && new File(active).exists() ? new File(active).getName() : JSObject.NULL);
        r.put("pendingBuild", prefs().getString("pending", null) != null ? prefs().getString("pending", null) : JSObject.NULL);
        r.put("previousBuild", prefs().getString("previous", null) != null ? prefs().getString("previous", null) : JSObject.NULL);
        r.put("bootCount", prefs().getInt("bootCount", 0));
        call.resolve(r);
    }

    /**
     * Downloads every file in `files` ([{path, sha256}]) from baseUrl into bundles/<build>/, verifying each hash.
     * Runs off the main thread; resolves when the whole bundle is on disk.
     */
    @PluginMethod
    public void download(PluginCall call) {
        String build = call.getString("build");
        String baseUrl = call.getString("baseUrl");
        JSArray files = call.getArray("files");
        if (build == null || baseUrl == null || files == null) { call.reject("build, baseUrl and files are required"); return; }
        new Thread(() -> {
            File dir = new File(bundlesDir(), build);
            try {
                deleteRecursively(dir);
                dir.mkdirs();
                for (int i = 0; i < files.length(); i++) {
                    JSONObject f = files.getJSONObject(i);
                    String rel = f.getString("path");
                    if (rel.contains("..")) throw new IllegalArgumentException("Bad path " + rel);
                    File out = new File(dir, rel);
                    out.getParentFile().mkdirs();
                    fetch(baseUrl + rel + "?b=" + build, out);
                    String got = sha256(out);
                    if (!got.equalsIgnoreCase(f.getString("sha256"))) throw new IllegalStateException("Checksum mismatch for " + rel);
                }
                prefs().edit().putString("pending", build).apply();
                JSObject r = new JSObject();
                r.put("path", dir.getAbsolutePath());
                call.resolve(r);
            } catch (Exception e) {
                deleteRecursively(dir);
                call.reject("Download failed: " + e.getMessage());
            }
        }).start();
    }

    /** Make the pending bundle the one served on the next launch. The current one is kept for rollback. */
    @PluginMethod
    public void apply(PluginCall call) {
        String build = prefs().getString("pending", null);
        if (build == null) { call.reject("No downloaded update"); return; }
        File dir = new File(bundlesDir(), build);
        if (!new File(dir, "index.html").exists()) { call.reject("Bundle is incomplete"); return; }
        String active = activePath();
        String previous = active != null && new File(active).exists() ? new File(active).getName() : "";
        prefs().edit().putString("previous", previous).putInt("bootCount", 0).remove("pending").apply();
        getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().putString(CAP_PATH, dir.getAbsolutePath()).apply();
        cleanup(build, previous);
        call.resolve();
    }

    /** The JS calls this once the new bundle has booted and synced; it clears the rollback trap. */
    @PluginMethod
    public void ready(PluginCall call) {
        prefs().edit().putInt("bootCount", 0).putString("previous", "").apply();
        call.resolve();
    }

    /** Counts a boot of the active bundle; after too many without ready(), the previous bundle is restored. */
    @PluginMethod
    public void booted(PluginCall call) {
        int n = prefs().getInt("bootCount", 0) + 1;
        prefs().edit().putInt("bootCount", n).apply();
        JSObject r = new JSObject();
        r.put("bootCount", n);
        call.resolve(r);
    }

    /** Go back to the previous bundle (or the APK's built-in one when there is none). */
    @PluginMethod
    public void rollback(PluginCall call) {
        String previous = prefs().getString("previous", "");
        SharedPreferences.Editor cap = getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit();
        File prev = previous.isEmpty() ? null : new File(bundlesDir(), previous);
        if (prev != null && new File(prev, "index.html").exists()) cap.putString(CAP_PATH, prev.getAbsolutePath()); else cap.remove(CAP_PATH);
        cap.apply();
        prefs().edit().putString("previous", "").putInt("bootCount", 0).remove("pending").apply();
        call.resolve();
    }

    /** Forget every downloaded bundle and serve the APK's built-in web app. */
    @PluginMethod
    public void reset(PluginCall call) {
        getContext().getSharedPreferences(CAP_PREFS, Context.MODE_PRIVATE).edit().remove(CAP_PATH).apply();
        prefs().edit().clear().apply();
        deleteRecursively(bundlesDir());
        call.resolve();
    }

    private void cleanup(String keepA, String keepB) {
        File[] all = bundlesDir().listFiles();
        if (all == null) return;
        for (File f : all) if (!f.getName().equals(keepA) && !f.getName().equals(keepB)) deleteRecursively(f);
    }

    private static void fetch(String url, File out) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("Cache-Control", "no-cache");
        if (c.getResponseCode() != 200) throw new IllegalStateException("HTTP " + c.getResponseCode() + " for " + url);
        try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) fo.write(buf, 0, n);
        } finally {
            c.disconnect();
        }
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new java.io.FileInputStream(f)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static void deleteRecursively(File f) {
        if (f == null || !f.exists()) return;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursively(k);
        f.delete();
    }
}
