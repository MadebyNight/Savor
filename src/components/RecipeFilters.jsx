import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./Dialog.jsx";

export default function RecipeFilters({ categories, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const count = Number(value.category !== "全部") + Number(value.time !== "all");
  return <>
    <button type="button" className="search-filter" aria-label="筛选菜谱" aria-haspopup="dialog" aria-expanded={open} data-active={count > 0}
      onClick={() => { setDraft(value); setOpen(true); }}>
      <Settings2 size={17} />筛选{count > 0 && <b>{count}</b>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="app-dialog recipe-filter-dialog">
        <DialogTitle>筛选菜谱</DialogTitle>
        <DialogDescription className="sr-only">分类与制作时长同时生效</DialogDescription>
        <fieldset><legend>菜品分类</legend><div className="filter-options">
          {categories.map(category => <button type="button" key={category} aria-pressed={draft.category === category} onClick={() => setDraft({ ...draft, category })}>{category}</button>)}
        </div></fieldset>
        <fieldset><legend>制作时长</legend><div className="filter-options">
          {[["all", "不限"], ["quick", "15 分钟内"], ["medium", "16～30 分钟"], ["long", "30 分钟以上"], ["unknown", "未填写"]].map(([time, label]) =>
            <button type="button" key={time} aria-pressed={draft.time === time} onClick={() => setDraft({ ...draft, time })}>{label}</button>)}
        </div></fieldset>
        <div className="actions"><button className="outline" onClick={() => setDraft({ category: "全部", time: "all" })}>重置</button><button className="primary" onClick={() => { onChange(draft); setOpen(false); }}>确定</button></div>
      </DialogContent>
    </Dialog>
  </>;
}
