package com.shiguang.mealplanner;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
public class WeeklyReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        String action=intent.getAction();
        if(!WeeklyReminders.ACTION.equals(action)&&!Intent.ACTION_BOOT_COMPLETED.equals(action)&&!Intent.ACTION_TIME_CHANGED.equals(action)&&!Intent.ACTION_TIMEZONE_CHANGED.equals(action)&&!Intent.ACTION_MY_PACKAGE_REPLACED.equals(action))return;
        try{WeeklyReminders.tick(context,true);}catch(RuntimeException error){Log.e("WeeklyReminder","schedule failed: "+error.getClass().getSimpleName());}
    }
}
