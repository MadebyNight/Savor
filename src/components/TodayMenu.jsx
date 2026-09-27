import { useState } from 'react';
import { MEALS } from '../domain.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './Dialog.jsx';
import RecipeSnapshotDialog from './RecipeSnapshotDialog.jsx';

export default function TodayMenu({ date, entries = [], onAssign, onRemove, onChangeMeal, onChangeServings, saving = false }) {
  const [pendingOpen, setPendingOpen] = useState(false);
  const [choosingId, setChoosingId] = useState(null);
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
        ? <button type="button" className={pendingOpen ? 'primary today-pending-trigger' : 'outline today-pending-trigger'} aria-expanded={pendingOpen} onClick={() => setPendingOpen(open => !open)}>待分配 {pending.length} 道</button>
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
    {!arranged.length && <div className={`empty today-menu-empty ${pending.length ? 'has-pending' : ''}`}><h3>今天还没有排餐</h3><p>{pending.length ? '从下方选择餐次，排期会显示在这里。' : '在点单页确认菜品后，就可以在这里安排餐次。'}</p></div>}

    {pendingOpen && pending.length > 0 && <section className="today-pending-panel" aria-label="待分配菜品">
        <div className="today-pending-heading"><h3>待分配菜品</h3><span>{pending.length} 道待安排</span></div>
        {pending.map(item => <div className="today-pending-row" key={item.id}>
          <button type="button" className="today-dish-name" onClick={() => setSnapshot(item.recipe)}>{item.recipe?.name || '菜谱内容已缺失'} <small>×{item.servings || 1}</small></button>
          <div className="today-pending-actions"><button type="button" className={choosingId===item.id ? 'primary today-choose-meal' : 'outline today-choose-meal'} disabled={saving} aria-expanded={choosingId===item.id} onClick={() => setChoosingId(current => current===item.id ? null : item.id)}>选择餐次</button><button type="button" className="text-link" disabled={saving} onClick={() => onRemove(item.id)}>移除</button></div>
          {choosingId===item.id && <div className="today-meal-options" role="group" aria-label={`为${item.recipe?.name || '菜品'}选择餐次`}>
              {MEALS.map(([key, name]) => <button type="button" key={key} disabled={saving} onClick={() => { onAssign(item.id, key); setChoosingId(null); }}>{name}</button>)}
            </div>}
        </div>)}
    </section>}

    <Dialog open={!!editing} onOpenChange={open => !open && setEditingId(null)}>
      <DialogContent className="app-dialog today-edit-dialog">
        <DialogTitle>调整菜品</DialogTitle>
        <DialogDescription className="sr-only">调整餐次与份数，或移除菜品</DialogDescription>
        {editing && <>
          <strong>{editing.recipe?.name || '菜谱内容已缺失'}</strong>
          <div className="today-edit-meal"><span>餐次</span><div className="today-meal-options" role="group" aria-label={`调整${editing.recipe?.name || '菜品'}餐次`}>{MEALS.map(([key, name]) => <button type="button" key={key} disabled={saving} aria-pressed={editing.meal === key} onClick={() => onChangeMeal(editing.id, key)}>{name}</button>)}</div></div>
          <label>份数<input disabled={saving} type="number" min="1" step="1" value={editing.servings || 1} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value > 0) onChangeServings(editing.id, value); }} /></label>
          <button type="button" className="text-link" disabled={saving} onClick={() => { onRemove(editing.id); setEditingId(null); }}>移除菜品</button>
        </>}
      </DialogContent>
    </Dialog>
    <RecipeSnapshotDialog recipe={snapshot} onClose={() => setSnapshot(null)} />
  </section>;
}
