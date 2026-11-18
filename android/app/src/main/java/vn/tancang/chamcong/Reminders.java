package vn.tancang.chamcong;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Đặt báo thức nhắc check-in / check-out theo ca làm việc, kể cả khi ứng dụng đang đóng. */
final class Reminders {
    static PendingIntent pi(Context c, String type, String date) {
        Intent i = new Intent(c, ReminderReceiver.class).putExtra("type", type).putExtra("date", date);
        return PendingIntent.getBroadcast(c, 7001, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void cancel(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(pi(c, "", ""));
    }

    static int min(String hhmm) {
        String[] p = hhmm.split(":");
        return Integer.parseInt(p[0].trim()) * 60 + Integer.parseInt(p[1].trim().substring(0, 2));
    }

    static String ymd(Calendar k) {
        return String.format(Locale.US, "%04d-%02d-%02d", k.get(Calendar.YEAR), k.get(Calendar.MONTH) + 1, k.get(Calendar.DAY_OF_MONTH));
    }

    static void schedule(Context c) {
        try {
            SharedPreferences p = Prefs.get(c);
            String js = p.getString("sched", ""), token = p.getString("token", "");
            cancel(c);
            if (js.isEmpty() || token.isEmpty()) return;
            JSONObject s = new JSONObject(js);
            if (!s.optBoolean("enabled", true)) return;
            int start = min(s.getString("start")), end = min(s.getString("end"));
            int before = s.optInt("before", 10), after = s.optInt("after", 5);
            Set<String> wd = new HashSet<>();
            for (String x : s.optString("workDays", "1,2,3,4,5,6").split(",")) wd.add(x.trim());
            Set<String> hol = new HashSet<>();
            JSONArray h = s.optJSONArray("holidays");
            if (h != null) for (int i = 0; i < h.length(); i++) hol.add(h.getString(i));
            long now = System.currentTimeMillis() + 30000;
            for (int off = 0; off < 21; off++) {
                Calendar day = Calendar.getInstance();
                day.add(Calendar.DAY_OF_MONTH, off);
                int dow = (day.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1; // 1=T2 … 7=CN
                String date = ymd(day);
                if (!wd.contains(String.valueOf(dow)) || hol.contains(date)) continue;
                int[][] slots = {{start - before, 0}, {end + after, 1}};
                for (int[] sl : slots) {
                    Calendar t = (Calendar) day.clone();
                    t.set(Calendar.HOUR_OF_DAY, 0); t.set(Calendar.MINUTE, 0); t.set(Calendar.SECOND, 0); t.set(Calendar.MILLISECOND, 0);
                    t.add(Calendar.MINUTE, sl[0]);
                    if (t.getTimeInMillis() > now) {
                        AlarmManager am = c.getSystemService(AlarmManager.class);
                        am.setWindow(AlarmManager.RTC_WAKEUP, t.getTimeInMillis(), 2 * 60 * 1000L, pi(c, sl[1] == 0 ? "IN" : "OUT", date));
                        return;
                    }
                }
            }
        } catch (Exception ignored) { }
    }
}
