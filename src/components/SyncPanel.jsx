import {useEffect,useState,useRef} from 'react';
import {createPortal} from 'react-dom';
import {toast} from 'sonner';
import useConfirm from './useConfirm.jsx';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog.jsx';
import NutstoreGuide from './NutstoreGuide.jsx';
import {getPreference,setPreference,setSecret,getSecret} from '../storage.js';
import {backup,businessState} from '../services.js';
import {defaultDAV,inspectSync,downloadVersion,uploadVersion,recordDownload,fingerprint} from '../sync.js';
export default function SyncPanel({state,onRestore,target}) {
 const [ask,confirmation]=useConfirm();
 const cancelButton=useRef(null);
 const latest=useRef(state);latest.current=state;
 const running=useRef(false);const started=useRef(false);
 const [autoSync,setAutoSync]=useState(true);
 const [config,setConfig]=useState(defaultDAV);const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [context,setContext]=useState(null);const [pending,setPending]=useState([]);const [last,setLast]=useState('尚未同步');
 useEffect(()=>{getPreference('dav-auto-sync',true).then(setAutoSync);getPreference('dav-config',defaultDAV).then(setConfig);getPreference('sync-pending',[]).then(setPending);getPreference('sync-base').then(v=>v&&setLast(v.time));},[]);
 async function apply(ctx,direction,version){
  if(running.current)return;
  running.current=true;setBusy(true);
  try{
   const current=latest.current;
   if(await fingerprint(businessState(current))!==ctx.hash)throw new Error('检查后本地数据已改变，请重新检查再同步');
   if(direction==='upload')await uploadVersion(ctx,current);
   else{
    const incoming=await downloadVersion(ctx,version);
    const before=latest.current;
    if(await fingerprint(businessState(before))!==ctx.hash)throw new Error('下载期间本地数据已改变，已保留本地修改，请重新检查');
    await setPreference('before-restore',backup(before));
    await onRestore({...incoming,qty:before.qty,recipeDraft:before.recipeDraft},before);
    // 恢复历史/待发布副本后，下次启动先确认，避免立即自动恢复云端最新版。
    await recordDownload(version||ctx.remote,incoming,version&&version.id!==ctx.remote?.id?undefined:ctx.scope);
   }
   setLast(new Date().toISOString());setContext(null);toast.success('同步完成');
  }catch(e){toast.error(e.message);}finally{running.current=false;setBusy(false);getPreference('sync-pending',[]).then(setPending);}
 }
 async function inspect(automatic=false,savedConfig=config){
  if(running.current)return;
  running.current=true;setBusy(true);
  let next;
  try{
   const ctx=await inspectSync(savedConfig,latest.current);
   if(ctx.hash!==await fingerprint(businessState(latest.current)))throw new Error('检查期间本地数据已改变，请重新检查');
   if(ctx.action==='equal'){if(!automatic)toast.success('本地与云端一致');}
   else if(automatic&&ctx.trustedBase&&ctx.remote&&ctx.action!=='choose')next=ctx;
   else setContext(ctx);
  }catch(e){toast.error((automatic?'启动同步未完成：':'')+e.message);}
  finally{running.current=false;setBusy(false);getPreference('sync-pending',[]).then(setPending);}
  if(next)await apply(next,next.action);
 }
 useEffect(()=>{
  if(started.current)return;started.current=true;
  (async()=>{
   const saved=await getPreference('dav-config',defaultDAV);
   if(await getPreference('dav-auto-sync',true)&&saved.username&&await getSecret('dav'))await inspect(true,saved);
  })().catch(e=>toast.error('启动同步未完成：'+e.message));
 },[]);
 const reason=context && (!context.remote?'云端还没有食光备份，请先上传本机数据。':!context.trustedBase?'首次连接此账号或缺少同步记录，请选择要保留的版本。':context.action==='choose'?'本地和云端都有变化，请选择要保留的版本。':context.action==='upload'?'只有本地有新修改，建议上传；也可以下载云端版本替换本地。':'云端有新版本，建议下载；也可以上传本地版本。');
 const form=<section><h3>坚果云同步</h3><p>最近同步：{last}。{autoSync?'启动时自动检查同步；两端都有变化时由你确认。':'已关闭启动同步，请手动检查并同步。'}</p><label><span><input type="checkbox" checked={autoSync} onChange={async e=>{const value=e.target.checked;try{await setPreference('dav-auto-sync',value);setAutoSync(value);}catch(error){toast.error(error.message);}}}/> 启动应用时自动同步</span></label><NutstoreGuide/><label>WebDAV 根地址<input disabled={busy} value={config.url} onChange={e=>setConfig({...config,url:e.target.value})}/></label><label>账号<input disabled={busy} value={config.username} onChange={e=>setConfig({...config,username:e.target.value})}/></label><label>应用密码<input disabled={busy} type="password" autoComplete="new-password" value={password} placeholder="留空保留已保存密码" onChange={e=>setPassword(e.target.value)}/></label><div className="actions"><button className="outline" disabled={busy} onClick={async()=>{try{await setPreference('dav-config',config);if(password)await setSecret('dav',password);setPassword('');toast.success('同步配置已保存');}catch(e){toast.error(e.message);}}}>保存同步配置</button><button className="primary" disabled={busy} onClick={()=>inspect()}>{busy?'正在处理…':'检查并同步'}</button></div>
 {pending.length>0 && <details><summary>待确认发布副本（{pending.length}）</summary><p>发布中断或冲突时保留，恢复前会校验数据与图片；未上传完整的副本可能无法恢复。</p>{pending.map(v=><p key={v.id}>{v.time} · {v.recipes} 道菜 <button className="text-link" disabled={busy} onClick={async()=>{if(!(await ask('将恢复此副本并先备份当前数据；未上传完整的副本可能无法恢复。',{title:'恢复待发布副本？',label:'确认恢复',danger:true})))return;try{const ctx=await inspectSync(config,state);await apply(ctx,'download',v);}catch(e){toast.error(e.message);}}}>恢复副本</button></p>)}</details>}
 </section>;
 return <>{target&&createPortal(form,target)}
 {context&&<Dialog open onOpenChange={open=>{if(!open&&!busy)setContext(null);}}><DialogContent className="app-dialog sync-dialog" initialFocus={cancelButton} forceBackdrop aria-busy={busy}><DialogTitle>{context.action==='choose'?'本地与云端需要选择版本':'请确认同步方向'}</DialogTitle><DialogDescription>{reason}</DialogDescription><div className="sync-version"><strong>本地数据</strong><p>{state.recipes.length} 道菜，{state.fridge.length} 条库存。</p></div><div className="sync-version"><strong>云端数据</strong><p>{context.remote?`${context.remote.time}，设备 ${context.remote.device}，${context.remote.recipes??'?'} 道菜`:'尚无数据'}。</p></div><p>下载会替换本机菜谱、库存和菜单，替换前保留本地备份；上传会将本机数据设为云端最新版本，并保留历史版本。</p><div className="actions"><button className="primary" disabled={busy} onClick={()=>apply(context,'upload')}>上传到云端</button>{context.remote&&<button className="outline" disabled={busy} onClick={()=>apply(context,'download')}>下载到本机</button>}<button ref={cancelButton} className="outline" disabled={busy} onClick={()=>setContext(null)}>暂不处理</button></div>{context.remote?.versions?.length>0&&<details><summary>最近云端备份</summary>{context.remote.versions.map(v=><p key={v.id}>{v.time}<button className="text-link" disabled={busy} onClick={async()=>{if(await ask('将用这个云端备份整体替换本地数据；应用会先保留本地备份。',{title:'恢复云端版本？',label:'确认恢复',danger:true}))await apply(context,'download',v);}}>恢复此版本</button></p>)}</details>}{busy&&<p role="status">正在同步，请稍候…</p>}{confirmation}</DialogContent></Dialog>}
 {!context&&confirmation}
 </>;
}
