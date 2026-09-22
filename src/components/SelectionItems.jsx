import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

export default function SelectionItems({ recipes, quantities, onChange }) {
  const [activeId, setActiveId] = useState(null);
  const items = useRef(null);
  const editor = useRef(null);
  const selected = recipes.filter((recipe) => quantities[recipe.id] > 0);
  const active = selected.find((recipe) => recipe.id === activeId);

  useEffect(() => {
    editor.current?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function change(delta) {
    if (delta === -1 && quantities[active.id] === 1) {
      const next = items.current?.querySelector('button[aria-pressed="false"]')
        || items.current?.closest('.app-dialog')?.querySelector('.primary');
      next?.focus();
      setActiveId(null);
    }
    onChange(active.id, delta);
  }

  return (
    <div className="selection-items">
      <p className="selection-summary">已选 {selected.length} 道菜 · 共 {selected.reduce((sum, recipe) => sum + quantities[recipe.id], 0)} 份</p>
      <div className="selection-chips" ref={items}>
        {selected.map((recipe) => (
          <button
            key={recipe.id}
            className="selection-chip"
            aria-label={`${recipe.name}，${quantities[recipe.id]}份`}
            aria-pressed={activeId === recipe.id}
            onClick={() => setActiveId(activeId === recipe.id ? null : recipe.id)}
          >
            <span>{recipe.name}</span>
            {quantities[recipe.id] > 1 && <span className="selection-quantity">×{quantities[recipe.id]}</span>}
          </button>
        ))}
      </div>
      {active && (
        <div className="selection-editor" ref={editor}>
          <div><strong>{active.name}</strong><small>调整份数</small></div>
          <div className="selection-stepper">
            <button aria-label={`减少${active.name}份数`} onClick={() => change(-1)}><Minus size={18} /></button>
            <output aria-label={`${active.name}份数`}>{quantities[active.id]}</output>
            <button aria-label={`增加${active.name}份数`} onClick={() => change(1)}><Plus size={18} /></button>
          </div>
        </div>
      )}
      {!selected.length && <p className="selection-hint">还没有选择菜品。</p>}
    </div>
  );
}
