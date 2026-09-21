package com.shiguang.mealplanner;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
public class WeeklyReminderScheduleTest {
 private long date(TimeZone z,int y,int m,int d,int h,int min){Calendar c=Calendar.getInstance(z);c.clear();c.set(y,m-1,d,h,min);return c.getTimeInMillis();}
 @Test public void sundayAndMondayKeepOriginalWeek(){TimeZone z=TimeZone.getTimeZone("Asia/Shanghai");long now=date(z,2026,9,28,9,0);long due=WeeklyReminderSchedule.latest(now,7,"20:00",z);assertEquals(date(z,2026,9,27,20,0),due);assertEquals("2026-09-21",WeeklyReminderSchedule.week(due,z));assertEquals(date(z,2026,10,4,20,0),WeeklyReminderSchedule.next(now,7,"20:00",z));}
 @Test public void exactTimeAndYearBoundary(){TimeZone z=TimeZone.getTimeZone("Asia/Shanghai");long now=date(z,2027,1,4,9,30);assertEquals(now,WeeklyReminderSchedule.latest(now,1,"09:30",z));assertEquals("2027-01-04",WeeklyReminderSchedule.week(now,z));assertEquals("2026-12-28",WeeklyReminderSchedule.week(WeeklyReminderSchedule.latest(now-1,1,"09:30",z),z));}
 @Test public void dstKeepsWallTime(){TimeZone z=TimeZone.getTimeZone("America/New_York");long now=date(z,2026,3,1,20,0);assertEquals(date(z,2026,3,8,20,0),WeeklyReminderSchedule.next(now,7,"20:00",z));assertEquals(167*3600000L,WeeklyReminderSchedule.next(now,7,"20:00",z)-now);}
 @Test(expected=IllegalArgumentException.class) public void invalidTimeRejected(){WeeklyReminderSchedule.next(0,7,"24:00",TimeZone.getDefault());}
}
