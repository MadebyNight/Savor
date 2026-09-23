import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './Dialog.jsx';
import useConfirm from './useConfirm.jsx';

export default function CategoryManager({ names, recipes, onChange, onClose }) {
  const [newName,setNewName]=useState('');
  const [source,setSource]=useState('');
  const [name,setName]=useState('');
  const [addError,setAddError]=useState('');
  const [editError,setEditError]=useState('');
  const [ask,confirmation]=useConfirm();
  function apply(action) {
    try {
      onChange(action,action==='add'?'':source,action==='delete'?'未分类':action==='add'?newName:name);
      if(action==='add'){setNewName('');setAddError('');}
      else {setSource('');setName('');setEditError('');}
    } catch(error) {(action==='add'?setAddError:setEditError)(error.message);}
  }
  async function remove() {
    const count=recipes.filter(r=>r.category?.trim()===source).length;
    if(await ask(`删除「${source}」分类后，${count} 道菜谱将归入「未分类」。菜谱内容、已确认采购和历史菜单保留。`,{title:'删除分类？',label:'确认删除分类',danger:true}))apply('delete');
  }
  return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent layout="page" className="app-dialog category-manager">
    <DialogTitle>管理分类</DialogTitle>
    <DialogDescription className="sr-only">添加分类或在对应分类行内修改名称。</DialogDescription>
    <form className="category-form" onSubmit={event=>{event.preventDefault();apply('add');}}>
      <div className="category-add-field"><input aria-label="新增分类名称" placeholder="输入新分类名称" value={newName} maxLength={20} onChange={event=>{setNewName(event.target.value);setAddError('');}}/><button className="primary" type="submit" aria-label="添加分类" disabled={!newName.trim()}>添加</button></div>
      {addError&&<p role="alert">{addError}</p>}
    </form>
    <div className="category-management-list">{names.map(n=><div key={n} className="category-management-row">
      {source===n?<form className="category-inline-editor" onSubmit={event=>{event.preventDefault();apply('rename');}}>
        <input aria-label={`修改${n}分类名称`} autoFocus value={name} maxLength={20} onChange={event=>{setName(event.target.value);setEditError('');}}/>
        <div className="category-edit-actions"><button className="primary" type="submit">保存名称</button><button type="button" onClick={()=>{setSource('');setName('');setEditError('');}}>取消编辑</button><button type="button" className="text-link" onClick={remove}>删除此分类</button></div>
        {editError&&<p role="alert">{editError}</p>}
      </form>:<><span>{n}<small>{recipes.filter(r=>(r.category?.trim()||'未分类')===n).length} 道菜</small></span>{n!=='未分类'&&<button onClick={()=>{setSource(n);setName(n);setEditError('');}} aria-label={`管理${n}`}>管理</button>}</>}
    </div>)}</div>
    {confirmation}
  </DialogContent></Dialog>;
}
