import { useEffect, useId, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';

export default function RecipeTimer({ minutes, alwaysOpen = false, label = '做菜计时' }) {
  const panelId = useId();
  const duration = Math.max(1, Math.round(Number(minutes) * 60));
  const [baseDuration, setBaseDuration] = useState(duration);
  const [remaining, setRemaining] = useState(duration);
  const [status, setStatus] = useState('idle');
  const [open, setOpen] = useState(alwaysOpen);
  const [editing, setEditing] = useState(false);
  const [editMinutes, setEditMinutes] = useState(Math.floor(duration / 60));
  const [editSeconds, setEditSeconds] = useState(duration % 60);
  const deadline = useRef(0);

  useEffect(() => {
    if (status !== 'running') return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) setStatus('done');
    };
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [status]);

  const start = () => {
    deadline.current = Date.now() + remaining * 1000;
    setStatus('running');
  };
  const pause = () => {
    const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
    setRemaining(seconds);
    setStatus(seconds === 0 ? 'done' : 'paused');
  };
  const reset = () => {
    setRemaining(baseDuration);
    setStatus('idle');
  };
  const editTime = () => {
    if (status === 'running') pause();
    setEditMinutes(Math.floor(remaining / 60));
    setEditSeconds(remaining % 60);
    setEditing(true);
  };
  const saveTime = (event) => {
    event.preventDefault();
    const next = Number(editMinutes) * 60 + Number(editSeconds);
    if (!Number.isInteger(next) || next <= 0 || Number(editMinutes) < 0 || Number(editSeconds) < 0 || Number(editSeconds) > 59) return;
    setBaseDuration(next);
    setRemaining(next);
    setStatus('idle');
    setEditing(false);
  };
  const display = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  return <section className={`recipe-timer ${open ? 'is-open' : ''}`} aria-label={`${label}器`}>
    {!open ? <button type="button" className="outline recipe-timer-trigger" aria-expanded="false" aria-controls={panelId} onClick={() => setOpen(true)}><Clock3 size={18} />{label === '做菜计时' ? status === 'done' ? '计时结束' : status === 'idle' ? '计时' : display : `${label} · ${status === 'done' ? '已结束' : status === 'idle' ? `${minutes} 分钟` : display}`}</button> : <div id={panelId} className="recipe-timer-panel">
      <div className="recipe-timer-main">
        <div><strong>{label}</strong><small>{label === '做菜计时' ? '按菜谱用时' : '预设'} {minutes} 分钟</small></div>
        <button type="button" className="recipe-timer-time" aria-label={`编辑倒计时，当前 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`} onClick={editTime}><output role="timer">{display}</output></button>
      </div>
      {editing && <form className="recipe-timer-edit" onSubmit={saveTime}>
        <label>分钟<input type="number" min="0" max="999" step="1" required value={editMinutes} onChange={event=>setEditMinutes(event.target.value)} /></label>
        <label>秒<input type="number" min="0" max="59" step="1" required value={editSeconds} onChange={event=>setEditSeconds(event.target.value)} /></label>
        <button type="submit" className="primary" disabled={!Number.isInteger(Number(editMinutes)*60+Number(editSeconds)) || Number(editMinutes)*60+Number(editSeconds)<=0 || Number(editMinutes)<0 || Number(editSeconds)<0 || Number(editSeconds)>59}>确定</button>
        <button type="button" className="outline" onClick={()=>setEditing(false)}>取消</button>
      </form>}
      <div className="recipe-timer-actions">
        <button type="button" className="primary" onClick={status === 'running' ? pause : start} disabled={status === 'done' || editing}>
          {status === 'running' ? '暂停' : status === 'paused' ? '继续' : status === 'done' ? '计时结束' : '开始计时'}
        </button>
        {status !== 'idle' && <button type="button" className="outline" onClick={reset} disabled={editing}>重置</button>}
        {!alwaysOpen && <button type="button" className="outline" aria-expanded="true" aria-controls={panelId} onClick={() => setOpen(false)}>收起</button>}
      </div>
      {status === 'done' && <p role="status">计时结束</p>}
    </div>}
  </section>;
}
