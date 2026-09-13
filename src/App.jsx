// 从原站公开页面恢复的交互界面，保留原有文案、状态流转及计算规则。
import {
  ingredient,
  initialRecipes,
  initialFridge,
  recipeCategories,
  stockCategories,
  calorieClass,
  calorieLabel,
  today,
} from "./data.js";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Camera,
  Check,
  ChefHat,
  Clock,
  Download,
  GripVertical,
  Heart,
  Leaf,
  Link,
  Minus,
  Plus,
  Refrigerator,
  Search,
  ShoppingBasket,
  Sun,
  Trash2,
  Upload,
  Utensils,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
} from "./components/Sidebar.jsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/Dialog.jsx";
const navigationItems = [
  ["点单选菜", Utensils],
  ["上传菜谱", Upload],
  ["菜篮子", ShoppingBasket],
  ["周菜单", CalendarDays],
  ["我的冰箱", Refrigerator],
];
function App() {
  const [page, setPage] = useState(0);
  const [recipes, setRecipes] = useState(initialRecipes);
  const [fridge, setFridge] = useState(initialFridge);
  // 修改点单只更新 quantities；确认后才更新采购缺口与周菜单素材。
  const [quantities, setQuantities] = useState({});
  const [confirmedQuantities, setConfirmedQuantities] = useState({});
  const [plan, setPlan] = useState({});
  const [archives, setArchives] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState("");
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [dailyTarget, setDailyTarget] = useState(2000);
  const [archiveDate, setArchiveDate] = useState("");
  const [recipeDraft, setRecipeDraft] = useState({
    id: 0,
    name: "",
    category: "素菜",
    kcal: 0,
    time: 15,
    weight: 300,
    ingredients: [ingredient("", 100)],
    steps: [""],
  });
  const [ingredientDraft, setIngredientDraft] = useState({
    ...ingredient("", 100),
    days: 7,
  });
  const [draggedStep, setDraggedStep] = useState(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("shiguang-v1");
      if (saved) {
        const state = JSON.parse(saved);
        setRecipes(state.recipes);
        setFridge(state.fridge);
        setQuantities(state.qty);
        setConfirmedQuantities(state.confirmed);
        setPlan(state.plan);
        setArchives(state.archives);
      }
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated)
      try {
        localStorage.setItem(
          "shiguang-v1",
          JSON.stringify({
            recipes,
            fridge,
            qty: quantities,
            confirmed: confirmedQuantities,
            plan,
            archives,
          }),
        );
      } catch {
        toast.error("浏览器存储已满，修改暂未保存");
      }
  }, [
    recipes,
    fridge,
    quantities,
    confirmedQuantities,
    plan,
    archives,
    hydrated,
  ]);
  const navigate = (nextPage) => {
    setPage(nextPage);
    setCategory("全部");
    setSearch("");
    setSelectedIngredients([]);
  };
  const findRecipe = (recipeId) =>
    recipes.find((recipe) => recipe.id === recipeId);
  const selectedCount = Object.values(quantities).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  // 同名、同单位食材合并；先汇总全部需求，再减去冰箱中已有数量。
  const shoppingList = (() => {
    const requirements = {};
    recipes.forEach((recipe) =>
      recipe.ingredients.forEach((item) => {
        if (confirmedQuantities[recipe.id]) {
          const ingredientKey = item.name + "|" + item.unit;
          requirements[ingredientKey] = {
            ...item,
            qty:
              (requirements[ingredientKey]?.qty || 0) +
              item.qty * confirmedQuantities[recipe.id],
          };
        }
      }),
    );
    return Object.values(requirements)
      .map((item) => ({
        ...item,
        qty: Math.max(
          0,
          item.qty -
            fridge
              .filter(
                (stock) => stock.name === item.name && stock.unit === item.unit,
              )
              .reduce((total, stock) => total + stock.qty, 0),
        ),
      }))
      .filter((item) => item.qty > 0);
  })();
  const changeQuantity = (recipeId, delta) =>
    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [recipeId]: Math.max(0, (currentQuantities[recipeId] || 0) + delta),
    }));
  const confirmSelection = () => {
    setConfirmedQuantities({
      ...quantities,
    });
    setModal("");
    toast.success("已同步周菜单素材与缺失食材清单");
  };
  const addToMeal = (slot, recipeId) => {
    if (recipeId) {
      setPlan((currentPlan) => ({
        ...currentPlan,
        [slot]: [...(currentPlan[slot] || []), recipeId],
      }));
      toast.success("已安排这道菜");
    }
  };
  const calculateCalories = (recipeIds) =>
    Math.round(
      recipeIds.reduce((total, recipeId) => {
        const recipe = findRecipe(recipeId);
        return total + (recipe ? (recipe.kcal * recipe.weight) / 100 : 0);
      }, 0),
    );
  const filteredRecipes = recipes.filter(
    (recipe) =>
      (category === "全部" || recipe.category === category) &&
      recipe.name.includes(search) &&
      (!selectedIngredients.length ||
        selectedIngredients.every((ingredientName) =>
          recipe.ingredients.some((item) => item.name === ingredientName),
        )),
  );
  const saveRecipe = () => {
    if (
      !recipeDraft.name.trim() ||
      recipeDraft.ingredients.some(
        (item) => !item.name.trim() || item.qty <= 0,
      ) ||
      recipeDraft.steps.some((step) => !step.trim())
    ) {
      toast.error("请填写菜名、有效食材数量和制作步骤");
      return;
    }
    setRecipes((currentRecipes) => [
      ...currentRecipes,
      {
        ...recipeDraft,
        id: Date.now(),
      },
    ]);
    toast.success("菜谱已保存到点单选菜");
    navigate(0);
  };
  const saveIngredient = () => {
    if (!ingredientDraft.name.trim() || ingredientDraft.qty <= 0) {
      toast.error("请填写食材名称和有效数量");
      return;
    }
    setFridge((currentFridge) => [
      ...currentFridge,
      {
        ...ingredientDraft,
        date: today(),
      },
    ]);
    setModal("");
    setIngredientDraft({
      ...ingredient("", 100),
      days: 7,
    });
    toast.success("食材已放入冰箱");
  };
  const exportShoppingList = async (format) => {
    const t = shoppingList.map(
      (item) => `${item.name}    ${item.qty} ${item.unit}`,
    );
    let n;
    if (format === "image") {
      const e = document.createElement("canvas");
      e.width = 800;
      e.height = 200 + t.length * 60;
      const r = e.getContext("2d");
      r.fillStyle = "#fffdf5";
      r.fillRect(0, 0, e.width, e.height);
      r.fillStyle = "#262820";
      r.font = "bold 36px sans-serif";
      r.fillText("食光 · 食材采购清单", 50, 70);
      r.font = "24px sans-serif";
      t.forEach((e, t) => r.fillText(e, 50, 145 + t * 60));
      n = await new Promise((t) => e.toBlob((e) => t(e), "image/png"));
    } else {
      const e = (e) =>
        e.replace(
          /[&<>]/g,
          (e) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
            })[e],
        );
      n = new Blob(
        [
          '﻿<html><meta charset="utf-8"><body><h1>食光 · 食材采购清单</h1>' +
            t.map((t) => "<p>" + e(t) + "</p>").join("") +
            "</body></html>",
        ],
        {
          type: "application/msword",
        },
      );
    }
    const r = URL.createObjectURL(n);
    const i = document.createElement("a");
    i.href = r;
    i.download = "食材采购清单." + (format === "image" ? "png" : "doc");
    i.click();
    setTimeout(() => URL.revokeObjectURL(r), 1000);
  };
  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "224px",
      }}
    >
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <div className="brand">
            <span>
              <Utensils size={25} />
            </span>
            <div>
              食光<small>好好吃饭，好好生活</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">我的饮食空间</div>
          <SidebarMenu>
            {navigationItems.map(([label, Icon], index) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  isActive={page === index}
                  onClick={() => navigate(index)}
                  className="nav-button"
                >
                  <Icon />
                  <span>{label}</span>
                  {index === 2 && shoppingList.length > 0 && (
                    <b className="nav-count">{shoppingList.length}</b>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <Leaf size={27} />
            <h3>食材不浪费</h3>
            <p>
              从冰箱里已有的食材，
              <br />
              开始今天的一餐。
            </p>
            <button onClick={() => navigate(4)}>
              {"看看我的冰箱 "}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <div className="profile">
            <span>食</span>
            <div>
              我的小厨房<small>数据保存在当前浏览器</small>
            </div>
            <Heart size={17} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="main">
        <header className="topbar">
          <div className="mobile-menu">
            <SidebarTrigger />
          </div>
          <span>
            {"我的小厨房 "}
            <i>/</i> <b>{navigationItems[page][0]}</b>
          </span>
          <span className="today">
            <Sun size={17} />
            {" 今天也要好好吃饭"}
          </span>
        </header>
        <div className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">EVERYDAY, A LITTLE DELICIOUS</div>
              <h1>
                {
                  [
                    "今天，想吃点什么？",
                    "把拿手菜，留在这里",
                    "买得刚好，吃得新鲜",
                    "把一周的美味安排好",
                    "打开冰箱，发现好食光",
                  ][page]
                }
              </h1>
              <p>
                {
                  [
                    "挑几道喜欢的菜，让一周三餐轻松一点。",
                    "记录食材与步骤，让每一道好菜都能再次上桌。",
                    "根据已确认菜品与冰箱库存，自动整理食材缺口。",
                    "拖动菜品到对应餐次，也可以先选菜，再点击空格。",
                    "记录每一份新鲜，让家里的食材物尽其用。",
                  ][page]
                }
              </p>
            </div>
            <button
              className="outline"
              onClick={() =>
                page === 4
                  ? setModal("stock")
                  : page === 3
                    ? setModal("history")
                    : navigate(page === 1 ? 0 : 1)
              }
            >
              {page === 4 ? (
                <Plus size={18} />
              ) : page === 3 ? (
                <CalendarDays size={18} />
              ) : (
                <Upload size={18} />
              )}{" "}
              {page === 4
                ? "添加食材"
                : page === 3
                  ? "膳食日历"
                  : page === 1
                    ? "返回菜品库"
                    : "上传我的菜谱"}
            </button>
          </div>
          {page === 0 && (
            <>
              <div className="welcome-banner">
                <div className="banner-icon">
                  <ChefHat size={38} />
                </div>
                <div>
                  <strong>冰箱里的新鲜，餐桌上的灵感</strong>
                  <p>
                    {"已有 "}
                    {fridge.length}
                    {" 种食材，看看今天能做些什么。"}
                  </p>
                </div>
                <button onClick={() => navigate(4)}>
                  {"用现有食材找菜 "}
                  <ArrowRight size={17} />
                </button>
                <span className="banner-decoration">
                  FRESH
                  <br />
                  IDEAS
                </span>
              </div>
              <div className="content-columns">
                <aside className="categories">
                  <span className="nav-label">菜品分类</span>
                  {recipeCategories.map((categoryName, index) => (
                    <button
                      key={categoryName}
                      className={category === categoryName ? "active" : ""}
                      onClick={() => setCategory(categoryName)}
                    >
                      <span>{["✦", "☀", "❀", "♨", "◡", "≈", "♡"][index]}</span>
                      {categoryName}
                      <small>
                        {categoryName === "全部"
                          ? recipes.length
                          : recipes.filter(
                              (recipe) => recipe.category === categoryName,
                            ).length}
                      </small>
                    </button>
                  ))}
                </aside>
                <section className="recipe-section">
                  <div className="section-tools">
                    <h2>
                      {selectedIngredients.length
                        ? "冰箱食材推荐"
                        : category === "全部"
                          ? "今日菜品灵感"
                          : category}{" "}
                      <span>
                        {filteredRecipes.length}
                        {" 道菜"}
                      </span>
                    </h2>
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="搜索菜品"
                        placeholder="搜搜想吃的菜"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="recipe-grid">
                    {filteredRecipes.map((recipe) => (
                      <article key={recipe.id} className="recipe-card">
                        <button
                          className="photo-button"
                          onClick={() => {
                            setActiveRecipe(recipe);
                            setModal("detail");
                          }}
                        >
                          {recipe.image ? (
                            <img src={recipe.image} alt={recipe.name} />
                          ) : (
                            <div className="food-fallback">
                              <Utensils size={40} />
                              <span>{recipe.name}</span>
                            </div>
                          )}
                          <span
                            className={
                              "calorie-tag " + calorieClass(recipe.kcal)
                            }
                          >
                            <Leaf size={12} />
                            {calorieLabel(recipe.kcal)}
                          </span>
                        </button>
                        <div className="recipe-info">
                          <button
                            className="recipe-name"
                            onClick={() => {
                              setActiveRecipe(recipe);
                              setModal("detail");
                            }}
                          >
                            {recipe.name}
                          </button>
                          <p>
                            {recipe.ingredients
                              .slice(0, 3)
                              .map((item) => item.name)
                              .join(" · ")}
                          </p>
                          <div className="card-bottom">
                            <span>
                              <Clock size={14} />
                              {recipe.time}
                              {" 分钟 "}
                              <i>·</i> {recipe.kcal}
                              {" kcal/100g"}
                            </span>
                            <div className="counter">
                              {!!quantities[recipe.id] && (
                                <>
                                  <button
                                    aria-label={"减少" + recipe.name}
                                    onClick={() =>
                                      changeQuantity(recipe.id, -1)
                                    }
                                  >
                                    <Minus size={14} />
                                  </button>
                                  <b>{quantities[recipe.id]}</b>
                                </>
                              )}
                              <button
                                className="plus"
                                aria-label={"添加" + recipe.name}
                                onClick={() => changeQuantity(recipe.id, 1)}
                              >
                                <Plus size={17} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!filteredRecipes.length && (
                    <div className="empty">
                      没有找到匹配的菜谱，试试其他分类或食材。
                    </div>
                  )}
                  <p className="data-note">
                    菜品与营养为示例数据 · 热量按每 100g 分级
                  </p>
                </section>
              </div>
              <div className="selection-bar">
                <button onClick={() => setModal("selection")}>
                  <span className="basket-circle">
                    <ShoppingBasket size={23} />
                  </span>
                  <div>
                    <b>
                      {"已选 "}
                      {selectedCount}
                      {" 份菜品"}
                    </b>
                    <small>点开查看清单，确认后同步到周菜单</small>
                  </div>
                </button>
                <button
                  className="primary"
                  onClick={() => setModal("selection")}
                  disabled={!selectedCount}
                >
                  {"确认我的菜单 "}
                  <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}
          {page === 2 && (
            <>
              <div className="section-tools">
                <h2>
                  {"还需要买 "}
                  <span>
                    {shoppingList.length}
                    {" 种食材"}
                  </span>
                </h2>
                <button
                  className="primary"
                  disabled={!shoppingList.length}
                  onClick={() => setModal("export")}
                >
                  <Download size={17} />
                  {" 预览与导出"}
                </button>
              </div>
              <div className="chip-row">
                {stockCategories.map((categoryName) => (
                  <button
                    key={categoryName}
                    className={category === categoryName ? "active" : ""}
                    onClick={() => setCategory(categoryName)}
                  >
                    {categoryName}
                  </button>
                ))}
              </div>
              <div className="stock-grid">
                {shoppingList
                  .filter(
                    (item) => category === "全部" || item.category === category,
                  )
                  .map((item) => (
                    <article key={item.name + item.unit} className="stock-card">
                      <ShoppingBasket />
                      <h3>{item.name}</h3>
                      <strong>
                        {item.qty} <small>{item.unit}</small>
                      </strong>
                      <p className="missing">
                        {"需要采购 · "}
                        {item.category}
                      </p>
                    </article>
                  ))}
              </div>
              {!shoppingList.length && (
                <div className="empty">
                  <Check size={40} />
                  <h2>菜篮子空空的</h2>
                  <p>先去选菜并确认，缺少的食材会出现在这里。</p>
                  <button className="primary" onClick={() => navigate(0)}>
                    去选菜
                  </button>
                </div>
              )}
            </>
          )}
          {page === 3 && (
            <>
              <div className="panel">
                <div className="section-tools">
                  <h2>待安排的美味</h2>
                  <span className="subtle">可重复安排 · 每张卡片为一份</span>
                </div>
                <div className="chip-row">
                  {recipes
                    .filter((recipe) => confirmedQuantities[recipe.id] > 0)
                    .map((recipe) => (
                      <button
                        key={recipe.id}
                        draggable
                        onDragStart={(event) =>
                          event.dataTransfer.setData(
                            "text/plain",
                            String(recipe.id),
                          )
                        }
                        className={
                          "meal-chip " +
                          calorieClass(recipe.kcal) +
                          (selectedRecipeId === recipe.id ? " selected" : "")
                        }
                        onClick={() => setSelectedRecipeId(recipe.id)}
                      >
                        <GripVertical size={15} />
                        {recipe.name}
                      </button>
                    ))}
                </div>
                {!Object.values(confirmedQuantities).some(Boolean) && (
                  <p>
                    还没有素材，
                    <button className="text-link" onClick={() => navigate(0)}>
                      去点单选菜
                    </button>
                  </p>
                )}
              </div>
              <div className="week-scroll">
                <div className="week-grid">
                  <div className="day-head">一周三餐</div>
                  {["一", "二", "三", "四", "五", "六", "日"].map((e, t) => (
                    <div key={e} className="day-head">
                      周{e}
                      <small>
                        {calculateCalories(
                          ["早", "中", "晚"].flatMap(
                            (e) => plan[t + "-" + e] || [],
                          ),
                        )}
                        {" kcal"}
                      </small>
                    </div>
                  ))}
                  {["早", "中", "晚"].map((e) => (
                    <div key={e} className="week-row">
                      <div className="meal-label">
                        {e === "早" ? "早餐" : e === "中" ? "午餐" : "晚餐"}
                      </div>
                      {Array.from(
                        {
                          length: 7,
                        },
                        (t, n) => {
                          const r = n + "-" + e;
                          return (
                            <div
                              key={r}
                              className="meal-cell"
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                const t = Number(
                                  event.dataTransfer.getData("text/plain"),
                                );
                                if (confirmedQuantities[t]) {
                                  addToMeal(r, t);
                                }
                              }}
                            >
                              {(plan[r] || []).map((e, t) => (
                                <div
                                  key={t}
                                  className={
                                    "planned " +
                                    calorieClass(findRecipe(e)?.kcal || 0)
                                  }
                                >
                                  {findRecipe(e)?.name}
                                  <button
                                    aria-label="移除菜品"
                                    onClick={() =>
                                      setPlan((currentPlan) => ({
                                        ...currentPlan,
                                        [r]: currentPlan[r].filter(
                                          (e, n) => n !== t,
                                        ),
                                      }))
                                    }
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                className="add-meal"
                                onClick={() =>
                                  selectedRecipeId
                                    ? addToMeal(r, selectedRecipeId)
                                    : toast("请先选择顶部的菜品")
                                }
                                aria-label={"安排周" + (n + 1) + e + "餐"}
                              >
                                <Plus size={17} />
                              </button>
                              <small>
                                {calculateCalories(plan[r] || [])}
                                {" kcal"}
                              </small>
                            </div>
                          );
                        },
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="notice">
                <Leaf size={20} />
                <div>
                  热量提醒：
                  {Array.from(
                    {
                      length: 7,
                    },
                    (e, t) =>
                      calculateCalories(
                        ["早", "中", "晚"].flatMap(
                          (e) => plan[t + "-" + e] || [],
                        ),
                      ),
                  ).some((e) => e > dailyTarget)
                    ? "本周有日期超过设定目标，请检查餐次搭配。"
                    : "已安排餐次的每日热量均未超过设定目标。"}
                  <small>
                    按每份重量估算；目标由你设置，不代表个体营养建议。
                  </small>
                </div>
                <label>
                  {"每日目标 "}
                  <input
                    type="number"
                    min="1"
                    value={dailyTarget}
                    onChange={(event) =>
                      setDailyTarget(Math.max(1, Number(event.target.value)))
                    }
                  />
                  {" kcal"}
                </label>
              </div>
              <div className="actions">
                <button className="outline" onClick={() => setModal("clear")}>
                  <Trash2 size={16} />
                  清空本周
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setArchives((currentArchives) => ({
                      ...currentArchives,
                      [today()]: JSON.parse(JSON.stringify(plan)),
                    }));
                    toast.success("已按今天日期存档，可在膳食日历查看");
                  }}
                >
                  <CalendarDays size={17} />
                  保存至膳食日历
                </button>
              </div>
            </>
          )}
          {page === 4 && (
            <>
              <div className="welcome-banner">
                <Camera size={36} />
                <div>
                  <strong>拍一拍，让新鲜有迹可循</strong>
                  <p>拍照 / 小票识别入口，支持确认后录入食材。</p>
                </div>
                <button onClick={() => setModal("ai-fridge")}>
                  {"AI 识别食材 "}
                  <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="chip-row dashed">
                {stockCategories.map((categoryName) => (
                  <button
                    key={categoryName}
                    className={category === categoryName ? "active" : ""}
                    onClick={() => setCategory(categoryName)}
                  >
                    {categoryName}
                  </button>
                ))}
              </div>
              <div className="stock-grid">
                {fridge.map((stock, index) => {
                  const n = Math.max(
                    1,
                    Math.floor(
                      (Date.now() - new Date(stock.date || today()).getTime()) /
                        86400000,
                    ) + 1,
                  );
                  const r = (stock.days || 7) - n;
                  return (
                    (category === "全部" || stock.category === category) && (
                      <article key={index} className="stock-card">
                        <div className="stock-title">
                          <Leaf />
                          <button
                            aria-label="删除食材"
                            onClick={() =>
                              setFridge((currentFridge) =>
                                currentFridge.filter((e, n) => n !== index),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <h3>{stock.name}</h3>
                        <div className="stock-inputs">
                          <input
                            aria-label={stock.name + "数量"}
                            type="number"
                            min="0"
                            value={stock.qty}
                            onChange={(event) =>
                              setFridge((currentFridge) =>
                                currentFridge.map((n, r) =>
                                  r === index
                                    ? {
                                        ...n,
                                        qty: Math.max(0, +event.target.value),
                                      }
                                    : n,
                                ),
                              )
                            }
                          />
                          <input
                            aria-label={stock.name + "单位"}
                            value={stock.unit}
                            onChange={(event) =>
                              setFridge((currentFridge) =>
                                currentFridge.map((n, r) =>
                                  r === index
                                    ? {
                                        ...n,
                                        unit: event.target.value,
                                      }
                                    : n,
                                ),
                              )
                            }
                          />
                        </div>
                        <p
                          className={
                            "freshness " +
                            (r < 1 ? "high" : r < 3 ? "mid" : "low")
                          }
                        >
                          {"● "}
                          {r < 0
                            ? "已过设定期限"
                            : r < 1
                              ? "今天到期"
                              : r < 3
                                ? "尽快食用"
                                : "新鲜"}
                          {" · "}
                          {r >= 0 ? "剩余" + r + "天" : "请检查状态"}
                        </p>
                      </article>
                    )
                  );
                })}
              </div>
              <p className="data-note">
                新鲜度按录入日期与自设保存天数估算，请结合实际状态判断。
              </p>
              <section className="panel">
                <h2>用这些食材，做点好吃的</h2>
                <div className="chip-row">
                  {fridge.map((stock, index) => (
                    <button
                      key={index}
                      className={
                        selectedIngredients.includes(stock.name) ? "active" : ""
                      }
                      onClick={() =>
                        setSelectedIngredients((selected) =>
                          selected.includes(stock.name)
                            ? selected.filter((t) => t !== stock.name)
                            : [...selected, stock.name],
                        )
                      }
                    >
                      {stock.name} <ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
                <button
                  className="primary"
                  disabled={!selectedIngredients.length}
                  onClick={() => {
                    setPage(0);
                    setCategory("全部");
                  }}
                >
                  {"看看能做什么 "}
                  <ArrowRight size={17} />
                </button>
              </section>
            </>
          )}
          {page === 1 && (
            <div className="editor-layout">
              <section className="panel editor">
                <div className="section-tools">
                  <h2>新建菜谱</h2>
                  <button
                    className="outline"
                    onClick={() => setModal("import")}
                  >
                    <Upload size={16} />
                    上传
                  </button>
                </div>
                <label>
                  菜品名称
                  <input
                    placeholder="给这道菜起个名字"
                    value={recipeDraft.name}
                    onChange={(event) =>
                      setRecipeDraft((draft) => ({
                        ...draft,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="form-row">
                  <label>
                    分类
                    <input
                      list="recipe-cats"
                      value={recipeDraft.category}
                      onChange={(event) =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          category: event.target.value,
                        }))
                      }
                    />
                    <datalist id="recipe-cats">
                      {recipeCategories.slice(1).map((categoryName) => (
                        <option key={categoryName}>{categoryName}</option>
                      ))}
                    </datalist>
                  </label>
                  <label>
                    用时（分钟）
                    <input
                      type="number"
                      min="1"
                      value={recipeDraft.time}
                      onChange={(event) =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          time: +event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    成品重量（克）
                    <input
                      type="number"
                      min="1"
                      value={recipeDraft.weight}
                      onChange={(event) =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          weight: Math.max(1, +event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
                <label>
                  热量（kcal / 100g，可修改）
                  <input
                    type="number"
                    min="0"
                    value={recipeDraft.kcal}
                    onChange={(event) =>
                      setRecipeDraft((draft) => ({
                        ...draft,
                        kcal: Math.max(0, +event.target.value),
                      }))
                    }
                  />
                </label>
                <p className="data-note">
                  当前为手动核对数值；自动营养核算需要接入食材营养数据库。
                </p>
                <h3>所需食材</h3>
                {recipeDraft.ingredients.map((item, index) => (
                  <div key={index} className="ingredient-row">
                    <input
                      aria-label="食材名称"
                      placeholder="食材名称"
                      value={item.name}
                      onChange={(event) =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          ingredients: draft.ingredients.map((_item, _index) =>
                            _index === index
                              ? {
                                  ..._item,
                                  name: event.target.value,
                                }
                              : _item,
                          ),
                        }))
                      }
                    />
                    <input
                      aria-label="数量"
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(event) =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          ingredients: draft.ingredients.map(
                            (_item2, _index2) =>
                              _index2 === index
                                ? {
                                    ..._item2,
                                    qty: +event.target.value,
                                  }
                                : _item2,
                          ),
                        }))
                      }
                    />
                    <input
                      aria-label="单位"
                      value={item.unit}
                      onChange={(event) =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          ingredients: draft.ingredients.map(
                            (_item3, _index3) =>
                              _index3 === index
                                ? {
                                    ..._item3,
                                    unit: event.target.value,
                                  }
                                : _item3,
                          ),
                        }))
                      }
                    />
                    <button
                      aria-label="删除食材"
                      onClick={() =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          ingredients: draft.ingredients.filter(
                            (_item4, _index4) => _index4 !== index,
                          ),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="text-link"
                  onClick={() =>
                    setRecipeDraft((draft) => ({
                      ...draft,
                      ingredients: [...draft.ingredients, ingredient("", 100)],
                    }))
                  }
                >
                  ＋ 添加食材
                </button>
                <h3>制作步骤</h3>
                {recipeDraft.steps.map((step, index) => (
                  <div
                    key={index}
                    draggable
                    onDragStart={() => setDraggedStep(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() =>
                      setRecipeDraft((draft) => {
                        const n = [...draft.steps];
                        n.splice(index, 0, n.splice(draggedStep, 1)[0]);
                        return {
                          ...draft,
                          steps: n,
                        };
                      })
                    }
                    className="step-row"
                  >
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    <textarea
                      aria-label={"步骤" + (index + 1)}
                      placeholder="描述这一步怎么做…"
                      value={step}
                      onChange={(event) =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          steps: draft.steps.map((_step, _index5) =>
                            _index5 === index ? event.target.value : _step,
                          ),
                        }))
                      }
                    />
                    <GripVertical size={20} />
                    <button
                      aria-label="删除步骤"
                      onClick={() =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          steps: draft.steps.filter(
                            (_step2, _index6) => _index6 !== index,
                          ),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="text-link"
                  onClick={() =>
                    setRecipeDraft((draft) => ({
                      ...draft,
                      steps: [...draft.steps, ""],
                    }))
                  }
                >
                  ＋ 添加步骤
                </button>
                <button className="primary save-recipe" onClick={saveRecipe}>
                  <Check size={17} />
                  确认保存到菜品库
                </button>
              </section>
              <aside className="editor-tip">
                <ChefHat size={38} />
                <h2>
                  你的厨房，
                  <br />
                  你的独家味道。
                </h2>
                <p>
                  把食材用量记准确，
                  <br />
                  下次做菜更从容。
                </p>
                <p>
                  拖动步骤右侧的手柄，
                  <br />
                  调整制作顺序。
                </p>
              </aside>
            </div>
          )}
        </div>
        <footer className="site-footer">
          {"食光 SHIGUANG "}
          <span>一餐一饭，皆是生活。</span>
        </footer>
      </main>
      <Dialog open={!!modal} onOpenChange={(open) => !open && setModal("")}>
        <DialogContent className="app-dialog">
          <DialogTitle>
            {{
              detail: activeRecipe?.name,
              selection: "我的点单清单",
              stock: "添加新鲜食材",
              export: "采购清单预览",
              clear: "清空本周安排？",
              history: "膳食日历",
              import: "导入菜谱",
              "ai-fridge": "AI 识别食材",
            }[modal] || "食光"}
          </DialogTitle>
          <DialogDescription>
            {modal === "detail"
              ? "食材与制作步骤"
              : modal === "clear"
                ? "本周安排将被移除，已存档记录会保留。"
                : "确认信息后再保存"}
          </DialogDescription>
          {modal === "detail" && activeRecipe && (
            <>
              {activeRecipe.image && (
                <img
                  className="detail-image"
                  src={activeRecipe.image}
                  alt={activeRecipe.name}
                />
              )}
              <div className="chip-row">
                <span className={calorieClass(activeRecipe.kcal)}>
                  {calorieLabel(activeRecipe.kcal)}
                  {" · "}
                  {activeRecipe.kcal}
                  {" kcal/100g"}
                </span>
                <span>
                  {activeRecipe.time}
                  {" 分钟 · 每份约 "}
                  {activeRecipe.weight}g
                </span>
              </div>
              <h3>所需食材</h3>
              {activeRecipe.ingredients.map((item) => {
                const t =
                  fridge
                    .filter(
                      (stock) =>
                        stock.name === item.name && stock.unit === item.unit,
                    )
                    .reduce((e, t) => e + t.qty, 0) >= item.qty;
                return (
                  <div
                    key={item.name}
                    className={
                      "detail-ingredient " + (t ? "available" : "missing")
                    }
                  >
                    <span>
                      {t ? "✓" : "＋"} {item.name}
                    </span>
                    <span>
                      {item.qty}
                      {item.unit}
                      {" · "}
                      {t ? "已有" : "缺少"}
                    </span>
                  </div>
                );
              })}
              <h3>制作步骤</h3>
              {activeRecipe.steps.map((step, index) => (
                <p key={index}>
                  <b className="step-number">{index + 1}</b>
                  {step}
                </p>
              ))}
              <button
                className="primary"
                onClick={() => {
                  changeQuantity(activeRecipe.id, 1);
                  toast.success("已加入点单清单");
                }}
              >
                ＋ 加入菜单
              </button>
            </>
          )}
          {modal === "selection" && (
            <>
              {recipes
                .filter((recipe) => quantities[recipe.id] > 0)
                .map((recipe) => (
                  <div key={recipe.id} className="list-row">
                    <b>{recipe.name}</b>
                    <div className="counter">
                      <button onClick={() => changeQuantity(recipe.id, -1)}>
                        <Minus size={16} />
                      </button>
                      {quantities[recipe.id]}
                      <button onClick={() => changeQuantity(recipe.id, 1)}>
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              {!selectedCount && <p>还没有选择菜品。</p>}
              <button className="primary" onClick={confirmSelection}>
                {"确认并同步 · "}
                {selectedCount}
                {" 份菜品"}
              </button>
            </>
          )}
          {modal === "stock" && (
            <div className="editor">
              <label>
                食材名称
                <input
                  value={ingredientDraft.name}
                  onChange={(event) =>
                    setIngredientDraft((draft) => ({
                      ...draft,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="form-row">
                <label>
                  数量
                  <input
                    type="number"
                    min="1"
                    value={ingredientDraft.qty}
                    onChange={(event) =>
                      setIngredientDraft((draft) => ({
                        ...draft,
                        qty: +event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  单位
                  <input
                    value={ingredientDraft.unit}
                    onChange={(event) =>
                      setIngredientDraft((draft) => ({
                        ...draft,
                        unit: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                分类
                <input
                  list="stock-cats"
                  value={ingredientDraft.category}
                  onChange={(event) =>
                    setIngredientDraft((draft) => ({
                      ...draft,
                      category: event.target.value,
                    }))
                  }
                />
                <datalist id="stock-cats">
                  {stockCategories.slice(1).map((categoryName) => (
                    <option key={categoryName}>{categoryName}</option>
                  ))}
                </datalist>
              </label>
              <label>
                保存天数（录入当天算第1天）
                <input
                  type="number"
                  min="1"
                  value={ingredientDraft.days}
                  onChange={(event) =>
                    setIngredientDraft((draft) => ({
                      ...draft,
                      days: Math.max(1, +event.target.value),
                    }))
                  }
                />
              </label>
              <button className="primary" onClick={saveIngredient}>
                确认放入冰箱
              </button>
            </div>
          )}
          {modal === "export" && (
            <>
              {shoppingList.map((item) => (
                <div key={item.name + item.unit} className="list-row">
                  {item.name}
                  <b>
                    {item.qty} {item.unit}
                  </b>
                </div>
              ))}
              <div className="actions">
                <button
                  className="primary"
                  onClick={() => exportShoppingList("image")}
                >
                  导出图片
                </button>
                <button
                  className="outline"
                  onClick={() => exportShoppingList("word")}
                >
                  导出 Word
                </button>
              </div>
              <button
                className="outline"
                onClick={async () => {
                  const e = shoppingList
                    .map((item) => `${item.name} ${item.qty}${item.unit}`)
                    .join("\n");
                  try {
                    navigator.share
                      ? await navigator.share({
                          title: "食光采购清单",
                          text: e,
                        })
                      : (await navigator.clipboard.writeText(e),
                        toast.success("已复制清单，可粘贴到微信分享"));
                  } catch {
                    toast("分享未完成，可先导出再分享");
                  }
                }}
              >
                分享采购清单
              </button>
              <p className="data-note">
                可下载文件后发送到微信；直接分享取决于设备支持。
              </p>
            </>
          )}
          {modal === "clear" && (
            <div className="actions">
              <button className="outline" onClick={() => setModal("")}>
                保留安排
              </button>
              <button
                className="primary"
                onClick={() => {
                  setPlan({});
                  setModal("");
                  toast.success("本周安排已清空");
                }}
              >
                确认清空
              </button>
            </div>
          )}
          {modal === "history" && (
            <>
              <label>
                {"选择存档日期 "}
                <input
                  type="date"
                  value={archiveDate}
                  onChange={(event) => setArchiveDate(event.target.value)}
                />
              </label>
              <div className="chip-row">
                {Object.keys(archives).map((e) => (
                  <button key={e} onClick={() => setArchiveDate(e)}>
                    {e}
                  </button>
                ))}
              </div>
              {archives[archiveDate] ? (
                Object.entries(archives[archiveDate]).map(([e, t]) => (
                  <div key={e} className="list-row">
                    周{"一二三四五六日"[+e.split("-")[0]]} {e.split("-")[1]}餐
                    <span>
                      {t.map((e) => findRecipe(e)?.name).join("、")}
                      {" · "}
                      {calculateCalories(t)}
                      {" kcal"}
                    </span>
                  </div>
                ))
              ) : (
                <p>此日期没有存档，先在周菜单中保存一份安排。</p>
              )}
            </>
          )}
          {(modal === "import" || modal === "ai-fridge") && (
            <>
              <div className="import-options">
                <button
                  className="outline"
                  onClick={() => toast("识别服务尚未接入，请使用下方手动录入")}
                >
                  <Camera />
                  {modal === "import" ? "图文识别" : "拍照识别"}
                </button>
                <button
                  className="outline"
                  onClick={() => toast("识别服务尚未接入，请使用下方手动录入")}
                >
                  <Link />
                  {modal === "import" ? "链接识别" : "小票识别"}
                </button>
              </div>
              <p>
                AI
                服务尚未连接，目前可以手动录入和编辑。连接识别服务后，才能自动提取内容。
              </p>
              <button
                className="primary"
                onClick={() => setModal(modal === "import" ? "" : "stock")}
              >
                先手动{modal === "import" ? "编辑菜谱" : "添加食材"}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Toaster richColors position="top-center" />
    </SidebarProvider>
  );
}
export { App as default };
