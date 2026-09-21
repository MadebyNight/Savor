import {NutritionSummary} from './NutritionPanel.jsx';
import {summarizeNutrition} from '../nutrition.js';
import { useState } from "react";
import useBackHandler from "../useBackHandler.js";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import { dayAt, monday, MEALS } from "../domain.js";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./Dialog.jsx";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

export default function MobileWeek({
  week,
  setWeek,
  day,
  setDay,
  plan,
  setPlan,
  recipes,
  findRecipe,
  addToMeal,
  onSelectRecipes,
  onReview,
  onHistory,
  slot,
  setSlot,
}) {
  const [overview, setOverview] = useState(false);
  useBackHandler(overview, () => setOverview(false));
  const days = overview ? weekdays.map((_, index) => index) : [day];
  const dishCount = days.reduce((count, dayIndex) => count + MEALS.reduce((sum, [key]) => sum + (plan[`${dayIndex}-${key}`]?.length || 0), 0), 0);
  return (
    <section className="mobile-week">
      <div className="week-heading">
      <details className="week-picker">
        <summary>{Number(week.slice(5,7))} 月 {Number(week.slice(8))} 日 — {Number(dayAt(week,6).slice(5,7))} 月 {Number(dayAt(week,6).slice(8))} 日</summary>
        <div className="week-picker-controls">
        <button
          className="mobile-icon"
          aria-label="上一周"
          onClick={() => setWeek(dayAt(week, -7))}
        >
          <ChevronLeft />
        </button>
        <label>
          当前周
          <input
            aria-label="当前周"
            type="date"
            value={week}
            onChange={(event) =>
              event.target.value && setWeek(monday(event.target.value))
            }
          />
        </label>
        <button
          className="mobile-icon"
          aria-label="下一周"
          onClick={() => setWeek(dayAt(week, 7))}
        >
          <ChevronRight />
        </button>
        </div>
      </details>
      <button className="text-link" onClick={() => setOverview(value => !value)}>{overview ? "返回单日" : "一周总览"}</button>
      </div>
      <div className="week-dates" aria-label="选择日期">
        {weekdays.map((name, index) => (
          <button
            key={name}
            aria-label={`${dayAt(week, index)} 周${name}`}
            aria-pressed={!overview && day === index}
            onClick={() => {
              setDay(index);
              setOverview(false);
            }}
          >
            <span>周{name}</span>
            <b>{Number(dayAt(week, index).slice(-2))}</b>
          </button>
        ))}
      </div>
      <div className="week-summary"><strong className="week-slogan">一饭一饮 三餐四季</strong><span>{dishCount} 道菜</span></div>
      {days.map((dayIndex) => (
        <section
          key={dayIndex}
          className="day-meals"
          aria-label={`${dayAt(week, dayIndex)}菜单`}
        >
          {overview && (
            <h2>
              {dayAt(week, dayIndex).slice(5)} · 周{weekdays[dayIndex]}
            </h2>
          )}
          <div className="meal-table">
            {MEALS.map(([key, name]) => {
              const mealKey = `${dayIndex}-${key}`;
              return (
                <button
                  className="meal-table-row"
                  key={key}
                  aria-label={`安排周${dayIndex + 1}${key}餐`}
                  onClick={() => setSlot(mealKey)}
                >
                  <strong>{name}</strong>
                  <span className="meal-table-dishes">
                    {(plan[mealKey] || []).map((item, index) => (
                      <span key={index}>
                        {findRecipe(item)?.name || "菜谱内容已缺失"}
                        <small> ×{item.servings || 1}</small>
                      </span>
                    ))}
                    {!plan[mealKey]?.length && (
                      <span className="subtle">＋ 添加菜品</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {!overview && <NutritionSummary summary={summarizeNutrition(plan,day)}/>}
      <div className="week-view-tools"><button className="text-link" onClick={onHistory}>历史</button><button className="text-link" onClick={onReview}>本周菜单营养回顾</button></div>
      <Dialog
        open={slot !== null}
        onOpenChange={(open) => !open && setSlot(null)}
      >
        <DialogContent className="app-dialog meal-picker-dialog">
          <DialogTitle>
            {MEALS.find(([key]) => slot?.endsWith("-" + key))?.[1]} · 管理菜品
          </DialogTitle>
          <DialogDescription>
            来自已确认选菜。安排不会增加采购量，同道菜再次添加会增加餐次份数。
          </DialogDescription>
          <label>餐次<select aria-label="安排餐次" value={slot?.split('-').slice(1).join('-') || '早'} onChange={event=>setSlot(`${slot.split('-')[0]}-${event.target.value}`)}>{MEALS.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
          {(plan[slot] || []).map((item, index) => (
            <div className="mobile-planned" key={index}>
              <div className="planned-info">
                <strong>{findRecipe(item)?.name || "菜谱内容已缺失"}</strong>
                <label>
                  份数
                  <input
                    type="number"
                    min="1"
                    step="1"
                    aria-label={`${findRecipe(item)?.name}餐次份数`}
                    value={item.servings || 1}
                    onChange={(event) => {
                      const servings = Math.max(
                        1,
                        Math.floor(Number(event.target.value) || 1),
                      );
                      setPlan((current) => ({
                        ...current,
                        [slot]: current[slot].map((entry, i) =>
                          i === index
                            ? { ...findRecipe(entry), servings }
                            : entry,
                        ),
                      }));
                    }}
                  />
                </label>
              </div>
              <button
                className="mobile-icon"
                aria-label={`移除${findRecipe(item)?.name}`}
                onClick={() =>
                  setPlan((current) => ({
                    ...current,
                    [slot]: current[slot].filter((_, i) => i !== index),
                  }))
                }
              >
                <X size={18} />
              </button>
            </div>
          ))}
          <h3>添加已确认菜品</h3>
          {recipes.map((recipe) => (
            <button
              className="meal-picker-row"
              key={recipe.id}
              onClick={() => {
                addToMeal(slot, recipe.id);
              }}
            >
              <span>{recipe.name}</span>
              <Plus size={18} />
            </button>
          ))}
          {!recipes.length && (
            <>
              <p>还没有已确认菜品，先到点单页选菜并确认。</p>
              <button
                className="primary"
                onClick={() => {
                  setSlot(null);
                  onSelectRecipes();
                }}
              >
                去点单选菜
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
