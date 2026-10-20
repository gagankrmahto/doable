package com.gaganmahto.doable;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * "Today" home-screen widget. The web app pushes a small JSON summary (today and tomorrow) through
 * WidgetBridgePlugin; the widget picks the day matching the device date, so it stays correct after
 * midnight even if the app hasn't been opened.
 */
public class TodayWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "doable_widget";
    static final String KEY = "data";

    private static final int[][] ROWS = {
        { R.id.row1, R.id.row1_dot, R.id.row1_title, R.id.row1_meta },
        { R.id.row2, R.id.row2_dot, R.id.row2_title, R.id.row2_meta },
        { R.id.row3, R.id.row3_dot, R.id.row3_title, R.id.row3_meta },
        { R.id.row4, R.id.row4_dot, R.id.row4_title, R.id.row4_meta },
        { R.id.row5, R.id.row5_dot, R.id.row5_title, R.id.row5_meta },
    };

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, TodayWidgetProvider.class));
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx, id));
    }

    private static PendingIntent link(Context ctx, String url, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url), ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String today(int offsetDays) {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, offsetDays);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(c.getTime());
    }

    private static RemoteViews build(Context ctx, int widgetId) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_today);
        v.setOnClickPendingIntent(R.id.widget_root, link(ctx, "doable://today", widgetId * 10));
        v.setOnClickPendingIntent(R.id.widget_add, link(ctx, "doable://quickadd", widgetId * 10 + 1));

        String fallbackDate = new SimpleDateFormat("EEE, d MMM", Locale.getDefault()).format(new Date());
        v.setTextViewText(R.id.widget_date, fallbackDate);
        v.setViewVisibility(R.id.widget_next, View.GONE);
        for (int[] row : ROWS) v.setViewVisibility(row[0], View.GONE);

        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw == null) {
                v.setTextViewText(R.id.widget_empty, "Open Doable to see today’s tasks");
                v.setViewVisibility(R.id.widget_empty, View.VISIBLE);
                return v;
            }
            JSONObject days = new JSONObject(raw).getJSONObject("days");
            String key = today(0);
            if (!days.has(key)) {
                v.setTextViewText(R.id.widget_empty, "Open Doable to refresh");
                v.setViewVisibility(R.id.widget_empty, View.VISIBLE);
                return v;
            }
            JSONObject day = days.getJSONObject(key);
            v.setTextViewText(R.id.widget_date, day.optString("label", fallbackDate));
            v.setTextViewText(R.id.widget_footer, day.optString("footer", ""));
            v.setViewVisibility(R.id.widget_footer, day.optString("footer", "").isEmpty() ? View.GONE : View.VISIBLE);

            JSONObject next = day.optJSONObject("next");
            if (next != null) {
                v.setTextViewText(R.id.widget_next_text, next.optString("t") + "  ·  " + next.optString("meta"));
                v.setViewVisibility(R.id.widget_next, View.VISIBLE);
                v.setOnClickPendingIntent(R.id.widget_next, link(ctx, next.optString("url", "doable://today"), widgetId * 10 + 2));
            }

            JSONArray items = day.optJSONArray("items");
            int n = items == null ? 0 : Math.min(items.length(), ROWS.length);
            for (int i = 0; i < n; i++) {
                JSONObject it = items.getJSONObject(i);
                int[] row = ROWS[i];
                v.setViewVisibility(row[0], View.VISIBLE);
                v.setTextViewText(row[2], it.optString("t"));
                v.setTextViewText(row[3], it.optString("meta"));
                try { v.setTextColor(row[1], Color.parseColor(it.optString("color", "#87909E"))); } catch (IllegalArgumentException ignored) { }
                v.setOnClickPendingIntent(row[0], link(ctx, "doable://task/" + it.optString("id"), widgetId * 10 + 3 + i));
            }
            int more = day.optInt("more", 0);
            if (n == 0) {
                v.setTextViewText(R.id.widget_empty, day.optString("empty", "Nothing due today ✨"));
                v.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            } else if (more > 0) {
                v.setTextViewText(R.id.widget_empty, "+" + more + " more");
                v.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            } else {
                v.setViewVisibility(R.id.widget_empty, View.GONE);
            }
        } catch (Exception e) {
            v.setTextViewText(R.id.widget_empty, "Open Doable to refresh");
            v.setViewVisibility(R.id.widget_empty, View.VISIBLE);
        }
        return v;
    }
}
