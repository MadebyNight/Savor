import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog.jsx';
import useConfirm from './useConfirm.jsx';
import {validateStorageRules} from '../food-storage.js';

export default function StorageRules({value,onSave,onClose}) {
  const [draft,setDraft]=useState(()=>structuredClone(value));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [ask,confirmation]=useConfirm();
  const dirty=JSON.stringify(draft)!==JSON.stringify(value);
  async function close(){if(!busy&&(!dirty||await ask('本次修改尚未保存。',{title:'放弃规则修改？',label:'放弃修改'})))onClose();}
  async function save(){
    try{
      const rules={categories:Object.fromEntries(Object.entries(draft.categories).map(([key,n])=>[key,Number(n)])),items:draft.items.map(item=>({name:item.name.trim(),days:Number(item.days)}))};
      validateStorageRules(rules);setBusy(true);setError('');await onSave(rules);onClose();
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  const update=(index,key,next)=>setDraft(current=>({...current,items:current.items.map((item,i)=>i===index?{...item,[key]:next}:item)}));
  return <Dialog open onOpenChange={open=>!open&&close()}><DialogContent layout="page" className="app-dialog storage-rules" footer={<button className="primary" disabled={busy} onClick={save}>{busy?'正在保存…':'保存规则'}</button>}>
    <DialogTitle>保质期规则</DialogTitle>
    <DialogDescription>用于后续新增食材。食材专属规则优先于分类默认值，手动填写和包装期限优先保留；已有库存不变。</DialogDescription>
    <fieldset disabled={busy}>
      <h3>分类默认天数</h3>
      <p className="subtle">默认天数仅供参考，请按实际保存情况调整。</p>
      <div className="storage-category-rules">{Object.entries(draft.categories).map(([key,days])=><label key={key}>{key==='其他'?'其他制品':key}<span><input aria-label={`${key}默认天数`} type="number" min="1" step="1" value={days} onChange={e=>setDraft({...draft,categories:{...draft.categories,[key]:e.target.value}})}/>天</span></label>)}</div>
      <h3>食材专属规则</h3>
      <p className="subtle">按名称完全匹配，例如“鸡蛋”不会匹配“鸡蛋羹”。</p>
      {!draft.items.length&&<p className="subtle">暂无专属规则，新增食材使用分类默认天数。</p>}
      <div className="storage-item-rules">{draft.items.map((item,index)=><div className="storage-rule-row" key={index}>
        <label>食材名称<input aria-label={`规则${index+1}食材名称`} placeholder="例如：鸡蛋" value={item.name} onChange={e=>update(index,'name',e.target.value)}/></label>
        <label>天数<input aria-label={`规则${index+1}天数`} type="number" min="1" step="1" value={item.days} onChange={e=>update(index,'days',e.target.value)}/></label>
        <button type="button" className="text-link" aria-label={`删除规则${index+1}`} onClick={()=>setDraft({...draft,items:draft.items.filter((_,i)=>i!==index)})}>删除</button>
      </div>)}</div>
      <button className="outline" type="button" onClick={()=>setDraft({...draft,items:[...draft.items,{name:'',days:''}]})}>添加食材规则</button>
      {error&&<p role="alert">{error}</p>}
    </fieldset>
    {confirmation}
  </DialogContent></Dialog>;
}
