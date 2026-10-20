package com.gaganmahto.doable;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the Today summary from the web app and refreshes the home-screen widget. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data", "{}");
        Context ctx = getContext();
        ctx.getSharedPreferences(TodayWidgetProvider.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TodayWidgetProvider.KEY, data)
            .apply();
        TodayWidgetProvider.refreshAll(ctx);
        call.resolve();
    }

    /** Asks the launcher to add the widget (Android 8+ shows a system confirmation). */
    @PluginMethod
    public void pin(PluginCall call) {
        Context ctx = getContext();
        JSObject result = new JSObject();
        boolean requested = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AppWidgetManager mgr = ctx.getSystemService(AppWidgetManager.class);
            if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
                requested = mgr.requestPinAppWidget(new ComponentName(ctx, TodayWidgetProvider.class), null, null);
            }
        }
        result.put("requested", requested);
        call.resolve(result);
    }
}
