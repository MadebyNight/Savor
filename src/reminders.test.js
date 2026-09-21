import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_REMINDERS,reminderTimes,reminderState,validateReminders} from './reminders.js';
test('周日到时回顾完整本周，周一补看保留旧周，下次按日历周',()=>{
 const s={...DEFAULT_REMINDERS,inApp:true},sunday=new Date(2026,8,27,20),monday=new Date(2026,8,28,9);
 assert.equal(reminderTimes(s,sunday).week,'2026-09-21');assert.equal(reminderTimes(s,monday).week,'2026-09-21');assert.equal(new Date(reminderTimes(s,monday).nextAt).getDate(),4);
 const stored={settings:s,enabledSince:new Date(2026,8,21).getTime()};assert.equal(reminderState(stored,monday).pendingWeek,'2026-09-21');assert.equal(reminderState({...stored,reviewed:['2026-09-21']},monday).pendingWeek,null);
 assert.equal(reminderState(stored,new Date(2026,9,12)).pendingWeek,'2026-10-05');
});
test('自定义星期、跨年归属、开启前不补发，关闭不替换渠道',()=>{
 const s={...DEFAULT_REMINDERS,inApp:true,weekday:1,time:'09:30'},now=new Date(2027,0,4,10);
 assert.equal(reminderTimes(s,now).week,'2027-01-04');assert.equal(reminderTimes(s,new Date(2027,0,4,9)).week,'2026-12-28');
 assert.equal(reminderState({settings:s,enabledSince:now.getTime()},now).pendingWeek,null);
 assert.equal(reminderState({settings:DEFAULT_REMINDERS,enabledSince:0},now).pendingWeek,null);
 assert.equal(reminderState({settings:{...s,inApp:false,system:true},enabledSince:0},now).settings.inApp,false);
 for(const change of [{weekday:0},{weekday:8},{time:'24:00'},{time:'9:00'},{inApp:'true'}])assert.throws(()=>validateReminders({...s,...change}));
});

test('已到期目标周持久化，回拨时间不换成旧周，最新到期周替换',()=>{const stored={settings:{...DEFAULT_REMINDERS,inApp:true},enabledSince:0,pendingWeek:'2026-09-21'};assert.equal(reminderState(stored,new Date(2026,8,23)).pendingWeek,'2026-09-21');assert.equal(reminderState(stored,new Date(2026,9,5)).pendingWeek,'2026-09-28');});
