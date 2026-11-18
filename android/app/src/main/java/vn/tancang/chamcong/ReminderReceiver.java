package vn.tancang.chamcong;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONObject;

public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String type = i.getStringExtra("type"), date = i.getStringExtra("date");
        SharedPreferences p = Prefs.get(c);
        String tDate = p.getString("tDate", ""), tLast = p.getString("tLast", "");
        boolean today = date != null && date.equals(tDate);
        String shift = "";
        try { JSONObject s = new JSONObject(p.getString("sched", "{}")); shift = s.optString("name", ""); } catch (Exception ignored) { }
        if ("IN".equals(type) && !(today && !tLast.isEmpty())) {
            Notifs.show(c, 7101, "⏰ Sắp đến giờ vào ca " + shift, "Nhớ CHECK-IN khi đến nơi làm việc.", Notifs.openApp(c, null, 7101));
        } else if ("OUT".equals(type) && today && "IN".equals(tLast)) {
            Notifs.show(c, 7102, "⏰ Đã hết giờ ca " + shift, "Nhớ CHECK-OUT trước khi rời nơi làm việc.", Notifs.openApp(c, null, 7102));
        }
        Reminders.schedule(c);
    }
}
