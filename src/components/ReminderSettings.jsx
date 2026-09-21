import { AppSelect, DateTimePicker } from "./Pickers.jsx";
import {useState,useEffect} from 'react';
import {DEFAULT_REMINDERS,getReminderStatus,saveReminders,openNotificationSettings} from '../reminders.js';
import {isNative} from '../storage.js';
export default function ReminderSettings(){
 const [status,setStatus]=useState(null),[draft,setDraft]=useState(DEFAULT_REMINDERS),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;const refresh=()=>getReminderStatus().then(s=>{if(active){setStatus(s);setDraft(s.settings);}}).catch(()=>{if(active)setError('提醒设置读取失败');});refresh();const visible=()=>{if(document.visibilityState==='visible')refresh();};document.addEventListener('visibilitychange',visible);return()=>{active=false;document.removeEventListener('visibilitychange',visible);};},[]);
 return <section className="reminder-settings"><h3>营养周报提醒</h3><p>两种提醒共用时间。前台仅显示应用内提示，后台按系统通知开关发送。查看目标周营养回顾即可停止该周提醒。</p>
  <label><input type="checkbox" checked={draft.inApp} disabled={busy||!status} onChange={e=>setDraft({...draft,inApp:e.target.checked})}/>应用内提醒</label>
  <label><input type="checkbox" checked={draft.system} disabled={busy||!status||!isNative()} onChange={e=>setDraft({...draft,system:e.target.checked})}/>系统通知</label>
  <label>每周几<AppSelect aria-label="每周几" value={draft.weekday} disabled={busy||!status} onChange={e=>setDraft({...draft,weekday:Number(e.target.value)})}>{['一','二','三','四','五','六','日'].map((d,i)=><option key={d} value={i+1}>周{d}</option>)}</AppSelect></label>
  <label>提醒时间<DateTimePicker aria-label="提醒时间" type="time" value={draft.time} disabled={busy||!status} onChange={e=>setDraft({...draft,time:e.target.value})}/></label>
  <button className="primary" disabled={busy||!status} onClick={async()=>{setBusy(true);setError('');setMessage('');try{const s=await saveReminders(draft);setStatus(s);setDraft(s.settings);setMessage(draft.system&&!s.settings.system?'系统通知未获许可，未启用；可到系统设置中打开。':'提醒设置已保存');}catch(e){setError(e.message);}finally{setBusy(false);}}}>保存提醒设置</button>
  {status?.nextAt>0&&<p>下一次：{new Date(status.nextAt).toLocaleString('zh-CN',{hour12:false})}</p>}
  <p className="subtle">{isNative()?(status?.permission?'系统通知权限可用':'系统通知权限或通知渠道未开启'):'浏览器预览只验证应用内提醒；系统通知需要 Android。'} 系统节电可能使通知延迟；强行停止应用后需重新打开恢复调度。</p>
  {isNative()&&<button className="outline" onClick={()=>openNotificationSettings().catch(e=>setError(e.message))}>打开系统通知设置</button>}
  {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
