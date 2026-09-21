import {LocalData,isNative,getPreference,setPreference} from './storage.js';
import {monday} from './domain.js';
export const DEFAULT_REMINDERS={inApp:false,system:false,weekday:7,time:'20:00'};
export function validateReminders(s){if(!s||typeof s.inApp!=='boolean'||typeof s.system!=='boolean'||!Number.isInteger(s.weekday)||s.weekday<1||s.weekday>7||typeof s.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))throw new Error('请选择有效的星期和时间');return s;}
export function reminderTimes(s,now=new Date()){
 validateReminders(s);const due=new Date(now),[h,m]=s.time.split(':').map(Number);
 due.setDate(due.getDate()+s.weekday-((due.getDay()+6)%7+1));due.setHours(h,m,0,0);
 const next=new Date(due);if(next<=now)next.setDate(next.getDate()+7);if(due>now)due.setDate(due.getDate()-7);
 const date=[due.getFullYear(),String(due.getMonth()+1).padStart(2,'0'),String(due.getDate()).padStart(2,'0')].join('-');
 return {dueAt:due.getTime(),nextAt:next.getTime(),week:monday(date)};
}
export function reminderState(stored={},now=new Date()){
 const settings={...DEFAULT_REMINDERS,...stored.settings},times=reminderTimes(settings,now),enabled=settings.inApp||settings.system;
 const targetWeek=enabled&&times.dueAt>=(stored.enabledSince??Infinity)&&times.week>(stored.pendingWeek||'')?times.week:stored.pendingWeek||null;
 return {settings,targetWeek,pendingWeek:enabled&&targetWeek&&!(stored.reviewed||[]).includes(targetWeek)?targetWeek:null,nextAt:enabled?times.nextAt:0,permission:false};
}
let pending=Promise.resolve();
const serial=work=>{const next=pending.catch(()=>{}).then(work);pending=next;return next;};
export const getReminderStatus=()=>serial(async()=>{if(isNative())return LocalData.reminderStatus();const stored=await getPreference('weekly-reminders',{}),result=reminderState(stored);if(result.targetWeek&&result.targetWeek!==stored.pendingWeek)await setPreference('weekly-reminders',{...stored,pendingWeek:result.targetWeek});return result;});
export const saveReminders=settings=>serial(async()=>{
 validateReminders(settings);let result;
 if(isNative())result=await LocalData.saveReminders({settings});
 else {const stored=await getPreference('weekly-reminders',{}),old={...DEFAULT_REMINDERS,...stored.settings};
  if((!old.inApp&&!old.system)||old.weekday!==settings.weekday||old.time!==settings.time){stored.enabledSince=Date.now();delete stored.pendingWeek;}
  stored.settings={...settings,system:false};await setPreference('weekly-reminders',stored);result=reminderState(stored);}
 window.dispatchEvent(new Event('shiguang:reminders'));return result;
});
export const markWeekReviewed=week=>serial(async()=>{
 let result;if(isNative())result=await LocalData.markWeekReviewed({week});else{const s=await getPreference('weekly-reminders',{});s.reviewed=[...new Set([...(s.reviewed||[]),week])];await setPreference('weekly-reminders',s);result=reminderState(s);}
 window.dispatchEvent(new Event('shiguang:reminders'));return result;
});
export async function consumeReminderLaunch(){return isNative()?(await LocalData.consumeReminderLaunch()).value:null;}
export async function openNotificationSettings(){if(isNative())await LocalData.openNotificationSettings();}
