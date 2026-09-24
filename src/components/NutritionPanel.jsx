import { useEffect, useRef, useState } from "react";
import {
  calculateNutrition,
  missingNutrition,
  mergeNutritionAI,
  METRICS,
  NUTRITION_SOURCE,
  plannedItems,
  summarizeNutrition,
  weekNutritionInput,
  nutritionInput,
} from "../nutrition.js";
import { nutritionRequest, defaultAI } from "../services.js";
import { validateReport } from "../nutrition-report.js";
import { getPreference } from "../storage.js";
import { getDeveloperConfig } from "../developer-ai.js";
import { dayAt, MEALS } from "../domain.js";
import useConfirm from "./useConfirm.jsx";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronLeft,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./Dialog.jsx";
import { today } from "../data.js";

async function configuration() {
  return (
    (await getDeveloperConfig()) ||
    (await getPreference("ai-config", defaultAI))
  );
}
export function NutritionSummary({ summary, title = "当日预计营养", detailed = false }) {
  const partial = summary.missing?.length > 0;
  return (
    <section className="nutrition-summary" aria-label={title}>
      <h3>{title}</h3>

      <div className="nutrition-values">
        {METRICS.map(([key, label, unit]) => (
          <div key={key}>
            <small>{label}</small>
            <b>
              {summary.values[key] === null
                ? "—"
                : Math.round(summary.values[key] * 10) / 10}{" "}
              <small>{unit}</small>
            </b>
            {detailed && <small>
              {summary.coverage[key].known}/{summary.coverage[key].total} 项
            </small>}
          </div>
        ))}
      </div>
      <p className="subtle">
        {Object.values(summary.values).every((v) => v === null)
          ? "未估算"
          : partial
            ? "部分估算 · 已知部分合计"
            : "已估算"}{" "}

      </p>
      {detailed && <p className="subtle">
        来源：{summary.sources?.local ? "本地 CoFID 2021 " : ""}
        {summary.sources?.ai ? "AI 补充估算" : ""}
        {!summary.sources?.local && !summary.sources?.ai ? "待补充" : ""}
      </p>}
    </section>
  );
}
export function NutritionReviewButton({ onClick }) {
  return (
    <button
      type="button"
      className="nutrition-review-entry"
      onClick={onClick}
      aria-label="本周菜单营养回顾"
    >
      <span className="review-entry-icon">
        <ChartNoAxesCombined size={24} />
      </span>
      <span>
        <strong>这一周的营养回顾</strong>
        <small>看看每日营养，安排下一周</small>
      </span>
      <ArrowUpRight size={22} />
    </button>
  );
}

function ReviewValues({ summary, title }) {
  const known = Object.values(summary.values).some((value) => value !== null);
  const format = (value) =>
    value === null ? "—" : Math.round(value * 10) / 10;
  return (
    <section className="review-values" aria-label={title}>
      <div className="review-section-heading">
        <h3>{title}</h3>
        <span className="review-status">
          {!summary.recipes
            ? "暂无菜单"
            : !known
              ? "尚未计算"
              : summary.missing.length
                ? "部分估算"
                : "已估算"}
        </span>
      </div>
      <div className="review-energy">
        <span>预计能量</span>
        <p>
          <strong>{format(summary.values.energyKcal)}</strong>
          <span>kcal</span>
        </p>
      </div>
      <div className="review-macros">
        {METRICS.slice(1).map(([key, label, unit]) => (
          <div key={key}>
            <span>{label}</span>
            <strong>
              {format(summary.values[key])}
              <small>{unit}</small>
            </strong>
          </div>
        ))}
      </div>
      {!!summary.recipes && !known && (
        <p className="subtle">还没有营养计算结果，可到高级计算中完善。</p>
      )}
      {known && !!summary.missing.length && (
        <p className="subtle">部分食材尚未计入，数值为已知部分合计。</p>
      )}
    </section>
  );
}

