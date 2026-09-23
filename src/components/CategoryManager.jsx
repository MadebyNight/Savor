import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './Dialog.jsx';
import { AppSelect } from './Pickers.jsx';
import useConfirm from './useConfirm.jsx';

export default function CategoryManager({ names, recipes, onChange, onClose }) {
  const [source,setSource]=useState('');
  const [name,setName]=useState('');
  const [target,setTarget]=useState('未分类');
  const [error,setError]=useState('');
  const [ask,confirmation]=useConfirm();
  function apply(action) {
    try { onChange(action,source,action==='delete'?target:name); setSource('');setName('');setError(''); }
    catch(error) { setError(error.message); }
  }
  async function remove() {
    const count=recipes.filter(r=>r.category?.trim()===source).length;
    if(await ask(`删除「${source}」分类，将 ${count} 道菜谱转入「${target}」。菜谱内容、已确认采购和历史菜单保留。`,{title:'删除分类？',label:'确认删除分类',danger:true})) apply('delete');
  }
  return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent layout="page" className="app-dialog category-manager">
    <DialogTitle>管理分类</DialogTitle>
    <DialogDescription>分类用于点单和菜谱。“全部”为固定入口，“未分类”用于接收暂未分类的菜谱。</DialogDescription>
    <form className="category-form" onSubmit={event=>{event.preventDefault();apply(source?'rename':'add');}}>
      <label>{source?`重命名「${source}」`:'新增分类'}<input aria-label="分类名称" value={name} maxLength={20} onChange={event=>setName(event.target.value)}/></label>
      <div className="actions"><button className="primary" type="submit">{source?'保存名称':'添加分类'}</button>{source&&<button type="button" onClick={()=>{setSource('');setName('');setError('');}}>取消编辑</button>}</div>
      {source&&<><label>菜谱转入<AppSelect aria-label="菜谱转入分类" value={target} onChange={event=>setTarget(event.target.value)} >{names.filter(n=>n!==source).map(n=><option key={n} value={n}>{n}</option>)}</AppSelect></label><button type="button" className="outline" onClick={remove}>删除此分类</button></>}
      {error&&<p role="alert">{error}</p>}
    </form>
    <div className="category-management-list">{names.map(n=><div key={n}><span>{n}<small>{recipes.filter(r=>(r.category?.trim()||'未分类')===n).length} 道菜</small></span>{n!=='未分类'&&<button onClick={()=>{setSource(n);setName(n);setTarget('未分类');setError('');document.querySelector('.category-form')?.scrollIntoView({block:'start'});}} aria-label={`管理${n}`}>管理</button>}</div>)}</div>
    {confirmation}
  </DialogContent></Dialog>;
}
