package com.shiguang.mealplanner;
import java.util.Calendar;
import java.util.TimeZone;
import java.text.SimpleDateFormat;
import java.util.Locale;

/** Local calendar arithmetic keeps weekly reminders at the selected wall time across DST. */
public final class WeeklyReminderSchedule {
    public static Calendar candidate(long now, int weekday, String time, TimeZone zone) {
        if (weekday < 1 || weekday > 7 || time == null || !time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]")) throw new IllegalArgumentException("schedule");
        Calendar c = Calendar.getInstance(zone); c.setTimeInMillis(now);
        int iso = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
        c.add(Calendar.DAY_OF_MONTH, weekday - iso);
        c.set(Calendar.HOUR_OF_DAY, Integer.parseInt(time.substring(0, 2)));
        c.set(Calendar.MINUTE, Integer.parseInt(time.substring(3))); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
        return c;
    }
    public static long next(long now, int weekday, String time, TimeZone zone) {
        Calendar c = candidate(now, weekday, time, zone); if(c.getTimeInMillis() <= now)c.add(Calendar.DAY_OF_MONTH,7);return c.getTimeInMillis();
    }
    public static long latest(long now, int weekday, String time, TimeZone zone) {
        Calendar c = candidate(now, weekday, time, zone); if(c.getTimeInMillis() > now)c.add(Calendar.DAY_OF_MONTH,-7);return c.getTimeInMillis();
    }
    public static String week(long when, TimeZone zone) {
        Calendar c=Calendar.getInstance(zone);c.setTimeInMillis(when);c.add(Calendar.DAY_OF_MONTH,-(c.get(Calendar.DAY_OF_WEEK)+5)%7);
        SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT);f.setTimeZone(zone);return f.format(c.getTime());
    }
}
