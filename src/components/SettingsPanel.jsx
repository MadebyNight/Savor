import DraftEditor from './DraftEditor.jsx';
import SyncPanel from './SyncPanel.jsx';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getPreference,setPreference,setSecret,isNative,exportBlob } from '../storage.js';
import { defaultAI,recognize,backup,validateBackup } from '../services.js';
export default function SettingsPanel({state,onRestore,onImportRecipes,onImportStock}) {
  const [config,setConfig] = useState(defaultAI);
  const [key,setKey] = useState('');
  const [text,setText] = useState('');
  const [image,setImage] = useState('');
  const [kind,setKind] = useState('recipes');
  const [draft,setDraft] = useState('');
  const [busy,setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => { getPreference('ai-config',defaultAI).then(setConfig); getPreference('ai-draft',{}).then(v => {setText(v.text || '');setImage(v.image || '');setDraft(v.draft || '');setKind(v.kind || 'recipes');}); },[]);
  const persist = async (value = draft) => setPreference('ai-draft',{text,image,kind,draft:value});
  async function run() {
    if (!text.trim() && !image) return toast.error('请粘贴文字或选择图片');
    if (!window.confirm('将把当前文字和图片发送到 ' + config.url + ' 进行识别，可能产生服务商费用。继续？')) return;
    const current = ++generation.current;
    setBusy(true);
    try { await persist(); const items = await recognize(config,text,image,kind); if (current !== generation.current) return; const value = JSON.stringify(items,null,2); setDraft(value); await persist(value); toast.success('识别完成，请编辑核对后保存'); } catch(e) {if(current === generation.current) toast.error(e.message);} finally {if(current === generation.current) setBusy(false);}
  }
  async function saveItems(items) {
    if(kind === 'stock') await onImportStock(items.map(i=>({...i,id:crypto.randomUUID(),date:new Date().toLocaleDateString('sv-SE')})));
    else await onImportRecipes(items.map(i=>({...i,id:crypto.randomUUID()})));
  }
  async function downloadBackup() {
    try { await exportBlob(new Blob([JSON.stringify(backup(state),null,2)],{type:'application/json'}),'食光备份-'+new Date().toISOString().slice(0,10)+'.json'); } catch(e) { toast.error(e.message); }
  }
  async function restore(file) {
    if(!file)return;
    try {const incoming=validateBackup(JSON.parse(await file.text()));if(!window.confirm('恢复将整体替换当前业务数据，系统会先保留恢复前备份。继续？'))return;await setPreference('before-restore',backup(state));await onRestore(incoming);toast.success('备份已恢复');}catch(e){toast.error(e.message);}
  }
  return <div className="panel settings-panel">
    <h2>设置与数据</h2><p>核心数据在本机保存。AI 识别需要网络，确认后才发送内容。</p>
    <h3>AI 服务</h3>
    <label>接口地址<input value={config.url} onChange={e=>setConfig({...config,url:e.target.value})}/></label>
    <label>模型<input value={config.model} onChange={e=>setConfig({...config,model:e.target.value})}/></label>
    <label>API Key<input type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder="留空保留已保存的 Key"/></label>
    <button className="primary" onClick={async()=>{try{await setPreference('ai-config',config);if(key)await setSecret('ai',key);setKey('');toast.success(isNative()?'配置已保存，凭据已加密':'配置已保存；预览环境 Key 仅在内存保留');}catch(e){toast.error(e.message);}}}>保存 AI 配置</button>
    <h3>文字、图片与小票识别</h3>
    <select aria-label="识别类型" value={kind} onChange={e=>setKind(e.target.value)}><option value="recipes">菜谱</option><option value="stock">小票 / 冰箱食材</option></select>
    <textarea aria-label="识别原文" rows={5} value={text} onChange={e=>setText(e.target.value)} onBlur={()=>persist()} placeholder="粘贴菜谱正文；小红书自动获取尚未接入"/>
    <label>选择图片或拍照<input type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>10*1024*1024)return toast.error('请选择10MB以内图片');const reader=new FileReader();reader.onload=()=>setImage(String(reader.result));reader.readAsDataURL(file);}}/></label>
    {image && <><img src={image} alt="待识别图片" style={{maxWidth:240,maxHeight:180}}/><button className="outline" onClick={()=>setImage('')}>移除图片</button></>}
    <div className="actions"><button className="primary" disabled={busy} onClick={run}>确认发送并识别</button>{busy && <button className="outline" onClick={()=>{generation.current++;setBusy(false);toast('已停止等待，服务端可能仍在处理');}}>取消等待</button>}<button className="outline" onClick={()=>persist().then(()=>toast.success('草稿已保存'))}>保存草稿</button></div>
    <DraftEditor items={(()=>{try {return JSON.parse(draft || '[]');}catch{return [];}})()} kind={kind} onChange={items=>{const value=JSON.stringify(items);setDraft(value);persist(value).catch(e=>toast.error(e.message));}} onSave={saveItems}/>
    <h3>备份与恢复</h3><button className="outline" onClick={downloadBackup}>导出完整备份</button><label>导入备份<input type="file" accept=".json,application/json" onChange={e=>restore(e.target.files?.[0])}/></label>
    <button className="outline" onClick={async()=>{const previous=await getPreference('before-restore');if(!previous)return toast('没有恢复前备份');if(window.confirm('恢复到上次导入前的数据？'))await onRestore(validateBackup(previous));}}>恢复上次导入前数据</button>
    <SyncPanel state={state} onRestore={onRestore}/>
  </div>;
}
