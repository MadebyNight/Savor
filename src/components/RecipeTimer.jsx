import { useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';

export default function RecipeTimer({ minutes }) {
  const duration = Math.max(1, Math.round(Number(minutes) * 60));
  const [remaining, setRemaining] = useState(duration);
  const [status, setStatus] = useState('idle');
  const [open, setOpen] = useState(false);
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
    setRemaining(duration);
    setStatus('idle');
  };
  const display = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  return <section className={`recipe-timer ${open ? 'is-open' : ''}`} aria-label="做菜计时器">
    {!open ? <button type="button" className="outline recipe-timer-trigger" aria-expanded="false" aria-controls="recipe-timer-panel" onClick={() => setOpen(true)}><Clock3 size={18} />{status === 'done' ? '计时结束' : status === 'idle' ? '计时' : display}</button> : <div id="recipe-timer-panel" className="recipe-timer-panel">
      <div className="recipe-timer-main">
        <div><strong>做菜计时</strong><small>按菜谱用时 {minutes} 分钟</small></div>
        <output role="timer" aria-label={`剩余 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒`}>{display}</output>
      </div>
      <div className="recipe-timer-actions">
        <button type="button" className="primary" onClick={status === 'running' ? pause : start} disabled={status === 'done'}>
          {status === 'running' ? '暂停' : status === 'paused' ? '继续' : status === 'done' ? '计时结束' : '开始计时'}
        </button>
        {status !== 'idle' && <button type="button" className="outline" onClick={reset}>重置</button>}
        <button type="button" className="outline" aria-expanded="true" aria-controls="recipe-timer-panel" onClick={() => setOpen(false)}>收起</button>
      </div>
      {status === 'done' && <p role="status">计时结束</p>}
    </div>}
  </section>;
}
