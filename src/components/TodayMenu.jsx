import { useState } from 'react';
import { MEALS } from '../domain.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './Dialog.jsx';
import RecipeSnapshotDialog from './RecipeSnapshotDialog.jsx';

export default function TodayMenu({ date, entries = [], onAssign, onRemove, onChangeMeal, onChangeServings, saving = false }) {
  const [pendingOpen, setPendingOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const pending = entries.filter(item => !item.meal);
  const arranged = entries.filter(item => item.meal);
  const editing = entries.find(item => item.id === editingId);
  const label = date ? `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日` : '今天';
  const weekday = date ? `周${'日一二三四五六'[new Date(`${date}T12:00:00`).getDay()]}` : '';

  return <section className="today-menu" aria-label="当日菜单">
    <div className="today-menu-heading">
      <div><span className="subtle">今日安排</span><h2>{label} <small>{weekday}</small></h2><p>已安排 {arranged.length} 道菜</p></div>
      {pending.length > 0
        ? <button type="button" className="outline today-pending-trigger" onClick={() => setPendingOpen(true)}>待分配 {pending.length} 道</button>
        : null}
    </div>
    {MEALS.map(([key, name]) => {
      const dishes = arranged.filter(item => item.meal === key);
      if (!dishes.length) return null;
      return <section className="today-meal" key={key} aria-label={name}>
        <h3>{name}</h3>
        {dishes.map(item => <div className="today-dish" key={item.id}>
          <button type="button" className="today-dish-name" onClick={() => setSnapshot(item.recipe)}>{item.recipe?.name || '菜谱内容已缺失'} <small>×{item.servings || 1}</small></button>
          <button type="button" className="text-link" disabled={saving} aria-label={`调整${item.recipe?.name || '菜品'}`} onClick={() => setEditingId(item.id)}>调整</button>
        </div>)}
      </section>;
    })}
    {!arranged.length && <div className="empty today-menu-empty"><h3>今天还没有排餐</h3><p>{pending.length ? '点开待分配菜品，选择用餐时段。' : '在点单页确认菜品后，就可以在这里安排餐次。'}</p></div>}

    <Dialog open={pendingOpen} onOpenChange={setPendingOpen}>
      <DialogContent className="app-dialog today-pending-dialog">
        <DialogTitle>待分配菜品 · {pending.length} 道</DialogTitle>
        <DialogDescription className="sr-only">选择餐次或移除待分配菜品</DialogDescription>
        {pending.map(item => <div className="today-pending-row" key={item.id}>
          <button type="button" className="today-dish-name" onClick={() => setSnapshot(item.recipe)}>{item.recipe?.name || '菜谱内容已缺失'} <small>×{item.servings || 1}</small></button>
          <div className="today-pending-actions"><select disabled={saving} aria-label={`为${item.recipe?.name || '菜品'}选择餐次`} defaultValue="" onChange={event => { if (event.target.value) { onAssign(item.id, event.target.value); if (pending.length === 1) setPendingOpen(false); } }}>
              <option value="">选择餐次</option>
              {MEALS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
            <button type="button" className="text-link" disabled={saving} onClick={() => { onRemove(item.id); if (pending.length === 1) setPendingOpen(false); }}>移除</button></div>
        </div>)}
      </DialogContent>
    </Dialog>

    <Dialog open={!!editing} onOpenChange={open => !open && setEditingId(null)}>
      <DialogContent className="app-dialog today-edit-dialog">
        <DialogTitle>调整菜品</DialogTitle>
        <DialogDescription className="sr-only">调整餐次与份数，或移除菜品</DialogDescription>
        {editing && <>
          <strong>{editing.recipe?.name || '菜谱内容已缺失'}</strong>
          <label>餐次<select disabled={saving} value={editing.meal} onChange={event => onChangeMeal(editing.id, event.target.value)}>{MEALS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label>份数<input disabled={saving} type="number" min="1" step="1" value={editing.servings || 1} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value > 0) onChangeServings(editing.id, value); }} /></label>
          <button type="button" className="text-link" disabled={saving} onClick={() => { onRemove(editing.id); setEditingId(null); }}>移除菜品</button>
        </>}
      </DialogContent>
    </Dialog>
    <RecipeSnapshotDialog recipe={snapshot} onClose={() => setSnapshot(null)} />
  </section>;
}
