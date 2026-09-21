package com.shiguang.mealplanner;
import android.app.*;
import android.content.*;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import java.util.*;

public final class WeeklyReminders {
    static final String CHANNEL="weekly-nutrition", ACTION="com.shiguang.mealplanner.WEEKLY_REVIEW", EXTRA="reviewWeek";
    static final int ID=121;
    private static boolean foreground;
    static android.content.SharedPreferences prefs(Context c){return c.getSharedPreferences("weekly-reminders",Context.MODE_PRIVATE);}
    static NotificationManager manager(Context c){return (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);}
    static void channel(Context c){if(Build.VERSION.SDK_INT>=26)manager(c).createNotificationChannel(new NotificationChannel(CHANNEL,"营养周报提醒",NotificationManager.IMPORTANCE_DEFAULT));}
    static boolean allowed(Context c){
        channel(c); if(!NotificationManagerCompat.from(c).areNotificationsEnabled())return false;
        return Build.VERSION.SDK_INT<26 || manager(c).getNotificationChannel(CHANNEL).getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    private static void commit(android.content.SharedPreferences.Editor e){if(!e.commit())throw new IllegalStateException("reminder persistence failed");}
    public static synchronized void foreground(Context c,boolean active){foreground=active; if(active)tick(c,false);}
    private static PendingIntent alarm(Context c){return PendingIntent.getBroadcast(c,ID,new Intent(c,WeeklyReminderReceiver.class).setAction(ACTION),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static void schedule(Context c){
        var p=prefs(c);AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);a.cancel(alarm(c));
        if(p.getBoolean("inApp",false)||p.getBoolean("system",false))a.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,WeeklyReminderSchedule.next(System.currentTimeMillis(),p.getInt("weekday",7),p.getString("time","20:00"),TimeZone.getDefault()),alarm(c));
    }
    public static synchronized JSObject tick(Context c,boolean notify){
        var p=prefs(c);long now=System.currentTimeMillis();int day=p.getInt("weekday",7);String time=p.getString("time","20:00");
        long due=WeeklyReminderSchedule.latest(now,day,time,TimeZone.getDefault());String week=WeeklyReminderSchedule.week(due,TimeZone.getDefault());
        boolean enabled=p.getBoolean("inApp",false)||p.getBoolean("system",false);
        boolean pending=enabled&&due>=p.getLong("enabledSince",Long.MAX_VALUE)&&!p.getStringSet("reviewed",Collections.emptySet()).contains(week);
        if(notify&&!foreground&&pending&&p.getBoolean("system",false)&&allowed(c)&&!week.equals(p.getString("lastNotified",""))){
            Intent launch=new Intent(c,MainActivity.class).putExtra(EXTRA,week).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent tap=PendingIntent.getActivity(c,ID,launch,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification n=new NotificationCompat.Builder(c,CHANNEL).setSmallIcon(com.shiguang.mealplanner.R.drawable.ic_stat_review).setContentTitle("本周菜单营养回顾").setContentText("查看 "+week+" 起这一周的菜单预计营养").setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build();
            // Record before posting: a retry must never double-alert after a process restart.
            commit(p.edit().putString("lastNotified",week));manager(c).notify(ID,n);
        }
        if(!pending||!p.getBoolean("system",false)||!week.equals(p.getString("lastNotified","")))manager(c).cancel(ID);
        schedule(c);
        JSObject s=new JSObject();s.put("weekday",day);s.put("time",time);s.put("inApp",p.getBoolean("inApp",false));s.put("system",p.getBoolean("system",false));
        JSObject result=new JSObject();result.put("settings",s);result.put("pendingWeek",pending?week:org.json.JSONObject.NULL);result.put("permission",allowed(c));result.put("nextAt",enabled?WeeklyReminderSchedule.next(now,day,time,TimeZone.getDefault()):0);return result;
    }
    public static synchronized JSObject save(Context c,JSObject s){
        int day=s.optInt("weekday",0);String time=s.optString("time","");WeeklyReminderSchedule.candidate(System.currentTimeMillis(),day,time,TimeZone.getDefault());
        if(!(s.opt("inApp") instanceof Boolean)||!(s.opt("system") instanceof Boolean))throw new IllegalArgumentException("switches");
        var p=prefs(c);boolean system=s.optBoolean("system")&&allowed(c);var e=p.edit().putInt("weekday",day).putString("time",time).putBoolean("inApp",s.optBoolean("inApp")).putBoolean("system",system);
        if((!p.getBoolean("inApp",false)&&!p.getBoolean("system",false))||day!=p.getInt("weekday",7)||!time.equals(p.getString("time","20:00")))e.putLong("enabledSince",System.currentTimeMillis());
        int oldDay=p.getInt("weekday",7);String oldTime=p.getString("time","20:00");boolean oldApp=p.getBoolean("inApp",false),oldSystem=p.getBoolean("system",false);long oldSince=p.getLong("enabledSince",Long.MAX_VALUE);
        try{commit(e);return tick(c,false);}catch(RuntimeException failure){
            commit(p.edit().putInt("weekday",oldDay).putString("time",oldTime).putBoolean("inApp",oldApp).putBoolean("system",oldSystem).putLong("enabledSince",oldSince));
            try{schedule(c);}catch(RuntimeException ignored){}throw failure;
        }
    }
    public static synchronized JSObject reviewed(Context c,String week){
        if(week==null||!week.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))throw new IllegalArgumentException("week");
        var p=prefs(c);Set<String> seen=new HashSet<>(p.getStringSet("reviewed",Collections.emptySet()));seen.add(week);commit(p.edit().putStringSet("reviewed",seen));
        if(week.equals(p.getString("lastNotified","")))manager(c).cancel(ID);return tick(c,false);
    }
}