export function RecipeNutrition({ recipe, onChange }) {
  const [ask, confirmation] = useConfirm(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    running = useRef(false),
    latest = useRef(recipe);
  latest.current = recipe;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const snapshot = calculateNutrition(recipe),
    missing = missingNutrition(recipe);
  const summary = summarizeNutrition(
    { "0-早": [{ ...recipe, nutrition: snapshot, servings: 1 }] },
    0,
  );
  async function supplement() {
    if (running.current) return;
    running.current = true;
    const token = ++generation.current;
    const input = nutritionInput(recipe);
    setError("");
    try {
      const config = await configuration();
      if (
        !(await ask(
          `补充这 ${missing.length} 项食材的营养估算？`,
          { title: "发送营养缺失项？", label: "同意估算" },
        ))
      )
        return;
      if (token !== generation.current) return;
      setBusy(true);
      const result = await nutritionRequest(
        config,
        { items: missing },
        "supplement",
      );
      if (token !== generation.current) return;
      if (input !== nutritionInput(latest.current))
        throw new Error("食材已修改，请重新估算；未写入旧结果");
      const nutrition = mergeNutritionAI(recipe, result.items, config.model);
      await onChange({ ...latest.current, nutrition });
    } catch (e) {
      if (token === generation.current) setError(e.message);
    } finally {
      if (token === generation.current) {
        setBusy(false);
        running.current = false;
      }
    }
  }
  return (
    <section className="recipe-nutrition">
      <NutritionSummary summary={summary} title="整菜预计营养" />

      <div className="nutrition-weight-fields">
        {recipe.ingredients.map((item, index) => (
          <label key={index}>
            {item.name || `食材${index + 1}`}可食克重
            <input
              aria-label={`${item.name || `食材${index + 1}`}可食克重`}
              type="number"
              min="0.001"
              step="any"
              disabled={busy}
              placeholder="g/kg 自动换算"
              value={item.grams ?? ""}
              onChange={async (e) => {
                try {
                  await onChange({
                    ...recipe,
                    nutrition: undefined,
                    ingredients: recipe.ingredients.map((v, i) =>
                      i === index
                        ? {
                            ...v,
                            grams:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }
                        : v,
                    ),
                  });
                } catch (error) {
                  setError(error.message);
                }
              }}
            />
          </label>
        ))}
      </div>
      {!!missing.length && (
        <>
          <p className="subtle">
            待补充：
            {missing
              .map(
                (m) =>
                  `${m.ingredient.name}（${m.missing.map((k) => METRICS.find(([key]) => key === k)[1]).join("、")}）`,
              )
              .join("；")}
          </p>
          <button
            type="button"
            className="outline"
            disabled={busy}
            onClick={supplement}
          >
            {busy ? "正在估算…" : "AI 补充缺失项"}
          </button>
        </>
      )}
      {busy && (
        <button
          type="button"
          className="text-link"
          onClick={() => {
            generation.current++;
            running.current = false;
            setBusy(false);
          }}
        >
          取消估算
        </button>
      )}
      <details>
        <summary>计算明细与来源</summary>
        {snapshot.entries.map((entry) => (
          <div key={entry.index}>
            <strong>{entry.name || "未命名食材"}</strong>
            <p className="subtle">
              {entry.grams == null ? "可食克重未知" : `${entry.grams}g 可食部`}{" "}
              ·{" "}
              {entry.foodId
                ? `CoFID ${entry.foodId} / ${entry.sourceVersion}`
                : "未匹配本地数据"}
            </p>
            {entry.basis && <p className="subtle">{entry.basis}</p>}
            <p>
              {METRICS.map(
                ([key, label, unit]) =>
                  `${label}：${entry.values[key] === null ? "未知" : `${Math.round(entry.values[key] * 10) / 10}${unit}（${entry.sources[key] === "ai" ? "AI 估算" : "本地参考"}）`}`,
              ).join("；")}
            </p>
          </div>
        ))}
        <p className="subtle">
          估算时间：{snapshot.generatedAt}
          {snapshot.model && ` · AI 模型 ${snapshot.model}`}
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
      {confirmation}
    </section>
  );
}
export default function NutritionPanel({
  week,
  plan,
  report,
  onSavePlan,
  onSaveReport,
}) {
  const [advanced, setAdvanced] = useState(false);
  const [day, setDay] = useState(() => {
    const index = Array.from({ length: 7 }, (_, d) => dayAt(week, d)).indexOf(
      today(),
    );
    return index < 0 ? 0 : index;
  });
  const [ask, confirmation] = useConfirm(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const token = useRef(0),
    running = useRef(false),
    latest = useRef(plan);
  latest.current = plan;
  useEffect(
    () => () => {
      token.current++;
    },
    [],
  );
  const summary = summarizeNutrition(plan),
    input = weekNutritionInput(plan),
    outdated = report && report.inputFingerprint !== input;
  const plannedDays = Array.from({ length: 7 }, (_, d) =>
    plannedItems(plan, d).length,
  ).filter(Boolean).length;
  const estimateStatus = !summary.recipes
    ? "暂无"
    : Object.values(summary.values).every((value) => value === null)
      ? "尚未计算"
      : summary.missing.length
        ? "部分估算"
        : "已估算";
  const adviceActionLabel = busy
    ? "正在生成建议…"
    : report
      ? "更新下周建议"
      : "生成下周建议";
  async function generate() {
    if (running.current) return;
    running.current = true;
    const current = ++token.current;
    setError("");
    try {
      const config = await configuration();
      if (
        !(await ask(
          `根据 ${week} 至 ${dayAt(week, 6)} 的菜单生成下周建议？`,
          { title: "生成下周建议？", label: "同意生成" },
        ))
      )
        return;
      if (current !== token.current) return;
      setBusy(true);
      const result = await nutritionRequest(
        config,
        { weekStart: week, weekEnd: dayAt(week, 6), summary },
        "report",
      );
      if (current !== token.current) return;
      if (weekNutritionInput(latest.current) !== input)
        throw new Error("菜单已改变，请重新生成；已有报告保留");
      await onSaveReport(
        validateReport({
          weekStart: week,
          summarySnapshot: summary,
          inputFingerprint: input,
          reportText: result.reportText,
          generatedAt: new Date().toISOString(),
          model: config.model,
        }),
      );
    } catch (e) {
      if (current === token.current) setError(e.message);
    } finally {
      if (current === token.current) {
        setBusy(false);
        running.current = false;
      }
    }
  }
  return (
    <div className="nutrition-panel">
      <header className="review-period">
        <span className="sr-only">菜单营养估算</span>
        <strong>
          {week} — {dayAt(week, 6)}
        </strong>

      </header>
      <div className="review-overview" aria-label="本周概览">
        <div><small>已安排</small><strong>{plannedDays} 天</strong></div>
        <div><small>估算状态</small><strong>{estimateStatus}</strong></div>
      </div>
      <section className="review-daily" aria-label="每日营养">
        <div className="review-section-heading">
          <h3>每日营养</h3>

        </div>
        <div className="review-dates" role="group" aria-label="回顾日期">
          {Array.from({ length: 7 }, (_, d) => (
            <button
              type="button"
              key={d}
              aria-label={dayAt(week, d)}
              aria-pressed={day === d}
              onClick={(event) => {
                setDay(d);
                event.currentTarget.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
              }}
            >
              <span>周{"一二三四五六日"[d]}</span>
              <strong>{Number(dayAt(week, d).slice(8))}</strong>
              <span
                className={
                  plannedItems(plan, d).length
                    ? "review-day-dot has-menu"
                    : "review-day-dot"
                }
              />
            </button>
          ))}
        </div>
        <div className="review-day-content" aria-live="polite">
          <ReviewValues
            summary={summarizeNutrition(plan, day)}
            title={`${dayAt(week, day)} 预计营养`}
          />
          <p className="review-day-menu">
            {plannedItems(plan, day)
              .map(({ recipe }) => recipe.name)
              .join(" · ") || "这一天还没有安排菜品"}
          </p>
        </div>
      </section>
      <details className="review-week-total">
        <summary>查看这一周的营养合计</summary>
        <ReviewValues summary={summary} title="本周预计营养" />
      </details>
      <section className={`review-advice ${report ? "" : "empty-advice"}`} aria-label="下周建议">
        <div className="review-section-heading">
          <h3><Sparkles size={18} /> 下周建议</h3>
          <span className="review-status">AI 建议</span>
        </div>
        {report ? (
          <>
            <p className="review-advice-date">
              面向 {dayAt(week, 7)} — {dayAt(week, 13)}
            </p>
            {outdated && (
              <p className="review-outdated" role="status">
                菜单已改变，以下建议待更新
              </p>
            )}
            <div className={outdated ? "review-report is-outdated" : "review-report"}>
              {report.reportText
                .split(/\n\s*\n|\n/)
                .filter((line) => line.trim())
                .map((line, index) => <p key={index}>{line}</p>)}
            </div>
          </>
        ) : (
          <p className="review-advice-empty">
            {summary.recipes
              ? "尚未生成；每日预计营养已可离线查看。"
              : "先安排菜单，再按需生成建议。"}
          </p>
        )}
        <button
          type="button"
          className="review-advice-action"
          aria-label={adviceActionLabel}
          disabled={busy || !summary.recipes}
          onClick={generate}
        >
          <span>{adviceActionLabel}
            <small>发送前仍会确认</small>
          </span>
          <ArrowUpRight size={18} />
        </button>
        {busy && (
          <button
            className="text-link"
            onClick={() => {
              token.current++;
              running.current = false;
              setBusy(false);
            }}
          >
            取消生成
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      <button
        type="button"
        className="review-advanced-entry"
        aria-label="高级计算"
        onClick={() => setAdvanced(true)}
      >
        <SlidersHorizontal size={18} />
        <span>
          <strong>高级计算</strong>
          <small>完善食材、调整克重与计算明细</small>
        </span>
        <ArrowUpRight size={18} />
      </button>
      <Dialog open={advanced} onOpenChange={setAdvanced}>
        <DialogContent layout="page" className="app-dialog nutrition-dialog nutrition-advanced">
          <DialogTitle>高级计算</DialogTitle>
          <DialogDescription className="sr-only">
            调整本周菜单的营养计算，返回即可查看更新结果。
          </DialogDescription>
          <div className="nutrition-panel">
            <details className="advanced-summary"><summary>本周计算详情</summary><NutritionSummary summary={summary} title="本周计算详情" detailed /></details>
            <button
              className="outline"
              disabled={busy || !summary.recipes}
              onClick={async () => {
                try {
                  if (
                    !(await ask(
                      "将按当前菜单快照重新计算本地营养，不改当前菜谱库或采购。已有 AI 补充仅在食材未改变时保留。",
                      { title: "重新估算该周菜单？", label: "重新计算" },
                    ))
                  )
                    return;
                  const next = structuredClone(plan);
                  for (const { slot, index, recipe } of plannedItems(next))
                    next[slot][index] = {
                      ...recipe,
                      nutrition: calculateNutrition(recipe),
                    };
                  await onSavePlan(next, input);
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              重新计算本地营养
            </button>
            <h3>调整菜品</h3>
            {plannedItems(plan).sort((a,b)=>missingNutrition(b.recipe).length-missingNutrition(a.recipe).length).map(({ slot, index, recipe }) => (
              <details key={`${slot}:${index}`}>
                <summary>
                  <strong>{recipe.name}</strong><small>{dayAt(week,Number(slot.split("-")[0])).slice(5)} {MEALS.find(([key])=>key===slot.split("-").slice(1).join("-"))?.[1]} · {recipe.servings || 1}份</small>
                </summary>
                <RecipeNutrition
                  recipe={recipe}
                  onChange={async (value) => {
                    const next = structuredClone(plan);
                    next[slot][index] = {
                      ...value,
                      nutrition: calculateNutrition(value),
                    };
                    await onSavePlan(next, input);
                  }}
                />
              </details>
            ))}
            {!!summary.missing.length && (
              <details>
                <summary>尚未计入的食材（{summary.missing.length} 项）</summary>
                {summary.missing.map((item, index) => (
                  <p key={index}>
                    {item.recipe} · {item.ingredient}：
                    {item.metrics
                      .map((key) => METRICS.find(([k]) => k === key)[1])
                      .join("、")}
                  </p>
                ))}
              </details>
            )}
            <details>
              <summary>参考数据与估算限制</summary>
              <p>
                CoFID 2021，共 {NUTRITION_SOURCE.foods.length}{" "}
                个精确匹配参考条目，品种和烹饪状态可能不同。痕量及缺失均保留未知。
              </p>
              <p>{NUTRITION_SOURCE.licence}</p>
              <a href={NUTRITION_SOURCE.url} target="_blank" rel="noreferrer">
                查看官方来源
              </a>
            </details>
            {report && (
              <p className="subtle">
                建议生成于 {report.generatedAt} · {report.model}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
      {confirmation}
    </div>
  );
}
