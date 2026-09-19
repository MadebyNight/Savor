import { monday, dayAt, usableStock, procurement, trimName, normalizeUnit } from "./domain.js";
import { loadState, saveState, exportBlob, isNative } from "./storage.js";
import {businessState} from "./services.js";
import SyncPanel from "./components/SyncPanel.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import MobileWeek from "./components/MobileWeek.jsx";
import useBackHandler from "./useBackHandler.js";
// 从原站公开页面恢复的交互界面，保留原有文案、状态流转及计算规则。
import {
  ingredient,
  initialRecipes,
  recipeCategories,
  stockCategories,
  today,
} from "./data.js";
import { useEffect, useRef, useState } from "react";
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
  BookOpen,
  Settings2,
  ArrowLeft,
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
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 767px), (max-height: 500px) and (max-width: 1024px)").matches);
  const [editingRecipe, setEditingRecipe] = useState(false);
  const [selectedDay, setSelectedDay] = useState((new Date().getDay() + 6) % 7);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px), (max-height: 500px) and (max-width: 1024px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [syncTarget,setSyncTarget]=useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const returnToPage = () => {
    if (showSettings) setShowSettings(false);
    else setEditingRecipe(false);
  };
  useBackHandler(showSettings || editingRecipe, returnToPage);
  const [saveStatus, setSaveStatus] = useState("正在加载");
  const [recipes, setRecipes] = useState(initialRecipes);
  const [fridge, setFridge] = useState([]);
  // 修改点单只更新 quantities；确认后才更新采购缺口与周菜单素材。
  const [quantities, setQuantities] = useState({});
  const [confirmedQuantities, setConfirmedQuantities] = useState({});
  const [weeks, setWeeks] = useState({});
  const [week, setWeek] = useState(monday(today()));
  const plan = weeks[week] || {};
  const setPlan = (update) =>
    setWeeks((current) => ({
      ...current,
      [week]:
        typeof update === "function" ? update(current[week] || {}) : update,
    }));
  const [confirmedRecipes, setConfirmedRecipes] = useState([]);
  const [copyTarget, setCopyTarget] = useState(monday(today()));
  const [archives, setArchives] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const pageFilters = useRef({});
  const [modal, setModal] = useState("");
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [archiveDate, setArchiveDate] = useState("");
  const [recipeDraft, setRecipeDraft] = useState({
    id: 0,
    name: "",
    category: "素菜",
    time: 15,
    weight: 300,
    ingredients: [ingredient("", 100)],
    steps: [""],
  });
  const [ingredientDraft, setIngredientDraft] = useState({
    ...ingredient("", 100),
    days: 7,
    date: today(),
  });
  const [draggedStep, setDraggedStep] = useState(0);
  const fullState = {
    recipes,
    fridge,
    qty: quantities,
    confirmed: confirmedQuantities,
    weeks,
    archives,
    confirmedRecipes,
    recipeDraft,
  };
  const latestState=useRef(fullState);latestState.current=fullState;
  const applyState = (state) => {
    setRecipes(state.recipes || initialRecipes);
    setFridge(state.fridge || []);
    setQuantities(state.qty || {});
    setConfirmedQuantities(state.confirmed || {});
    setWeeks(state.weeks || {});
    setArchives(state.archives || (state.plan ? { 旧版存档: state.plan } : {}));
    setConfirmedRecipes(
      state.confirmedRecipes ||
        (state.recipes || []).filter((item) => state.confirmed?.[item.id]),
    );
    if (state.recipeDraft) setRecipeDraft(state.recipeDraft);
  };
  const restoreState = async (state, expected) => {
    const unchanged=()=>!expected||JSON.stringify(businessState(latestState.current))===JSON.stringify(businessState(expected));
    if(!unchanged())throw new Error("同步期间本地数据已改变，请重新检查");
    setSaveStatus("正在恢复");
    try {
      await saveState(state);
      if(!unchanged()){await saveState(latestState.current);throw new Error("同步期间本地数据已改变，已保留本地修改");}
      applyState(expected?{...state,qty:latestState.current.qty,recipeDraft:latestState.current.recipeDraft}:state);
      setModal("");
      setSelectedRecipeId(null);
      setSaveStatus("已保存");
    } catch (error) {
      setSaveStatus("恢复失败，原数据保留");
      throw error;
    }
  };
  useEffect(() => {
    let active = true;
    loadState()
      .then((state) => {
        if (active) {
          if (state) applyState(state);
          setHydrated(true);
        }
      })
      .catch((error) => {
        toast.error("读取数据失败：" + error.message);
        setSaveStatus("加载失败，请重启后重试");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    setSaveStatus("正在保存");
    let active = true;
    saveState(fullState)
      .then(() => {
        if (active) setSaveStatus("已保存");
      })
      .catch((error) => {
        if (active) {
          setSaveStatus("保存失败");
          toast.error("保存失败：" + error.message);
        }
      });
    return () => {
      active = false;
    };
  }, [
    recipes,
    fridge,
    quantities,
    confirmedQuantities,
    weeks,
    archives,
    confirmedRecipes,
    recipeDraft,
    hydrated,
  ]);
  const navigate = (nextPage) => {
    pageFilters.current[page] = { category, search };
    setShowSettings(false);
    setPage(nextPage);
    setEditingRecipe(false);
    setCategory(pageFilters.current[nextPage]?.category || "全部");
    setSearch(pageFilters.current[nextPage]?.search || "");
    setSelectedIngredients([]);
  };
  const findRecipe = (recipeId) =>
    typeof recipeId === "object"
      ? recipeId
      : recipes.find((recipe) => recipe.id === recipeId) ||
        confirmedRecipes.find((recipe) => recipe.id === recipeId);
  const selectedCount = Object.values(quantities).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  // 同名、同单位食材合并；先汇总全部需求，再减去冰箱中已有数量。
  const shoppingList = procurement(
    confirmedRecipes,
    confirmedQuantities,
    fridge,
  );
  const changeQuantity = (recipeId, delta) =>
    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [recipeId]: Math.max(0, (currentQuantities[recipeId] || 0) + delta),
    }));
  const confirmSelection = () => {
    if (!selectedCount && !window.confirm("清空采购需求？已排菜单保持不变。"))
      return;
    setConfirmedRecipes(
      structuredClone(recipes.filter((item) => quantities[item.id] > 0)),
    );
    setConfirmedQuantities({
      ...quantities,
    });
    setModal("");
    toast.success("已同步周菜单素材与缺失食材清单");
  };
  const addToMeal = (slot, recipeId) => {
    if (recipeId) {
      setPlan((currentPlan) => {
        const items = [...(currentPlan[slot] || [])];
        const index = items.findIndex((item) => item.id === recipeId);
        if (index >= 0)
          items[index] = {
            ...items[index],
            servings: (items[index].servings || 1) + 1,
          };
        else
          items.push({
            ...structuredClone(
              confirmedRecipes.find((item) => item.id === recipeId) ||
                findRecipe(recipeId),
            ),
            servings: 1,
          });
        return { ...currentPlan, [slot]: items };
      });
      toast.success("已安排这道菜");
    }
  };
  const filteredRecipes = recipes.filter(
    (recipe) =>
      (category === "全部" || recipe.category === category) &&
      (recipe.name.includes(search.trim()) || recipe.ingredients.some(item => item.name.includes(search.trim()))) &&
      (!selectedIngredients.length ||
        selectedIngredients.every((ingredientName) =>
          recipe.ingredients.some((item) => trimName(item.name) === trimName(ingredientName)),
        )),
  );
  const saveRecipe = () => {
    if (
      !recipeDraft.name.trim() ||
      !recipeDraft.ingredients.length ||
      !recipeDraft.steps.length ||
      recipeDraft.ingredients.some(
        (item) =>
          !item.name.trim() ||
          (item.qty !== "" && item.qty != null && item.qty <= 0),
      ) ||
      recipeDraft.steps.some((step) => !step.trim())
    ) {
      toast.error("请填写菜名、有效食材数量和制作步骤");
      return;
    }
    if (
      recipes.some(
        (item) =>
          item.id !== recipeDraft.id && item.name === recipeDraft.name.trim(),
      )
    )
      toast("已有同名菜谱，本次仍独立保存");
    const savedRecipe = {
      ...recipeDraft,
      name: recipeDraft.name.trim(),
      id: recipeDraft.id || Date.now(),
      ingredients: recipeDraft.ingredients.map((item) => ({
        ...item,
        name: item.name.trim(),
        unit: item.unit.trim() === "克" ? "g" : item.unit.trim(),
        qty: item.qty === "" ? null : item.qty,
      })),
    };
    setRecipes((current) =>
      recipeDraft.id
        ? current.map((item) =>
            item.id === recipeDraft.id ? savedRecipe : item,
          )
        : [...current, savedRecipe],
    );
    toast.success(
      recipeDraft.id
        ? "菜谱已更新，已确认采购与菜单快照保留"
        : "菜谱已保存到点单选菜",
    );
    setRecipeDraft({
      id: 0,
      name: "",
      category: "素菜",
      time: 15,
      weight: 300,
      ingredients: [ingredient("", 100)],
      steps: [""],
    });
    pageFilters.current[0] = { category: "全部", search: "" };
    navigate(0);
  };
  const saveIngredient = () => {
    if (
      !ingredientDraft.name.trim() ||
      !ingredientDraft.unit.trim() ||
      !Number.isFinite(Number(ingredientDraft.qty)) ||
      ingredientDraft.qty <= 0
    ) {
      toast.error("请填写食材名称和有效数量");
      return;
    }
    setFridge((currentFridge) => [
      ...currentFridge,
      {
        ...ingredientDraft,
        name: ingredientDraft.name.trim(),
        unit:
          ingredientDraft.unit.trim() === "克"
            ? "g"
            : ingredientDraft.unit.trim(),
        date: ingredientDraft.date || today(),
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
      (item) => `${item.name}    ${item.qty ?? "待确认"} ${item.unit}`,
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
    try {await exportBlob(n,"食材采购清单." + (format === "image" ? "png" : "doc"));} catch(error) {toast.error("导出失败："+error.message);}

  };
  if (!hydrated)
    return (
      <main className="panel" role="status">
        <h1>食光</h1>
        <p>{saveStatus}</p>
        <p>数据读取完成后才能编辑。</p>
        {saveStatus.includes("失败") && (
          <button className="primary" onClick={() => window.location.reload()}>
            重新加载
          </button>
        )}
        <Toaster richColors position="top-center" />
      </main>
    );
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
              我的小厨房<small>数据保存在本机</small>
            </div>
            <Heart size={17} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className={`main ${compact ? "compact-app" : ""}`}>
        <header className="topbar">
          {compact && <>
            <div className="mobile-title">
              {showSettings || editingRecipe ? <button className="mobile-icon" aria-label="返回" onClick={returnToPage}><ArrowLeft size={22} /></button> : <span className="brand-stamp">食</span>}
              <h1>{showSettings ? "设置与数据" : editingRecipe ? (recipeDraft.id ? "编辑菜谱" : "新建菜谱") : ["点单", "菜谱", "菜篮子", "周菜单", "冰箱"][page]}</h1>
              <span role="status" className={saveStatus.includes("失败") ? "mobile-save-error" : "sr-only"}>{saveStatus}</span>
            </div>
            <div className="mobile-header-actions">
              {!showSettings && !editingRecipe && page === 0 && <button className="mobile-icon" aria-label="设置与备份" onClick={() => setShowSettings(true)}><Settings2 size={22} /></button>}
              {!showSettings && !editingRecipe && page === 4 && <button onClick={() => setModal("stock")}><Plus size={18} />添加食材</button>}
              {!showSettings && !editingRecipe && page === 1 && <button onClick={() => setEditingRecipe(true)}><Plus size={18} />{recipeDraft.name ? "继续草稿" : "新建菜谱"}</button>}
              {!showSettings && page === 3 && <button onClick={() => setModal("history")}><CalendarDays size={18} />历史</button>}
              {!showSettings && page === 2 && <button disabled={!shoppingList.length} onClick={() => setModal("export")}><Download size={18} />导出</button>}
            </div>
          </>}
          {!compact && <>
          <div className="mobile-menu">
            <SidebarTrigger />
          </div>
          <span>
            {"我的小厨房 "}
            <i>/</i> <b>{navigationItems[page][0]}</b>
          </span>
          <span className="settings-tools">
            <button
              className="outline"
              onClick={() => setShowSettings((value) => !value)}
            >
              设置与备份
            </button>
            <small role="status">{saveStatus}</small>
            <span className="today"><Sun size={17} /> 今天也要好好吃饭</span>
          </span>
          </>}
        </header>
        <div className={`workspace page-${page} ${showSettings ? "show-settings" : ""} ${editingRecipe ? "is-editing" : ""}`}>
          {showSettings && (
            <SettingsPanel
              onSyncTarget={setSyncTarget}
              state={fullState}
              onRestore={restoreState}
              onImportRecipes={async items => {const next=[...recipes,...items];await saveState({...fullState,recipes:next});setRecipes(next);}}
              onImportStock={async items => {const next=[...fridge,...items];await saveState({...fullState,fridge:next});setFridge(next);}}

            />
          )}

          {!showSettings && <>
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
              {compact && <label className="search mobile-search"><Search size={18}/><input aria-label="搜索菜品" placeholder="搜索菜名或食材" value={search} onChange={event => setSearch(event.target.value)} /></label>}
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
                      aria-pressed={category === categoryName}
                      onClick={() => setCategory(categoryName)}
                    >
                      {!compact && <span>{["✦", "☀", "❀", "♨", "◡", "≈", "♡"][index]}</span>}
                      <span className="category-name">{categoryName}</span>
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
                          ? "全部菜品"
                          : category}{" "}
                      <span>
                        {filteredRecipes.length}
                        {" 道菜"}
                      </span>
                    </h2>
                    {!compact && <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="搜索菜品"
                        placeholder="搜搜想吃的菜"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>}
                  </div>
                  {!!selectedIngredients.length && <button className="text-link" onClick={() => setSelectedIngredients([])}>清除食材筛选</button>}
                  <div className="recipe-grid">
                    {filteredRecipes.map((recipe) => (
                      <article key={recipe.id} className="recipe-card">
                        <button
                          className="photo-button"
                          aria-label={"查看" + recipe.name}
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
                          {!!selectedIngredients.length && (
                            <p>
                              按 1 份仍缺：
                              {recipe.ingredients
                                .map((item) => {
                                  const available = fridge
                                    .filter(
                                      (stock) =>
                                        usableStock(stock) &&
                                        trimName(stock.name) === trimName(item.name) &&
                                        normalizeUnit(stock.unit) === normalizeUnit(item.unit),
                                    )
                                    .reduce(
                                      (sum, stock) => sum + Number(stock.qty),
                                      0,
                                    );
                                  return item.qty == null
                                    ? item.name + "（待确认）"
                                    : item.qty > available
                                      ? item.name +
                                        " " +
                                        +(item.qty - available).toFixed(2) +
                                        item.unit
                                      : "";
                                })
                                .filter(Boolean)
                                .join("、") || "库存齐全"}
                            </p>
                          )}
                          <div className="card-bottom">
                            <span>
                              <Clock size={14} />
                              {recipe.time}
                              {" 分钟 "}
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
                    示例菜谱可编辑和删除 · 每份为一道完整菜
                  </p>
                </section>
              </div>
              {(!compact || selectedCount > 0 || Object.values(confirmedQuantities).some(Boolean)) && <div className="selection-bar">
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
                  disabled={
                    !selectedCount &&
                    !Object.values(confirmedQuantities).some(Boolean)
                  }
                >
                  {"确认我的菜单 "}
                  <ArrowRight size={18} />
                </button>
              </div>}
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
              <div className="stock-layout">
              <aside className="chip-row stock-categories" aria-label="食材分类">
                {stockCategories.map((categoryName) => (
                  <button
                    key={categoryName}
                    className={category === categoryName ? "active" : ""}
                    aria-pressed={category === categoryName}
                    onClick={() => setCategory(categoryName)}
                  >
                    {categoryName}
                  </button>
                ))}
              </aside>
              <section className="stock-results">
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
                        {item.qty ?? "待确认"} <small>{item.unit}</small>
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
                  <h2>{Object.values(confirmedQuantities).some(Boolean) ? "所需食材已备齐" : "菜篮子空空的"}</h2>
                  <p>{Object.values(confirmedQuantities).some(Boolean) ? "当前已确认菜品无需补充采购。" : "先去选菜并确认，缺少的食材会出现在这里。"}</p>
                  <button className="primary" onClick={() => navigate(0)}>
                    去选菜
                  </button>
                </div>
              )}
              {!!shoppingList.length && !shoppingList.some(item => category === "全部" || item.category === category) && <div className="empty">这个分类没有需要采购的食材。</div>}
              </section>
              </div>
            </>
          )}
          {page === 3 && (
            <>
              {compact ? <MobileWeek week={week} setWeek={setWeek} day={selectedDay} setDay={setSelectedDay} plan={plan} setPlan={setPlan} recipes={confirmedRecipes.filter(recipe => confirmedQuantities[recipe.id] > 0)} findRecipe={findRecipe} addToMeal={addToMeal} onSelectRecipes={() => navigate(0)} /> : <>
              <div className="panel">
                <div className="section-tools">
                  <h2>待安排的美味</h2>
                  <span className="subtle">
                    可重复安排 · 首次安排为一份 · 可调整份数
                  </span>
                </div>
                <div className="chip-row">
                  {confirmedRecipes
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
                          "low" +
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
              <div className="actions">
                <button
                  className="outline"
                  onClick={() => setWeek(dayAt(week, -7))}
                >
                  上一周
                </button>
                <label>
                  当前周{" "}
                  <input
                    type="date"
                    value={week}
                    onChange={(event) =>
                      event.target.value && setWeek(monday(event.target.value))
                    }
                  />
                </label>
                <button
                  className="outline"
                  onClick={() => setWeek(dayAt(week, 7))}
                >
                  下一周
                </button>
              </div>
              <div className="week-scroll">
                <div className="week-grid">
                  <div className="day-head">一周三餐</div>
                  {["一", "二", "三", "四", "五", "六", "日"].map((e, t) => (
                    <div key={e} className="day-head">
                      周{e}
                      <small>{dayAt(week, t).slice(5)}</small>
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
                                <div key={t} className={"planned " + "low"}>
                                  {findRecipe(e)?.name}
                                  <input
                                    aria-label={
                                      findRecipe(e)?.name + "餐次份数"
                                    }
                                    type="number"
                                    min="1"
                                    step="1"
                                    style={{ width: "52px" }}
                                    value={e.servings || 1}
                                    onChange={(event) =>
                                      setPlan((current) => ({
                                        ...current,
                                        [r]: current[r].map((item, index) =>
                                          index === t
                                            ? {
                                                ...findRecipe(item),
                                                servings: Math.max(
                                                  1,
                                                  Math.floor(
                                                    Number(
                                                      event.target.value,
                                                    ) || 1,
                                                  ),
                                                ),
                                              }
                                            : item,
                                        ),
                                      }))
                                    }
                                  />
                                  份
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
                            </div>
                          );
                        },
                      )}
                    </div>
                  ))}
                </div>
              </div>
              </>}
              <div className="actions">
                <button className="outline" onClick={() => setModal("clear")}>
                  <Trash2 size={16} />
                  清空本周
                </button>
                <span className="subtle">
                  菜单修改自动保存 · 安排不会增加采购量
                </span>
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
              {compact && <div className="stock-toolbar"><span>{fridge.length} 批食材</span><button className="text-link" onClick={() => setModal("ai-fridge")}><Camera size={18}/>拍照 / 小票识别</button></div>}
              <div className="stock-layout">
              <aside className="chip-row dashed stock-categories" aria-label="食材分类">
                {stockCategories.map((categoryName) => (
                  <button
                    key={categoryName}
                    className={category === categoryName ? "active" : ""}
                    aria-pressed={category === categoryName}
                    onClick={() => setCategory(categoryName)}
                  >
                    {categoryName}
                  </button>
                ))}
              </aside>
              <section className="stock-results">
              <div className="stock-grid">
                {fridge.map((stock, index) => {
                  const n = Math.max(
                    1,
                    Math.floor(
                      (Date.now() - new Date(stock.date || today()).getTime()) /
                        86400000,
                    ) + 1,
                  );
                  const r = stock.days ? Number(stock.days) - n : Infinity;
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
                        <details className="stock-edit" open={!compact || undefined}><summary>{stock.qty} {stock.unit}<span>编辑</span></summary>
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
                        <details className="stock-dates"><summary>日期与保存期</summary><div className="form-row">
                          <label>
                            入库日期
                            <input
                              type="date"
                              aria-label={stock.name + "入库日期"}
                              value={stock.date || today()}
                              onChange={(event) =>
                                event.target.value &&
                                setFridge((current) =>
                                  current.map((item, i) =>
                                    i === index
                                      ? { ...item, date: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            保存天数
                            <input
                              type="number"
                              min="0"
                              aria-label={stock.name + "保存天数"}
                              value={stock.days || 0}
                              onChange={(event) =>
                                setFridge((current) =>
                                  current.map((item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          days: Math.max(
                                            0,
                                            Math.floor(
                                              Number(event.target.value),
                                            ),
                                          ),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        </div></details>
                        </details>
                        <p
                          className={
                            "freshness " +
                            (r < 1 ? "high" : r < 3 ? "mid" : "low")
                          }
                        >
                          {"● "}
                          {r === Infinity
                            ? "期限未知"
                            : r < 0
                              ? "已过设定期限"
                              : r < 1
                                ? "今天到期"
                                : r < 3
                                  ? "尽快食用"
                                  : "新鲜"}
                          {" · "}
                          {r === Infinity
                            ? "未设置保存期"
                            : r >= 0
                              ? "剩余" + r + "天"
                              : "请检查状态"}
                        </p>
                      </article>
                    )
                  );
                })}
              </div>
              {!fridge.some(item => category === "全部" || item.category === category) && <div className="empty"><p>这个分类还没有食材。</p><button className="text-link" onClick={() => setModal("stock")}>添加食材</button></div>}
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
                    setSearch("");
                  }}
                >
                  {"看看能做什么 "}
                  <ArrowRight size={17} />
                </button>
              </section>
              </section>
              </div>
            </>
          )}
          {page === 1 && !editingRecipe && <section className="recipe-library">
            <div className="library-tools">
              <label className="search"><Search size={18}/><input aria-label="搜索我的菜谱" placeholder="搜索菜名或食材" value={search} onChange={event => setSearch(event.target.value)}/></label>
              {!compact && <button className="primary" onClick={() => setEditingRecipe(true)}><Plus size={18}/>{recipeDraft.name ? "继续草稿" : "新建菜谱"}</button>}
              <button className="outline" onClick={() => setModal("import")}><Upload size={18}/>导入菜谱</button>
            </div>
            <h2>我的菜谱 <small>{filteredRecipes.length} 道</small></h2>
            {filteredRecipes.map(recipe => <button key={recipe.id} className="library-recipe" onClick={() => {setActiveRecipe(recipe);setModal("detail");}}>
              {recipe.image ? <img src={recipe.image} alt=""/> : <span className="library-placeholder"><Utensils size={22}/></span>}
              <span><strong>{recipe.name}</strong><small>{recipe.category}{recipe.time ? ` · ${recipe.time} 分钟` : ""}</small></span><ArrowRight size={18}/>
            </button>)}
            {!filteredRecipes.length && <div className="empty">没有找到菜谱，可以新建或导入。</div>}
          </section>}
          {page === 1 && editingRecipe && (
            <div className="editor-layout">
              <section className="panel editor">
                {!compact && <button className="text-link" onClick={() => setEditingRecipe(false)}><ArrowLeft size={18}/>返回我的菜谱（保留草稿）</button>}
                <div className="section-tools">
                  <h2>{recipeDraft.id ? "编辑菜谱" : "新建菜谱"}</h2>
                  <button
                    className="outline"
                    onClick={() => setModal("import")}
                  >
                    <Upload size={16} />
                    上传
                  </button>
                </div>
                <label>
                  菜谱图片
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          image: reader.result,
                        }));
                      reader.onerror = () => toast.error("图片读取失败");
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {recipeDraft.image && (
                  <img
                    className="detail-image"
                    src={recipeDraft.image}
                    alt="菜谱图片预览"
                  />
                )}
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
                <p className="data-note">
                  食材数量留空表示适量或未知，采购时需自行确认。编辑草稿自动保留。
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
                      min="0"
                      step="any"
                      value={item.qty ?? ""}
                      onChange={(event) =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          ingredients: draft.ingredients.map(
                            (_item2, _index2) =>
                              _index2 === index
                                ? {
                                    ..._item2,
                                    qty:
                                      event.target.value === ""
                                        ? ""
                                        : +event.target.value,
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
                    <div>
                      <button
                        aria-label={"上移步骤" + (index + 1)}
                        disabled={index === 0}
                        onClick={() =>
                          setRecipeDraft((draft) => {
                            const steps = [...draft.steps];
                            [steps[index - 1], steps[index]] = [
                              steps[index],
                              steps[index - 1],
                            ];
                            return { ...draft, steps };
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        aria-label={"下移步骤" + (index + 1)}
                        disabled={index === recipeDraft.steps.length - 1}
                        onClick={() =>
                          setRecipeDraft((draft) => {
                            const steps = [...draft.steps];
                            [steps[index + 1], steps[index]] = [
                              steps[index],
                              steps[index + 1],
                            ];
                            return { ...draft, steps };
                          })
                        }
                      >
                        ↓
                      </button>
                    </div>
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
          </>}
        </div>
        <footer className="site-footer">
          {"食光 SHIGUANG "}
          <span>一餐一饭，皆是生活。</span>
        </footer>
      </main>
      {compact && <nav className="mobile-bottom-nav" aria-label="主导航">
        {[[0,"点单",Utensils],[4,"冰箱",Refrigerator],[2,"菜篮子",ShoppingBasket],[3,"周菜单",CalendarDays],[1,"菜谱",BookOpen]].map(([index,label,Icon]) => <button key={index} aria-current={page === index && !showSettings ? "page" : undefined} onClick={() => navigate(index)}><span><Icon size={22}/></span>{label}</button>)}
      </nav>}
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
                <span>
                  {activeRecipe.time}
                  {" 分钟 · 每份约 "}
                  {activeRecipe.weight}g
                </span>
              </div>
              <div className="actions">
                <button
                  className="outline"
                  onClick={() => {
                    setRecipeDraft(structuredClone(activeRecipe));
                    setModal("");
                    navigate(1);
                    setEditingRecipe(true);
                  }}
                >
                  编辑菜谱
                </button>
                <button
                  className="outline"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "删除这道菜谱？已确认采购和菜单保留快照。",
                      )
                    )
                      return;
                    setRecipes((current) =>
                      current.filter((item) => item.id !== activeRecipe.id),
                    );
                    setQuantities((current) => {
                      const next = { ...current };
                      delete next[activeRecipe.id];
                      return next;
                    });
                    setModal("");
                    toast.success("菜谱已删除");
                  }}
                >
                  删除菜谱
                </button>
              </div>
              <h3>所需食材</h3>
              {activeRecipe.ingredients.map((item) => {
                const t =
                  item.qty != null &&
                  fridge
                    .filter(
                      (stock) =>
                        trimName(stock.name) === trimName(item.name) &&
                        normalizeUnit(stock.unit) === normalizeUnit(item.unit) &&
                        usableStock(stock),
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
                      {item.qty ?? "待确认"}
                      {item.unit}
                      {" · "}
                      {item.qty == null ? "需自行确认" : t ? "已有" : "缺少"}
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
                入库日期
                <input
                  type="date"
                  value={ingredientDraft.date || today()}
                  onChange={(event) =>
                    setIngredientDraft((draft) => ({
                      ...draft,
                      date: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                保存天数（0 表示未知，录入当天算第1天）
                <input
                  type="number"
                  min="1"
                  value={ingredientDraft.days}
                  onChange={(event) =>
                    setIngredientDraft((draft) => ({
                      ...draft,
                      days: Math.max(0, +event.target.value),
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
                    {item.qty ?? "待确认"} {item.unit}
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
                    .map(
                      (item) =>
                        `${item.name} ${item.qty ?? "待确认"}${item.unit}`,
                    )
                    .join("\n");
                  try {
                    isNative() ? await exportBlob(new Blob([e], {type:"text/plain"}), "食光采购清单.txt", true) : navigator.share
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
                {Object.keys({ ...archives, ...weeks })
                  .sort()
                  .map((e) => (
                    <button key={e} onClick={() => setArchiveDate(e)}>
                      {e}
                    </button>
                  ))}
              </div>
              {{ ...archives, ...weeks }[archiveDate] ? (
                Object.entries({ ...archives, ...weeks }[archiveDate]).map(
                  ([e, t]) => (
                    <div key={e} className="list-row">
                      周{"一二三四五六日"[+e.split("-")[0]]} {e.split("-")[1]}餐
                      <span>
                        {t
                          .map(
                            (e) =>
                              (findRecipe(e)?.name || "菜谱内容已缺失") +
                              " × " +
                              (e.servings || 1),
                          )
                          .join("、")}
                      </span>
                    </div>
                  ),
                )
              ) : (
                <p>选择有安排的周，可查看并复制到其他周。</p>
              )}
              <label>
                复制到目标周{" "}
                <input
                  type="date"
                  value={copyTarget}
                  onChange={(event) =>
                    event.target.value &&
                    setCopyTarget(monday(event.target.value))
                  }
                />
              </label>
              <button
                className="primary"
                disabled={!{ ...archives, ...weeks }[archiveDate]}
                onClick={() => {
                  if (
                    Object.values(weeks[copyTarget] || {}).some(
                      (items) => items.length,
                    ) &&
                    !window.confirm("目标周已有安排，确认整体替换？")
                  )
                    return;
                  const source = { ...archives, ...weeks }[archiveDate];
                  const copied = Object.fromEntries(
                    Object.entries(source).map(([key, items]) => [
                      key,
                      items.map((item) =>
                        structuredClone(
                          findRecipe(item) || {
                            id: item,
                            name: "菜谱内容已缺失",
                            ingredients: [],
                            steps: [],
                          },
                        ),
                      ),
                    ]),
                  );
                  setWeeks((current) => ({ ...current, [copyTarget]: copied }));
                  setWeek(copyTarget);
                  setModal("");
                  navigate(3);
                  toast.success("已复制，目标周可独立修改");
                }}
              >
                复制菜单
              </button>
            </>
          )}
          {(modal === "import" || modal === "ai-fridge") && (
            <>
              <div className="import-options">
                <button
                  className="outline"
                  onClick={() => {
                    setModal("");
                    setShowSettings(true);
                  }}
                >
                  <Camera />
                  {modal === "import" ? "图文识别" : "拍照识别"}
                </button>
                <button
                  className="outline"
                  onClick={() => {
                    setModal("");
                    setShowSettings(true);
                  }}
                >
                  <Link />
                  {modal === "import" ? "粘贴正文识别" : "小票识别"}
                </button>
              </div>
              <p>
                在设置中配置 AI
                后，可提交正文或截图识别，确认草稿后入库。小红书自动获取暂缓，请手动粘贴正文。
              </p>
              <button
                className="primary"
                onClick={() => { if (modal === "import") {navigate(1);setEditingRecipe(true);setModal("");} else setModal("stock"); }}
              >
                先手动{modal === "import" ? "编辑菜谱" : "添加食材"}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
      {hydrated&&<SyncPanel state={fullState} onRestore={restoreState} target={syncTarget}/>}
      <Toaster richColors position="top-center" />
    </SidebarProvider>
  );
}
export { App as default };
