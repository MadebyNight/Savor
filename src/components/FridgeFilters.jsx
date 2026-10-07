import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./Dialog.jsx";

const statuses = [["all", "不限"], ["expired", "过期"], ["soon", "临期"], ["unknown", "待补充"], ["normal", "正常"]];

export default function FridgeFilters({ categories, category, status, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ category, status });
  const count = Number(category !== "全部") + Number(status !== "all");
  return <>
    <button type="button" className="search-filter" aria-label="筛选冰箱食材" aria-haspopup="dialog" aria-expanded={open} data-active={count > 0}
      onClick={() => { setDraft({ category, status }); setOpen(true); }}>
      <Settings2 size={17} />筛选{count > 0 && <b>{count}</b>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="app-dialog recipe-filter-dialog">
        <DialogTitle>筛选冰箱食材</DialogTitle>
        <DialogDescription className="sr-only">分类与期限同时生效</DialogDescription>
        <fieldset><legend>食材分类</legend><div className="filter-options">
          {categories.map(value => <button type="button" key={value} aria-pressed={draft.category === value} onClick={() => setDraft({ ...draft, category: value })}>{value}</button>)}
        </div></fieldset>
        <fieldset><legend>保存期限</legend><div className="filter-options">
          {statuses.map(([value, label]) => <button type="button" key={value} aria-pressed={draft.status === value} onClick={() => setDraft({ ...draft, status: value })}>{label}</button>)}
        </div></fieldset>
        <div className="actions"><button className="outline" onClick={() => setDraft({ category: "全部", status: "all" })}>重置</button><button className="primary" onClick={() => { onChange(draft); setOpen(false); }}>确定</button></div>
      </DialogContent>
    </Dialog>
  </>;
}
