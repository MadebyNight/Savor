import {fetchArticle} from '../links.js';
import DraftEditor from './DraftEditor.jsx';
import useConfirm from './useConfirm.jsx';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getPreference,setPreference,setSecret,isNative,exportBlob } from '../storage.js';
import { defaultAI,testAIConnection,recognize,backup,validateBackup } from '../services.js';
export default function SettingsPanel({state,onRestore,onImportRecipes,onImportStock,onSyncTarget}) {
  const [ask, confirmation] = useConfirm();
  const [config,setConfig] = useState(defaultAI);
  const [key,setKey] = useState('');
  const [testing,setTesting]=useState(false);
  const [testResult,setTestResult]=useState(null);
  const testGeneration=useRef(0);
  const testRunning=useRef(false);
  useEffect(()=>()=>{testGeneration.current++;},[]);
  useEffect(()=>{setTestResult(null);},[config.url,config.model,key]);
  const [text,setText] = useState('');
  const [link,setLink] = useState('');
  const [fetching,setFetching] = useState(false);
  const [image,setImage] = useState('');
  const [kind,setKind] = useState('recipes');
  const [draft,setDraft] = useState('');
  const [busy,setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => {generation.current++;}, []);
  useEffect(() => { getPreference('ai-config',defaultAI).then(setConfig); getPreference('ai-draft',{}).then(v => {setText(v.text || '');setImage(v.image || '');setDraft(v.draft || '');setKind(v.kind || 'recipes');}); },[]);
  const persist = async (value = draft) => setPreference('ai-draft',{text,image,kind,draft:value});
  async function testConnection(){
    if(testRunning.current)return;
    testRunning.current=true;
    const current=++testGeneration.current;
    try{
      if(!(await ask('将向 '+config.url+' 发送一条固定测试文本，不包含菜谱或图片，可能产生少量费用。测试不会保存配置。',{title:'测试 AI 连接？',label:'开始测试'})))return;
      if(current!==testGeneration.current)return;
      setTesting(true);setTestResult(null);
      const result=await testAIConnection(config,key);
      if(current===testGeneration.current)setTestResult({ok:true,...result});
    }catch(e){if(current===testGeneration.current)setTestResult({ok:false,message:e.message});}
    finally{if(current===testGeneration.current){testRunning.current=false;setTesting(false);}}
  }
  async function run() {
    if (!text.trim() && !image) return toast.error('请粘贴文字或选择图片');
    if (!window.confirm('将把当前文字和图片发送到 ' + config.url + ' 进行识别，可能产生服务商费用。继续？')) return;
    if (draft && draft !== '[]' && !window.confirm('新识别将替换当前未保存的识别草稿，继续？')) return;
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
    <label>接口地址<input disabled={testing} value={config.url} onChange={e=>setConfig({...config,url:e.target.value})}/></label>
    <label>模型<input disabled={testing} value={config.model} onChange={e=>setConfig({...config,model:e.target.value})}/></label>
    <label>API Key<input disabled={testing} type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder="留空保留已保存的 Key"/></label>
    <div className="actions"><button className="primary" disabled={testing} onClick={async()=>{try{await setPreference('ai-config',config);if(key)await setSecret('ai',key);setKey('');toast.success(isNative()?'配置已保存，凭据已加密':'配置已保存；预览环境 Key 仅在内存保留');}catch(e){toast.error(e.message);}}}>保存 AI 配置</button><button className="outline" disabled={testing||busy} onClick={testConnection}>{testing?'正在测试…':'测试连接'}</button>{testing&&<button className="outline" onClick={()=>{testGeneration.current++;testRunning.current=false;setTesting(false);setTestResult({ok:false,message:'已停止等待；服务端可能仍在处理。'});}}>停止等待</button>}</div>
    <p className="subtle">测试当前填写的配置；Key 留空时使用已保存的 Key。测试成功后仍需点击保存。</p>
    {testResult&&<div className={`ai-test-result ${testResult.ok?'is-success':'is-error'}`} role="status" aria-live="polite">
      <strong>{testResult.ok?'连接成功':'连接测试未完成'}</strong>
      {testResult.ok?<><p>请求模型：{testResult.requestedModel}</p><p>接口返回模型：{testResult.returnedModel||'未提供模型名称'}</p><p>耗时：{(testResult.elapsedMs/1000).toFixed(2)} 秒</p><small>模型名称以接口返回为准；本次仅验证文本调用，图片识别需另行验证。</small></>:<p>{testResult.message}</p>}
    </div>}
    <h3>文字、图片与小票识别</h3>
    <select aria-label="识别类型" disabled={busy} value={kind} onChange={e=>{if(draft && draft!=='[]' && !window.confirm('切换类型会清空当前识别草稿，继续？'))return;setKind(e.target.value);setDraft('');}} ><option value="recipes">菜谱</option><option value="stock">小票 / 冰箱食材</option></select>
    <label>公开链接（可粘贴小红书分享文字）<input disabled={busy || fetching} value={link} onChange={e=>setLink(e.target.value)}/></label>
    <button className="outline" disabled={busy || fetching || !link.trim()} onClick={async()=>{if(text && !window.confirm('取得正文后会替换当前输入文字，继续？'))return;setFetching(true);try{const article=await fetchArticle(link);const content=article.title+'\n'+article.text;setText(content);await setPreference('ai-draft',{text:content,image,kind,draft});toast.success('已提取公开正文，请核对后再发送识别');}catch(e){toast.error(e.message);}finally{setFetching(false);}}}>{fetching?'正在获取正文…':'获取公开正文'}</button>
    <p className="subtle">需要登录或无法读取的页面，请粘贴正文或上传截图。获取正文不会自动发送给 AI。</p>
    <textarea disabled={busy} aria-label="识别原文" rows={5} value={text} onChange={e=>setText(e.target.value)} onBlur={()=>persist()} placeholder="粘贴菜谱正文，或先通过上方链接获取公开正文"/>
    <label>选择图片或拍照<input disabled={busy} type="file" accept="image/*" capture="environment" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>10*1024*1024)return toast.error('请选择10MB以内图片');const reader=new FileReader();reader.onload=()=>setImage(String(reader.result));reader.readAsDataURL(file);}}/></label>
    {image && <><img src={image} alt="待识别图片" style={{maxWidth:240,maxHeight:180}}/><button className="outline" onClick={()=>setImage('')}>移除图片</button></>}
    <div className="actions"><button className="primary" disabled={busy||testing} onClick={run}>确认发送并识别</button>{busy && <button className="outline" onClick={()=>{generation.current++;setBusy(false);toast('已停止等待，服务端可能仍在处理');}}>取消等待</button>}<button className="outline" onClick={()=>persist().then(()=>toast.success('草稿已保存'))}>保存草稿</button></div>
    <DraftEditor items={(()=>{try {return JSON.parse(draft || '[]');}catch{return [];}})()} kind={kind} onChange={items=>{const value=JSON.stringify(items);setDraft(value);persist(value).catch(e=>toast.error(e.message));}} onSave={saveItems}/>
    <h3>备份与恢复</h3><button className="outline" onClick={downloadBackup}>导出完整备份</button><label>导入备份<input type="file" accept=".json,application/json" onChange={e=>restore(e.target.files?.[0])}/></label>
    <button className="outline" onClick={async()=>{const previous=await getPreference('before-restore');if(!previous)return toast('没有恢复前备份');if(window.confirm('恢复到上次导入前的数据？'))await onRestore(validateBackup(previous));}}>恢复上次导入前数据</button>
    <div ref={onSyncTarget}/>
    {confirmation}
  </div>;
}
