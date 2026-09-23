import StockFields from "./StockFields.jsx";
import { stockStatus } from "../domain.js";
import { useState } from "react";
import { toast } from "sonner";
import {validateRecipe,validateStock} from '../validation.js';

export default function DraftEditor({ items = [], kind, onChange, onSave, onDefer, onSavingChange }) {
  const [excluded, setExcluded] = useState([]);
  const [saving, setSaving] = useState(false);
  const update = (index, patch) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const stock = kind === "stock";
  async function save() {
    const selected = items.filter((_, index) => !excluded.includes(index));
    if (!selected.length) return toast.error("请至少勾选一个条目");
    try {
      selected.forEach(item => stock ? validateStock(item,'食材草稿',true) : validateRecipe(item,'菜谱草稿',true));
    } catch(error) {return toast.error(error.message);}
    for (const item of selected) {
      if (!item.name?.trim()) return toast.error("请补充每个选中条目的名称");
      if (
        stock &&
        (!(Number(item.qty) > 0) ||
          !Number.isFinite(Number(item.qty)) ||
          !item.unit?.trim())
      )
        return toast.error(item.name + "：请补充正数数量和单位");
      if (
        stock &&
        (Number(item.days || 0) < 0 ||
          !Number.isInteger(Number(item.days || 0)))
      )
        return toast.error(item.name + "：保存天数应为非负整数");
      if (!stock) {
        if (!item.ingredients?.length || !item.steps?.length)
          return toast.error(item.name + "：至少需要一种食材和一个步骤");
        if (
          item.ingredients.some(
            (i) =>
              !i.name?.trim() ||
              (i.qty != null &&
                i.qty !== "" &&
                (!(Number(i.qty) > 0) ||
                  !Number.isFinite(Number(i.qty)) ||
                  !i.unit?.trim())),
          )
        )
          return toast.error(
            item.name + "：请补齐食材名称，明确数量时需有正数数量和单位",
          );
        if (item.steps.some((step) => typeof step !== "string" || !step.trim()))
          return toast.error(item.name + "：请补齐制作步骤");
      }
    }
    setSaving(true);
    onSavingChange?.(true);
    try {
      const normalized = selected.map((item) => ({
        ...item,
        name: item.name.trim(),
        ...(stock
          ? {
              qty: Number(item.qty),
              unit: item.unit.trim(),
              days: Number(item.days || 0),
            }
          : {
              ingredients: item.ingredients.map((i) => ({
                ...i,
                name: i.name.trim(),
                qty: i.qty == null || i.qty === "" ? null : Number(i.qty),
                unit: (i.unit || "").trim(),
              })),
              steps: item.steps.map((step) => step.trim()),
            }),
      }));
      await onSave(normalized);
      await onChange(items.filter((_, index) => excluded.includes(index)));
      setExcluded([]);
      toast.success("已保存选中条目，未选条目继续保留为草稿");
    } catch (error) {
      toast.error(error.message || "保存失败，草稿已保留");
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  }
  if (!items.length)
    return <p className="subtle">识别完成后，菜谱或食材草稿将在这里显示。</p>;
  return (
    <section aria-label="识别草稿编辑">

      {items.map((item, index) => (
        <article className={stock ? "stock-review-row" : "recipe-review-row"} key={index}>
          <label className="stock-review-check">
            <input
              type="checkbox"
              checked={!excluded.includes(index)}
              onChange={(event) =>
                setExcluded((current) =>
                  event.target.checked
                    ? current.filter((i) => i !== index)
                    : [...current, index],
                )
              }
            />
            <span className="sr-only">保存第 {index + 1} 项</span>
          </label>
          {stock?<details className="stock-review-details"><summary className={`stock-compact-row ${stockStatus(item).kind}`}><strong>{item.name||"未命名食材"}</strong><span>{item.category||'其他'}</span><span>{item.qty??"待补充"} {item.unit}</span><span className="stock-status">{stockStatus(item).label}</span></summary><StockFields value={item} onChange={value=>update(index,value)}/></details>:<details className="recipe-review-details" name="recipe-draft"><summary><strong>{item.name || "未命名菜谱"}</strong><small>{item.category || "未分类"} · {item.ingredients?.length || 0} 种食材{(!item.name?.trim() || !item.ingredients?.length || !item.steps?.length) ? " · 待补充" : ""}</small></summary><div className="editor">
          <label>
            名称
            <input
              aria-label={"草稿名称" + (index + 1)}
              value={item.name || ""}
              onChange={(event) => update(index, { name: event.target.value })}
            />
          </label>
          <label>
            分类
            <input
              value={item.category || (stock ? "其他" : "素菜")}
              onChange={(event) =>
                update(index, { category: event.target.value })
              }
            />
          </label>
            <>
              <div className="form-row">
                <label>
                  用时（分钟，可空）
                  <input
                    type="number"
                    min="0"
                    value={item.time ?? ""}
                    onChange={(event) =>
                      update(index, {
                        time:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  成品重量（克，可空）
                  <input
                    type="number"
                    min="0"
                    value={item.weight ?? ""}
                    onChange={(event) =>
                      update(index, {
                        weight:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <h3>食材</h3>

              {(item.ingredients || []).map((value, ingredientIndex) => (
                <div className="ingredient-row" key={ingredientIndex}>
                  <input
                    aria-label="草稿食材名称"
                    placeholder="食材名称"
                    value={value.name || ""}
                    onChange={(event) =>
                      update(index, {
                        ingredients: item.ingredients.map((v, i) =>
                          i === ingredientIndex
                            ? { ...v, name: event.target.value }
                            : v,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label="草稿食材数量"
                    placeholder="适量 / 未知"
                    type="number"
                    min="0"
                    step="any"
                    value={value.qty ?? ""}
                    onChange={(event) =>
                      update(index, {
                        ingredients: item.ingredients.map((v, i) =>
                          i === ingredientIndex
                            ? {
                                ...v,
                                qty:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              }
                            : v,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label="草稿食材单位"
                    placeholder="单位"
                    value={value.unit || ""}
                    onChange={(event) =>
                      update(index, {
                        ingredients: item.ingredients.map((v, i) =>
                          i === ingredientIndex
                            ? { ...v, unit: event.target.value }
                            : v,
                        ),
                      })
                    }
                  />
                  <button
                    className="outline"
                    onClick={() =>
                      update(index, {
                        ingredients: item.ingredients.filter(
                          (_, i) => i !== ingredientIndex,
                        ),
                      })
                    }
                  >
                    移除
                  </button>
                </div>
              ))}
              <button
                className="outline"
                onClick={() =>
                  update(index, {
                    ingredients: [
                      ...(item.ingredients || []),
                      { name: "", qty: null, unit: "g" },
                    ],
                  })
                }
              >
                添加食材
              </button>
              <h3>制作步骤</h3>
              {(item.steps || []).map((step, stepIndex) => (
                <div className="step-row" key={stepIndex}>
                  <span>{stepIndex + 1}</span>
                  <textarea
                    aria-label={"草稿步骤" + (stepIndex + 1)}
                    value={step}
                    onChange={(event) =>
                      update(index, {
                        steps: item.steps.map((v, i) =>
                          i === stepIndex ? event.target.value : v,
                        ),
                      })
                    }
                  />
                  <button
                    className="outline"
                    onClick={() =>
                      update(index, {
                        steps: item.steps.filter((_, i) => i !== stepIndex),
                      })
                    }
                  >
                    移除
                  </button>
                </div>
              ))}
              <button
                className="outline"
                onClick={() =>
                  update(index, { steps: [...(item.steps || []), ""] })
                }
              >
                添加步骤
              </button>
            </>
          </div></details>}
        </article>
      ))}
      <div className="draft-actions"><span className="draft-count">已选 {items.length-excluded.length} 项</span><button className="primary" disabled={saving} onClick={save}>
        {saving ? "正在保存" : "确认保存选中条目"}
      </button>
      {onDefer&&<button className="outline" disabled={saving} onClick={onDefer}>稍后处理</button>}</div>
    </section>
  );
}
