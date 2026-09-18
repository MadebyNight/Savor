import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Utensils,
  Coffee,
  Sun,
  Moon,
} from "lucide-react";
import { dayAt, monday } from "../domain.js";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./Dialog.jsx";

const meals = [
  ["早", "早餐", Coffee],
  ["中", "午餐", Sun],
  ["晚", "晚餐", Moon],
];
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
}) {
  const [overview, setOverview] = useState(false);
  const [slot, setSlot] = useState(null);
  const days = overview ? weekdays.map((_, index) => index) : [day];
  return (
    <section className="mobile-week">
      <div className="week-picker">
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
      <div className="week-view-tools">
        <span>
          {overview
            ? "本周三餐"
            : `${dayAt(week, day).slice(5)} · 周${weekdays[day]}`}
        </span>
        <button
          className="text-link"
          onClick={() => setOverview((value) => !value)}
        >
          {overview ? "返回单日" : "一周总览"}
        </button>
      </div>
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
          {meals.map(([key, name, Icon]) => {
            const mealKey = `${dayIndex}-${key}`;
            return (
              <article className="mobile-meal" key={key}>
                <h3>
                  <Icon size={18} />
                  {name}
                  <small>{(plan[mealKey] || []).length} 道菜</small>
                </h3>
                {(plan[mealKey] || []).map((item, index) => {
                  const recipe = findRecipe(item);
                  return (
                    <div className="mobile-planned" key={index}>
                      {recipe?.image ? (
                        <img src={recipe.image} alt="" />
                      ) : (
                        <span className="meal-placeholder">
                          <Utensils size={20} />
                        </span>
                      )}
                      <div className="planned-info">
                        <strong>{recipe?.name || "菜谱内容已缺失"}</strong>
                        <label>
                          份数
                          <input
                            aria-label={`${recipe?.name || "缺失菜谱"}餐次份数`}
                            type="number"
                            min="1"
                            step="1"
                            value={item.servings || 1}
                            onChange={(event) => {
                              const servings = Math.max(
                                1,
                                Math.floor(Number(event.target.value) || 1),
                              );
                              setPlan((current) => ({
                                ...current,
                                [mealKey]: current[mealKey].map((entry, i) =>
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
                        aria-label={`移除${recipe?.name || "缺失菜谱"}`}
                        onClick={() =>
                          setPlan((current) => ({
                            ...current,
                            [mealKey]: current[mealKey].filter(
                              (_, i) => i !== index,
                            ),
                          }))
                        }
                      >
                        <X size={18} />
                      </button>
                    </div>
                  );
                })}
                <button
                  className="mobile-add-meal"
                  aria-label={`安排周${dayIndex + 1}${key}餐`}
                  onClick={() => setSlot(mealKey)}
                >
                  <Plus size={18} />
                  添加菜品
                </button>
              </article>
            );
          })}
        </section>
      ))}
      <Dialog
        open={slot !== null}
        onOpenChange={(open) => !open && setSlot(null)}
      >
        <DialogContent className="app-dialog meal-picker-dialog">
          <DialogTitle>选择要安排的菜品</DialogTitle>
          <DialogDescription>
            来自已确认选菜。安排不会增加采购量，同道菜再次添加会增加餐次份数。
          </DialogDescription>
          {recipes.map((recipe) => (
            <button
              className="meal-picker-row"
              key={recipe.id}
              onClick={() => {
                addToMeal(slot, recipe.id);
                setSlot(null);
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
