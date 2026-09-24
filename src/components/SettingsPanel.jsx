import ReminderSettings from './ReminderSettings.jsx';
import {developerAvailable,getDeveloperConfig,enableDeveloperConfig,disableDeveloperConfig} from '../developer-ai.js';
import useConfirm from './useConfirm.jsx';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog.jsx';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getPreference,setPreference,setSecret,isNative,exportBlob } from '../storage.js';
import { defaultAI,testAIConnection,backup,validateBackup } from '../services.js';
import { ArrowLeft, Bell, ChevronRight, Cloud, DatabaseBackup, Sparkles } from 'lucide-react';
const settingsEntries=[
  ['ai','AI 配置','模型、接口与凭据',Sparkles],
  ['backup','备份恢复','导出与导入本地数据',DatabaseBackup],
  ['sync','坚果云同步','手动同步与冲突处理',Cloud],
  ['reminders','营养周报提醒','应用内与系统通知',Bell],
];
export default function SettingsPanel({state,onRestore,onSyncTarget,page='home',onPageChange}) {
  const backupInput=useRef(null);
  const [ask, confirmation] = useConfirm();
  const [config,setConfig] = useState(defaultAI);
  const [key,setKey] = useState('');
  const [developer,setDeveloper]=useState(null);
  const [loadingConfig,setLoadingConfig]=useState(true);
  const [unlockOpen,setUnlockOpen]=useState(false);
  const [unlockPassword,setUnlockPassword]=useState('');
  const [unlockError,setUnlockError]=useState('');
  const [unlocking,setUnlocking]=useState(false);
  const effectiveConfig=developer || config;
  const [testing,setTesting]=useState(false);
  const [testResult,setTestResult]=useState(null);
  const testGeneration=useRef(0);
  const testRunning=useRef(false);
  useEffect(()=>()=>{testGeneration.current++;},[]);
  useEffect(()=>{setTestResult(null);},[config.url,config.model,key,developer]);
  useEffect(() => {let active=true;Promise.all([getPreference('ai-config',defaultAI),getDeveloperConfig()]).then(([saved,profile])=>{if(active){setConfig(saved);setDeveloper(profile);}}).catch(()=>toast.error('AI 配置读取失败，请重新打开设置')).finally(()=>{if(active)setLoadingConfig(false);});return()=>{active=false;};},[]);
  async function testConnection(){
    if(testRunning.current)return;
    testRunning.current=true;
    const current=++testGeneration.current;
    try{
      if(!(await ask('测试当前填写的 AI 配置？',{title:'测试 AI 连接？',label:'开始测试'})))return;
      if(current!==testGeneration.current)return;
      setTesting(true);setTestResult(null);
      const result=await testAIConnection(effectiveConfig,developer?'':key);
      if(current===testGeneration.current)setTestResult({ok:true,...result});
    }catch(e){if(current===testGeneration.current)setTestResult({ok:false,message:e.message});}
    finally{if(current===testGeneration.current){testRunning.current=false;setTesting(false);}}
  }
  async function downloadBackup() {
    try { await exportBlob(new Blob([JSON.stringify(backup(state),null,2)],{type:'application/json'}),'食光备份-'+new Date().toISOString().slice(0,10)+'.json'); } catch(e) { toast.error(e.message); }
  }
  async function restore(file) {
    if(!file)return;
    try {const incoming=validateBackup(JSON.parse(await file.text()));if(!(await ask('恢复将整体替换当前业务数据，应用会先保留恢复前备份。',{title:'恢复备份？',label:'确认恢复',danger:true})))return;await setPreference('before-restore',backup(state));await onRestore(incoming);toast.success('备份已恢复');}catch(e){toast.error(e.message);}
  }
  return <div className="panel settings-panel">
    <h2 className="settings-home-heading" hidden={page!=='home'}>设置与数据</h2>
    <nav className="settings-home" aria-label="设置首页" hidden={page!=='home'}>
      <p className="settings-group-title">功能与数据</p>
      {settingsEntries.slice(0,3).map(([id,label,detail,Icon])=><button className="settings-entry" key={id} type="button" aria-label={label} aria-describedby={`settings-${id}-description`} aria-controls={`settings-${id}`} onClick={()=>onPageChange(id)}><span className="settings-entry-icon"><Icon size={20} strokeWidth={1.8}/></span><span className="settings-entry-copy"><strong>{label}</strong><small id={`settings-${id}-description`}>{detail}</small></span><ChevronRight className="settings-entry-arrow" size={20}/></button>)}
      <p className="settings-group-title">提醒</p>
      {settingsEntries.slice(3).map(([id,label,detail,Icon])=><button className="settings-entry" key={id} type="button" aria-label={label} aria-describedby={`settings-${id}-description`} aria-controls={`settings-${id}`} onClick={()=>onPageChange(id)}><span className="settings-entry-icon"><Icon size={20} strokeWidth={1.8}/></span><span className="settings-entry-copy"><strong>{label}</strong><small id={`settings-${id}-description`}>{detail}</small></span><ChevronRight className="settings-entry-arrow" size={20}/></button>)}
    </nav>
    <div className="settings-detail-header" hidden={page==='home'}><button type="button" className="outline" onClick={()=>onPageChange('home')}><ArrowLeft size={18}/>返回设置</button><h2>{settingsEntries.find(([id])=>id===page)?.[1]}</h2></div>
    <section id="settings-reminders" className="settings-page" hidden={page!=='reminders'} aria-label="营养周报提醒"><ReminderSettings/></section>
    <section id="settings-ai" className="settings-page" hidden={page!=='ai'} aria-label="AI 配置">

    <label>接口地址<input disabled={testing||!!developer||loadingConfig||unlocking} value={effectiveConfig.url} onChange={e=>setConfig({...config,url:e.target.value})}/></label>

    <label>模型<input disabled={testing||!!developer||loadingConfig||unlocking} value={effectiveConfig.model} onChange={e=>setConfig({...config,model:e.target.value})}/></label>
    <label>API Key<input disabled={testing||!!developer||loadingConfig||unlocking} type="password" autoComplete="new-password" value={developer?'':key} onChange={e=>setKey(e.target.value)} placeholder={developer?'开发者 Key 已加密保管':'留空保留已保存的 Key'}/></label>
    <div className="actions"><button className="primary" disabled={testing||!!developer||loadingConfig||unlocking} onClick={async()=>{try{await setPreference('ai-config',config);if(key)await setSecret('ai',key);setKey('');toast.success(isNative()?'配置已保存，凭据已加密':'配置已保存；预览环境 Key 仅在内存保留');}catch(e){toast.error(e.message);}}}>保存 AI 配置</button><button className="outline" disabled={testing||loadingConfig||unlocking} onClick={testConnection}>{testing?'正在测试…':'测试连接'}</button>{testing&&<button className="outline" onClick={()=>{testGeneration.current++;testRunning.current=false;setTesting(false);setTestResult({ok:false,message:'已停止等待；服务端可能仍在处理。'});}}>停止等待</button>}</div>

    {developerAvailable&&<details className="developer-config"><summary>开发者配置</summary>
      <button className={developer?'primary':'outline'} aria-pressed={!!developer} disabled={testing||loadingConfig||unlocking} onClick={async()=>{
        if(!developer){setUnlockPassword('');setUnlockError('');setUnlockOpen(true);return;}
        setUnlocking(true);
        try{await disableDeveloperConfig();setDeveloper(null);toast.success('已恢复个人 AI 配置');}catch{toast.error('关闭失败，请重试');}finally{setUnlocking(false);}
      }}>{developer?'关闭开发者配置':'启用开发者配置'}</button>
    </details>}
    </section>
    {unlockOpen&&<Dialog open onOpenChange={open=>{if(!open&&!unlocking){setUnlockOpen(false);setUnlockPassword('');setUnlockError('');}}}><DialogContent className="app-dialog developer-unlock-dialog" forceBackdrop aria-busy={unlocking}>
      <DialogTitle>启用开发者配置</DialogTitle>
      <DialogDescription>输入密码启用 AI 配置。</DialogDescription>
      <form className="developer-unlock-form" onSubmit={async event=>{
        event.preventDefault();if(unlocking||!unlockPassword)return;
        setUnlocking(true);setUnlockError('');
        try{const active=await enableDeveloperConfig(unlockPassword);setDeveloper(active);setUnlockOpen(false);toast.success('开发者配置已启用');}catch(error){setUnlockError(error.message);}finally{setUnlockPassword('');setUnlocking(false);}
      }}>
        <label>解锁密码<input type="password" autoComplete="off" disabled={unlocking} value={unlockPassword} onChange={e=>setUnlockPassword(e.target.value)} aria-invalid={!!unlockError} aria-describedby={unlockError?'developer-unlock-error':undefined}/></label>
        {unlockError&&<p id="developer-unlock-error" role="alert">{unlockError}</p>}
        <div className="actions"><button type="button" className="outline" disabled={unlocking} onClick={()=>{setUnlockOpen(false);setUnlockPassword('');setUnlockError('');}}>取消</button><button type="submit" className="primary" disabled={unlocking||!unlockPassword}>{unlocking?'正在解锁…':'解锁并启用'}</button></div>
      </form>
    </DialogContent></Dialog>}
    {testResult&&<Dialog open onOpenChange={open=>{if(!open)setTestResult(null);}}><DialogContent className={`app-dialog ai-result-dialog ai-test-result ${testResult.ok?'is-success':'is-error'}`} forceBackdrop>
      <DialogTitle>{testResult.ok?'连接成功':'连接测试未完成'}</DialogTitle>
      <DialogDescription>当前 AI 接口的连接测试结果</DialogDescription>
      {testResult.ok?<><p>请求模型：{testResult.requestedModel}</p><p>接口返回模型：{testResult.returnedModel||'未提供模型名称'}</p><p>耗时：{(testResult.elapsedMs/1000).toFixed(2)} 秒</p></>:<p>{testResult.message}</p>}
      <button className="primary" onClick={()=>setTestResult(null)}>知道了</button>
    </DialogContent></Dialog>}
    <section id="settings-backup" className="settings-page" hidden={page!=='backup'} aria-label="备份恢复">
    <button className="outline" onClick={downloadBackup}>导出完整备份</button><button className="outline" onClick={()=>backupInput.current.click()}>导入备份</button><input ref={backupInput} hidden aria-label="备份文件" type="file" accept=".json,application/json" onChange={e=>{restore(e.target.files?.[0]);e.target.value="";}}/>
    <button className="outline" onClick={async()=>{try{const previous=await getPreference('before-restore');if(!previous)return toast('没有恢复前备份');if(await ask('当前业务数据将替换为上次导入前保留的备份。',{title:'恢复导入前数据？',label:'确认恢复',danger:true}))await onRestore(validateBackup(previous));}catch(e){toast.error(e.message);}}}>恢复上次导入前数据</button>
    </section>
    <section id="settings-sync" className="settings-page" hidden={page!=='sync'} aria-label="坚果云同步"><div ref={onSyncTarget}/></section>
    {confirmation}
  </div>;
}
