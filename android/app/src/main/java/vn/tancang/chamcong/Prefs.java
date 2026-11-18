package vn.tancang.chamcong;

import android.content.Context;
import android.content.SharedPreferences;

final class Prefs {
    static SharedPreferences get(Context c) { return c.getSharedPreferences("cc", Context.MODE_PRIVATE); }
}
