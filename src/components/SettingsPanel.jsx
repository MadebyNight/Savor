import {fetchArticle} from '../links.js';
import DraftEditor from './DraftEditor.jsx';
import useConfirm from './useConfirm.jsx';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog.jsx';
import { useEffect, useRef, useState } from 'react';
import {Camera,ImagePlus} from 'lucide-react';
import { toast } from 'sonner';
import { getPreference,setPreference,setSecret,isNative,exportBlob } from '../storage.js';
import { defaultAI,resolveAIEndpoint,testAIConnection,recognize,backup,validateBackup } from '../services.js';
import {normalizeAIDrafts} from '../validation.js';
export default function SettingsPanel({state,onRestore,onImportRecipes,onImportStock,onSyncTarget}) {
  const [page,setPage] = useState('recognize');
  const albumInput=useRef(null),cameraInput=useRef(null);
  const [readingImage,setReadingImage]=useState(false);
  const [ask, confirmation] = useConfirm();
  const [config,setConfig] = useState(defaultAI);
  const [key,setKey] = useState('');
  const endpoint=(()=>{try{return resolveAIEndpoint(config.url);}catch{return '';}})();
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
  const [reviewOpen,setReviewOpen]=useState(false);
  const [reviewError,setReviewError]=useState('');
  const [savingDraft,setSavingDraft]=useState(false);
  const draftResult=(()=>{try {return {items:normalizeAIDrafts(JSON.parse(draft||'[]'),kind)};}catch(error){return {items:[],error:error.message};}})();
  const draftItems=draftResult.items;
  const [busy,setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => {generation.current++;}, []);
  useEffect(() => { getPreference('ai-config',defaultAI).then(setConfig); getPreference('ai-draft',{}).then(v => {setText(v.text || '');setImage(v.image || '');setDraft(v.draft || '');setKind(v.kind || 'recipes');}); },[]);
  const persist = async (value = draft) => setPreference('ai-draft',{text,image,kind,draft:value});
  async function selectImage(event) {
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    if(file.size>10*1024*1024)return toast.error('请选择10MB以内图片');
    setReadingImage(true);
    try {
      const value=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result));
        reader.onerror=reader.onabort=()=>reject(new Error('图片读取失败，请重新从相册选择或拍摄'));
        reader.readAsDataURL(file);
      });
      setImage(value);
      await setPreference('ai-draft',{text,image:value,kind,draft});
    }catch(e){toast.error(e.message);}finally{setReadingImage(false);}
  }
  async function testConnection(){
    if(testRunning.current)return;
    testRunning.current=true;
    const current=++testGeneration.current;
    try{
      if(!(await ask('将向 '+(endpoint||config.url)+' 发送一条固定测试文本，不包含菜谱或图片，可能产生少量费用。测试不会保存配置。',{title:'测试 AI 连接？',label:'开始测试'})))return;
      if(current!==testGeneration.current)return;
      setTesting(true);setTestResult(null);
      const result=await testAIConnection(config,key);
      if(current===testGeneration.current)setTestResult({ok:true,...result});
    }catch(e){if(current===testGeneration.current)setTestResult({ok:false,message:e.message});}
    finally{if(current===testGeneration.current){testRunning.current=false;setTesting(false);}}
  }
  async function run() {
    if (!text.trim() && !image) return toast.error('请粘贴文字或选择图片');
    if (!(await ask('将把当前文字和图片发送到 ' + (endpoint||config.url) + ' 进行识别，可能产生服务商费用。', {title:'发送给 AI 识别？',label:'同意发送'}))) return;
    if (draft && draft !== '[]' && !(await ask('新识别将替换当前未保存的识别草稿。', {title:'替换识别草稿？',label:'替换并识别',danger:true}))) return;
    const current = ++generation.current;
    setBusy(true);
    try { await persist(); const items = await recognize(config,text,image,kind); if (current !== generation.current) return; const value = JSON.stringify(items,null,2); setDraft(value); await persist(value); if(current!==generation.current)return;setReviewError('');setReviewOpen(true); } catch(e) {if(current === generation.current){setReviewError(e.message);setReviewOpen(true);}} finally {if(current === generation.current) setBusy(false);}
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
    try {const incoming=validateBackup(JSON.parse(await file.text()));if(!(await ask('恢复将整体替换当前业务数据，应用会先保留恢复前备份。',{title:'恢复备份？',label:'确认恢复',danger:true})))return;await setPreference('before-restore',backup(state));await onRestore(incoming);toast.success('备份已恢复');}catch(e){toast.error(e.message);}
  }
  return <div className="panel settings-panel">
    <h2>设置与数据</h2><p>核心数据在本机保存。AI 识别需要网络，确认后才发送内容。</p>
    <nav className="settings-pages" aria-label="设置分页">
      {[['recognize','识别'],['ai','AI 配置'],['backup','备份恢复'],['sync','坚果云同步']].map(([id,label])=><button key={id} type="button" aria-current={page===id?'page':undefined} aria-controls={`settings-${id}`} onClick={()=>setPage(id)}>{label}</button>)}
    </nav>
    <section id="settings-ai" className="settings-page" hidden={page!=='ai'} aria-label="AI 配置">
    <h3>AI 服务</h3>
    <label>接口地址<input disabled={testing} value={config.url} onChange={e=>setConfig({...config,url:e.target.value})}/></label>
    <p className="subtle" style={{overflowWrap:'anywhere'}}>支持基础地址或完整对话接口。{endpoint&&<>实际请求地址：{endpoint}</>}</p>
    <label>模型<input disabled={testing} value={config.model} onChange={e=>setConfig({...config,model:e.target.value})}/></label>
    <label>API Key<input disabled={testing} type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder="留空保留已保存的 Key"/></label>
    <div className="actions"><button className="primary" disabled={testing} onClick={async()=>{try{await setPreference('ai-config',config);if(key)await setSecret('ai',key);setKey('');toast.success(isNative()?'配置已保存，凭据已加密':'配置已保存；预览环境 Key 仅在内存保留');}catch(e){toast.error(e.message);}}}>保存 AI 配置</button><button className="outline" disabled={testing||busy} onClick={testConnection}>{testing?'正在测试…':'测试连接'}</button>{testing&&<button className="outline" onClick={()=>{testGeneration.current++;testRunning.current=false;setTesting(false);setTestResult({ok:false,message:'已停止等待；服务端可能仍在处理。'});}}>停止等待</button>}</div>
    <p className="subtle">测试当前填写的配置；Key 留空时使用已保存的 Key。测试成功后仍需点击保存。</p>
    </section>
    {testResult&&<Dialog open onOpenChange={open=>{if(!open)setTestResult(null);}}><DialogContent className={`app-dialog ai-result-dialog ai-test-result ${testResult.ok?'is-success':'is-error'}`} forceBackdrop>
      <DialogTitle>{testResult.ok?'连接成功':'连接测试未完成'}</DialogTitle>
      <DialogDescription>当前 AI 接口的连接测试结果</DialogDescription>
      {testResult.ok?<><p>请求模型：{testResult.requestedModel}</p><p>接口返回模型：{testResult.returnedModel||'未提供模型名称'}</p><p>耗时：{(testResult.elapsedMs/1000).toFixed(2)} 秒</p><small>模型名称以接口返回为准；本次仅验证文本调用，图片识别需另行验证。</small></>:<p>{testResult.message}</p>}
      <button className="primary" onClick={()=>setTestResult(null)}>知道了</button>
    </DialogContent></Dialog>}
    <section id="settings-recognize" className="settings-page" hidden={page!=='recognize'} aria-label="识别">
    <h3>文字、图片与小票识别</h3>
    <select aria-label="识别类型" disabled={busy||readingImage} value={kind} onChange={async e=>{const nextKind=e.target.value;if(draft && draft!=='[]' && !(await ask('切换类型会清空当前识别草稿。',{title:'切换识别类型？',label:'确认切换',danger:true})))return;setKind(nextKind);setDraft('');}} ><option value="recipes">菜谱</option><option value="stock">小票 / 冰箱食材</option></select>
    <div className="image-source-actions">
      <button className="outline" disabled={busy||readingImage} onClick={()=>albumInput.current.click()}><ImagePlus size={20} aria-hidden="true"/>相册选择</button>
      <button className="outline" disabled={busy||readingImage} onClick={()=>cameraInput.current.click()}><Camera size={20} aria-hidden="true"/>拍摄</button>
      <input ref={albumInput} hidden aria-label="从相册选择图片" disabled={busy||readingImage} type="file" accept="image/*" onChange={selectImage}/>
      <input ref={cameraInput} hidden aria-label="拍摄图片" disabled={busy||readingImage} type="file" accept="image/*" capture="environment" onChange={selectImage}/>
    </div>
    <p className="subtle">可选择菜谱截图或购物小票，单张不超过 10MB。确认发送后，才会交给当前 AI 服务识别。</p>
    {readingImage&&<p role="status">正在读取图片…</p>}
    {image && <div className="recognition-image"><img src={image} alt="待识别图片"/><button className="outline" disabled={busy||readingImage} onClick={async()=>{setImage('');try{await setPreference('ai-draft',{text,image:'',kind,draft});}catch(e){toast.error(e.message);}}}>移除图片</button></div>}
    <label>公开链接（可粘贴小红书分享文字）<input disabled={busy || fetching || readingImage} value={link} onChange={e=>setLink(e.target.value)}/></label>
    <button className="outline" disabled={busy || fetching || readingImage || !link.trim()} onClick={async()=>{if(text && !(await ask('取得正文后会替换当前输入文字。',{title:'替换输入正文？',label:'获取并替换'})))return;setFetching(true);try{const article=await fetchArticle(link);const content=article.title+'\n'+article.text;setText(content);await setPreference('ai-draft',{text:content,image,kind,draft});toast.success('已提取公开正文，请核对后再发送识别');}catch(e){toast.error(e.message);}finally{setFetching(false);}}}>{fetching?'正在获取正文…':'获取公开正文'}</button>
    <p className="subtle">需要登录或无法读取的页面，请粘贴正文或上传截图。获取正文不会自动发送给 AI。</p>
    <textarea disabled={busy||readingImage} aria-label="识别原文" rows={5} value={text} onChange={e=>setText(e.target.value)} onBlur={()=>persist()} placeholder="粘贴菜谱正文，或先通过上方链接获取公开正文"/>
    <div className="actions"><button className="primary" disabled={busy||testing||readingImage} onClick={run}>{busy?'正在识别…':'确认发送并识别'}</button>{busy && <button className="outline" onClick={()=>{generation.current++;setBusy(false);toast('已停止等待，服务端可能仍在处理');}}>取消等待</button>}<button className="outline" disabled={readingImage} onClick={()=>persist().then(()=>toast.success('草稿已保存')).catch(e=>toast.error(e.message))}>保存草稿</button></div>
    {draftItems.length>0&&<button className="outline" disabled={busy} onClick={()=>{setReviewError('');setReviewOpen(true);}}>查看待保存草稿（{draftItems.length} 项）</button>}
    {draftResult.error&&<button className="outline" disabled={busy} onClick={()=>{setReviewError('已有草稿格式异常：'+draftResult.error+'。原文和草稿仍保留，可以重新识别。');setReviewOpen(true);}}>查看异常草稿说明</button>}
    </section>
    {reviewOpen&&<Dialog open onOpenChange={open=>{if(!open&&!savingDraft)setReviewOpen(false);}}><DialogContent className="app-dialog ai-review-dialog" forceBackdrop aria-busy={savingDraft}>
      <DialogTitle>{reviewError?'识别未完成':draftItems.length?(kind==='stock'?'核对并保存食材':'核对并保存菜谱'):'未识别到可保存内容'}</DialogTitle>
      <DialogDescription>{reviewError?'原文和已有草稿保留，请检查后重试。':draftItems.length?'以下内容尚未入库，请核对后确认保存。关闭窗口会保留草稿。':'可以补充菜谱正文、换一张清晰图片，或手动录入。'}</DialogDescription>
      {reviewError?<><p role="alert">{reviewError}</p><button className="primary" onClick={()=>setReviewOpen(false)}>返回检查</button></>:draftItems.length?<DraftEditor items={draftItems} kind={kind} onSavingChange={setSavingDraft} onDefer={()=>setReviewOpen(false)} onChange={async items=>{const value=JSON.stringify(items);setDraft(value);try{await persist(value);if(!items.length)setReviewOpen(false);}catch(e){toast.error(e.message);}}} onSave={saveItems}/>:<button className="primary" onClick={()=>setReviewOpen(false)}>返回补充</button>}
    </DialogContent></Dialog>}
    <section id="settings-backup" className="settings-page" hidden={page!=='backup'} aria-label="备份恢复">
    <h3>备份与恢复</h3><button className="outline" onClick={downloadBackup}>导出完整备份</button><label>导入备份<input type="file" accept=".json,application/json" onChange={e=>restore(e.target.files?.[0])}/></label>
    <button className="outline" onClick={async()=>{try{const previous=await getPreference('before-restore');if(!previous)return toast('没有恢复前备份');if(await ask('当前业务数据将替换为上次导入前保留的备份。',{title:'恢复导入前数据？',label:'确认恢复',danger:true}))await onRestore(validateBackup(previous));}catch(e){toast.error(e.message);}}}>恢复上次导入前数据</button>
    </section>
    <section id="settings-sync" className="settings-page" hidden={page!=='sync'} aria-label="坚果云同步"><div ref={onSyncTarget}/></section>
    {confirmation}
  </div>;
}
