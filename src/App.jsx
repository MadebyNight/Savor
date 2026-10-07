import StorageRules from './components/StorageRules.jsx';
import {DEFAULT_STORAGE_RULES,suggestStorage,validateStorageRules} from './food-storage.js';
import RecipeFilters from "./components/RecipeFilters.jsx";
import FridgeFilters from "./components/FridgeFilters.jsx";
import CategoryManager from './components/CategoryManager.jsx';
import {categoryNames, changeCategory} from './categories.js';
import { AppSelect, DateTimePicker } from "./components/Pickers.jsx";
import {getReminderStatus,consumeReminderLaunch,markWeekReviewed} from './reminders.js';
import NutritionPanel, {RecipeNutrition,NutritionReviewButton} from './components/NutritionPanel.jsx';
import RecipeSnapshotDialog from './components/RecipeSnapshotDialog.jsx';
import RecipeTimer from './components/RecipeTimer.jsx';
import {calculateNutrition,weekNutritionInput} from './nutrition.js';
﻿import { matchesRecipeTime, stockStatus, ingredientKey, fridgeRecipes, shoppingKey, isPurchased, datedProcurement, MEALS, monday, dayAt, usableStock, normalizeUnit } from "./domain.js";
import { loadState, saveState, exportBlob, isNative, isMissingLocalImage, LocalData } from "./storage.js";
import { comparableUnit, convertQuantity } from "./domain.js";
import {businessState} from "./services.js";
import SyncPanel from "./components/SyncPanel.jsx";
import StockFields from "./components/StockFields.jsx";
import SelectionItems from "./components/SelectionItems.jsx";
import {validateStock} from "./validation.js";
import RecognitionPanel from "./components/RecognitionPanel.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import AppUpdate from './components/AppUpdate.jsx';
import MobileWeek from "./components/MobileWeek.jsx";
import TodayMenu from "./components/TodayMenu.jsx";
import useConfirm from "./components/useConfirm.jsx";
import useBackHandler from "./useBackHandler.js";
// 从原站公开页面恢复的交互界面，保留原有文案、状态流转及计算规则。
import {
  ingredient,
  initialRecipes,
  stockCategories,
  today,
} from "./data.js";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Camera,
  ImagePlus,
  Check,
  ChefHat,
  Clock,
  Download,
  GripVertical,
  Heart,
  Leaf,
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
const hasUsableImage = image => !!image && !isMissingLocalImage(image);
const purchaseFingerprint=item=>JSON.stringify([item.sourceFingerprint,item.availableQty,item.qty]);
const sameRecipeSnapshot=(left,right)=>{
  const compareNutrition=!!(left?.nutrition&&right?.nutrition);
  const strip=({servings,createdAt,orderId,sourceOrders,nutrition,...snapshot})=>compareNutrition?{...snapshot,nutrition:{...nutrition,generatedAt:undefined}}:snapshot;
  return left?.id===right?.id&&JSON.stringify(strip(left))===JSON.stringify(strip(right));
};
const appendPlannedDish=(items,recipe)=>{
  const index=items.findIndex(item=>sameRecipeSnapshot(item,recipe));
  if(index<0)return [...items,recipe];
  const origins=item=>item.sourceOrders||[{id:item.orderId||null,createdAt:item.createdAt||null,servings:item.servings||1}];
  return items.map((item,position)=>position===index?{...item,servings:(item.servings||1)+(recipe.servings||1),sourceOrders:[...origins(item),...origins(recipe)]}:item);
};
const moveRecipeStep=(draft,from,to)=>{
  const steps=[...draft.steps],stepTimers=draft.steps.map((_,index)=>draft.stepTimers?.[index]??null);
  steps.splice(to,0,steps.splice(from,1)[0]);
  stepTimers.splice(to,0,stepTimers.splice(from,1)[0]??null);
  return {...draft,steps,stepTimers};
};
function unavailableImageCount(value) {
  if (isMissingLocalImage(value)) return 1;
  if (Array.isArray(value)) return value.reduce((count,item)=>count+unavailableImageCount(item),0);
  if (value && typeof value === 'object') return Object.values(value).reduce((count,item)=>count+unavailableImageCount(item),0);
  return 0;
}
function App() {
  const updateRef=useRef(null);
  const [ask, confirmation] = useConfirm();
  const [askClearFridge, clearFridgeConfirmation] = useConfirm();
  const [page, setPage] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 767px), (max-height: 500px) and (max-width: 1024px)").matches);
  const [editingRecipe, setEditingRecipe] = useState(false);
  useEffect(() => {
    if (!editingRecipe || !compact) { setKeyboardOpen(false); return; }
    const viewport = window.visualViewport;
    let fullHeight = viewport?.height ?? window.innerHeight;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      if (height > fullHeight) fullHeight = height;
      setKeyboardOpen(fullHeight - height > 120);
    };
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    update();
    return () => { viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, [editingRecipe, compact]);
  useEffect(() => {
    if (!editingRecipe) return;
    const closeStepActions = event => {
      document.querySelectorAll('.step-actions[open]').forEach(menu => {
        if (!menu.contains(event.target)) menu.open = false;
      });
    };
    document.addEventListener('pointerdown', closeStepActions);
    return () => document.removeEventListener('pointerdown', closeStepActions);
  }, [editingRecipe]);
  const [selectedDay, setSelectedDay] = useState((new Date().getDay() + 6) % 7);
  const [mealSlot, setMealSlot] = useState(null);
  const [mealTargetOpen, setMealTargetOpen] = useState(false);
  const [weekSnapshot, setWeekSnapshot] = useState(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px), (max-height: 500px) and (max-width: 1024px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [syncTarget,setSyncTarget]=useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPage, setSettingsPage] = useState('home');
  useEffect(()=>{if(!showSettings)setSettingsPage('home');},[showSettings]);
  const [recognition,setRecognition]=useState(null);
  const [recognitionImage,setRecognitionImage]=useState('');
  const [recognitionAuto,setRecognitionAuto]=useState(false);
  const fridgeCamera=useRef(null),fridgeAlbum=useRef(null),recipePhotoInput=useRef(null);
  const [readingStockImage,setReadingStockImage]=useState(false);
  const openRecognition=(mode)=>{setRecognitionImage('');setRecognition(mode);setModal('');};
  const returnToPage = () => {
    if (showSettings) {
      if (settingsPage !== 'home') setSettingsPage('home');
      else setShowSettings(false);
    }
    else if(recognition)setRecognition(null);
    else setEditingRecipe(false);
  };
  useBackHandler(showSettings || editingRecipe || !!recognition, returnToPage);
  const [saveStatus, setSaveStatus] = useState("正在加载");
  const [recipes, setRecipes] = useState(initialRecipes);
  const [savedCategories,setSavedCategories]=useState(null);
  const recipeCategories=['全部',...categoryNames(savedCategories,recipes)];
  const [managingCategories,setManagingCategories]=useState(false);
  const categoryScrollTarget=useRef(null);
  useEffect(()=>{if(!managingCategories&&categoryScrollTarget.current){
    const button=[...document.querySelectorAll('.categories [data-category]')].find(e=>e.dataset.category===categoryScrollTarget.current);
    if(button){button.scrollIntoView({block:'nearest'});categoryScrollTarget.current=null;}
  }},[managingCategories]);
  const [fridge, setFridge] = useState([]);
  const [storageRules,setStorageRules]=useState(DEFAULT_STORAGE_RULES);
  const [showStorageRules,setShowStorageRules]=useState(false);
  const [purchased,setPurchased]=useState({});
  const [pendingOrders,setPendingOrders]=useState([]);
  const [purchaseDrafts,setPurchaseDrafts]=useState({});
  const [manualShopping,setManualShopping]=useState([]);
  const [manualDraft,setManualDraft]=useState({id:null,name:'',qty:'',unit:'个',category:'其他',note:'',checked:false,stockOnPurchase:false});
  const [manualSaving,setManualSaving]=useState(false);
  const [legacyDate,setLegacyDate]=useState(today());
  const [basketItem,setBasketItem]=useState(null);
  const [purchaseQuantity,setPurchaseQuantity]=useState('');
  const [purchaseUnit,setPurchaseUnit]=useState('g');
  const [basketSaving,setBasketSaving]=useState(false);
  const basketSaveLock=useRef(false);
  const [menuView,setMenuView]=useState('today');
  const [weekView,setWeekView]=useState('day');
  const [orderSaving,setOrderSaving]=useState(false);
  const orderSaveLock=useRef(false);
  const [menuSaving,setMenuSaving]=useState(false);
  const menuSaveLock=useRef(false);
  // 修改点单只更新 quantities；确认后才更新采购缺口与周菜单素材。
  const [quantities, setQuantities] = useState({});
  const [confirmedQuantities, setConfirmedQuantities] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const startupReported = useRef(false);
  const loadedState = useRef(null);
  const loadFailed = useRef(false);
  useEffect(()=>{if(hydrated)setSavedCategories(current=>{
    const names=categoryNames(current,recipes);
    return JSON.stringify(current)===JSON.stringify(names)?current:names;
  });},[recipes,hydrated]);
  const [weeks, setWeeks] = useState({});
  const [nutritionReports,setNutritionReports]=useState({});
  const [reviewWeek,setReviewWeek]=useState(null);
  const reviewHeading=useRef(null);
  useBackHandler(!!reviewWeek,()=>setReviewWeek(null),1);
  useEffect(()=>{
    if(!reviewWeek)return;
    const origin=document.activeElement;
    reviewHeading.current?.focus();
    return()=>origin?.focus?.();
  },[reviewWeek]);
  const [reminder,setReminder]=useState(null);
  useEffect(()=>{if(!hydrated)return;let active=true,busy=false;
    const refresh=async()=>{if(busy||document.visibilityState!=='visible')return;busy=true;try{const status=await getReminderStatus();if(active)setReminder(status);const target=await consumeReminderLaunch();if(active&&target&&/^\d{4}-\d{2}-\d{2}$/.test(target)&&monday(target)===target)setReviewWeek(target);}catch{if(active)setReminder(null);}finally{busy=false;}};
    refresh();const interval=setInterval(refresh,15000);window.addEventListener('shiguang:reminders',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{active=false;clearInterval(interval);window.removeEventListener('shiguang:reminders',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[hydrated]);
  useEffect(()=>{if(reviewWeek)markWeekReviewed(reviewWeek).catch(()=>toast.error('回顾状态未保存，请重新打开回顾页重试'));},[reviewWeek]);
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

  const [libraryFilter, setLibraryFilter] = useState({category:"全部",time:"all"});
  const [archiveDay,setArchiveDay] = useState(0);
  const fridgeScroll=useRef(0);
  const [detailOrigin,setDetailOrigin] = useState("");
  const [previewImage,setPreviewImage] = useState(false);
  const [category, setCategory] = useState("全部");
  const [search, setSearch] = useState("");
  const pageFilters = useRef({});
  const [modal, setModal] = useState("");
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [archiveDate, setArchiveDate] = useState("");
  useEffect(()=>{if(modal === "history" && !archiveDate){setArchiveDate(Object.keys({...archives,...weeks}).sort().at(-1) || monday(today()));}},[modal,archiveDate,archives,weeks]);
  const [recipeDraft, setRecipeDraft] = useState({
    id: 0,
    name: "",
    category: "素菜",
    time: 15,
    weight: 300,
    ingredients: [ingredient("", 100)],
    steps: [""],
    stepTimers: [null],
  });
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [editingStock,setEditingStock]=useState(null);
  const [stockFilter,setStockFilter]=useState("all");
  const stockRows = fridge.map((stock, index) => ({stock, index, status: stockStatus(stock)}));
  const visibleStock = stockRows.filter(({stock, status}) =>
    (stockFilter === "all" || status.kind === stockFilter) &&
    (category === "全部" || stock.category === category) && stock.name.includes(search.trim())
  ).sort((a, b) => a.status.rank - b.status.rank);
  const expiredCount = stockRows.filter(({status}) => status.kind === "expired").length;
  const soonCount = stockRows.filter(({status}) => status.kind === "soon").length;
  const [stockSaving,setStockSaving]=useState(false);
  const [stockError,setStockError]=useState('');
  const [ingredientDraft, setIngredientDraft] = useState({
    ...ingredient("", 100),
    days: 0,
    date: today(),
  });
  const [draggedStep, setDraggedStep] = useState(0);
  const fullState = {
    recipes,
    recipeCategories:categoryNames(savedCategories,recipes),
    fridge,
    storageRules,
    purchased,
    pendingOrders,
    purchaseDrafts,
    manualShopping,
    qty: quantities,
    confirmed: confirmedQuantities,
    weeks,
    nutritionReports,
    archives,
    confirmedRecipes,
    recipeDraft,
  };
  const latestState=useRef(fullState);latestState.current=fullState;
  const applyState = (state) => {
    setRecipes(state.recipes || initialRecipes);
    setSavedCategories(state.recipeCategories ?? null);
    setFridge(state.fridge || []);
    setStorageRules(state.storageRules ? validateStorageRules(state.storageRules) : DEFAULT_STORAGE_RULES);
    setPurchased(state.purchased || {});
    setPendingOrders(state.pendingOrders || []);
    setPurchaseDrafts(state.purchaseDrafts || {});
    setManualShopping(state.manualShopping || []);
    setQuantities(state.qty || {});
    setConfirmedQuantities(state.confirmed || {});
    setWeeks(state.weeks || {});
    setNutritionReports(state.nutritionReports || {});
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
    if (loadedState.current === null && !loadFailed.current) {
      loadState()
        .then((state) => {
          loadedState.current = state;
          if (state) {
            applyState(state);
            const missing=unavailableImageCount(state);
            if(missing)toast.warning(`${missing} 张图片暂时无法读取，其他数据已加载；替换或移除失效图片后可继续备份与同步`);
          }
          if (active) setHydrated(true);
        })
        .catch((error) => {
          loadFailed.current = true;
          toast.error("读取数据失败：" + error.message);
          setSaveStatus("加载失败，请重启后重试");
        });
    } else if (loadedState.current !== null) setHydrated(true);
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!isNative() || startupReported.current || (!hydrated && !saveStatus.includes("失败"))) return;
    startupReported.current = true;
    window.requestAnimationFrame(() => LocalData.appReady().catch(() => {}));
  }, [hydrated, saveStatus]);
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
    savedCategories,
    fridge,
    storageRules,
    purchased,
    pendingOrders,
    purchaseDrafts,
    manualShopping,
    quantities,
    confirmedQuantities,
    weeks,
    nutritionReports,
    archives,
    confirmedRecipes,
    recipeDraft,
    hydrated,
  ]);
  const navigate = (nextPage) => {
    pageFilters.current[page] = { category, search };
    setShowSettings(false);
    setRecognition(null);
    setMealSlot(null);
    setMealTargetOpen(false);
    setWeekSnapshot(null);
    setDetailOrigin("");
    setPreviewImage(false);
    setPage(nextPage);
    if(nextPage===3)setMenuView('today');
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
  const procurementResult=datedProcurement({
    weeks,pendingOrders,legacyRecipes:confirmedRecipes,legacyQuantities:confirmedQuantities,fridge,
    from:today(),
  });
  const legacyShoppingList=procurementResult.legacyItems;
  const legacyOrders=confirmedRecipes.filter(item=>confirmedQuantities[item.id]>0);
  const allShoppingItems=datedProcurement({weeks,pendingOrders,fridge,from:today()}).items;
  const currentPurchaseFingerprint=item=>{
    const current=allShoppingItems.find(value=>shoppingKey(value)===shoppingKey(item));
    return current?purchaseFingerprint(current):'missing';
  };
  const purchasedKeys=Object.keys(purchaseDrafts).filter(key=>purchaseDrafts[key]?.checked);
  const plannedShoppingList=[...procurementResult.items,...purchasedKeys.filter(key=>!procurementResult.items.some(item=>shoppingKey(item)===key)).map(key=>allShoppingItems.find(item=>shoppingKey(item)===key)||(()=>{const [name,unit]=JSON.parse(key);return {name,unit,category:'其他',qty:0,requiredQty:0,availableQty:0,sources:[],sourceFingerprint:''};})())]
    .filter(item=>item.qty==null || item.qty>0 || purchaseDrafts[shoppingKey(item)]?.qty>0 || purchaseDrafts[shoppingKey(item)]?.checked);
  const shoppingList=[...plannedShoppingList,...manualShopping.map(item=>({...item,manual:true,requiredQty:item.qty,availableQty:0,sources:[]}))];
  const basketKey=item=>item.manual?`manual:${item.id}`:shoppingKey(item);
  const basketDraft=item=>item.manual?item:purchaseDrafts[shoppingKey(item)];
  const remainingShopping=shoppingList.filter(item=>!basketDraft(item)?.checked).length;
  const checkedShopping=shoppingList.filter(item=>basketDraft(item)?.checked);
  const staleCheckedShopping=checkedShopping.filter(item=>!item.manual&&purchaseDrafts[shoppingKey(item)]?.sourceFingerprint!==currentPurchaseFingerprint(item));
  const stockingCount=checkedShopping.filter(item=>!item.manual||item.stockOnPurchase).length;
  const purchaseActionLabel=stockingCount?`确认入库 · ${checkedShopping.length} 项`:`完成采购 · ${checkedShopping.length} 项`;
  const shoppingExportLines=[...shoppingList.flatMap(item=>{
    const draft=basketDraft(item);
    const quantity=draft?.qty??item.qty??'待确认';
    const label=draft?.checked?'已买':item.manual?'还需买':draft?.qty?'拟购买':'还需买';
    return [`${item.name} ${label} ${quantity}${item.unit}${item.manual?` · 手动添加${item.stockOnPurchase?'，买后入库':''}`:''}`,...(item.note?[`  备注：${item.note}`]:[]),...(item.sources||[]).map(source=>`  ${source.date} ${MEALS.find(([key])=>key===source.meal)?.[1]||'待分配'} · ${source.recipeName} ×${source.servings}`)];
  }),...legacyShoppingList.map(item=>`${item.name} ${item.qty??'待确认'}${item.unit} · 旧版待安排采购`)];
  const openPurchaseEditor=item=>{setBasketItem(item);setPurchaseQuantity(String(purchaseDrafts[shoppingKey(item)]?.qty??item.qty??''));setPurchaseUnit(normalizeUnit(item.unit));setModal('purchase-edit');};
  const openManualEditor=item=>{setManualDraft(item?{...item,qty:String(item.qty)}:{id:null,name:'',qty:'',unit:'个',category:'其他',note:'',checked:false,stockOnPurchase:false});setModal('manual-shopping');};
  const saveManualItem=async()=>{
    const name=manualDraft.name.trim(),unit=normalizeUnit(manualDraft.unit),qty=Number(manualDraft.qty),note=manualDraft.note.trim();
    if(!name||!unit||!Number.isFinite(qty)||qty<=0){toast.error('请填写名称、单位和大于 0 的数量');return;}
    if(!stockCategories.includes(manualDraft.category)){toast.error('请选择有效分类');return;}
    const before=latestState.current,existing=before.manualShopping.find(item=>item.id===manualDraft.id);
    const checked=!!existing?.checked&&existing.name===name&&existing.unit===unit&&existing.qty===qty&&!!existing.stockOnPurchase===!!manualDraft.stockOnPurchase;
    const item={id:existing?.id||crypto.randomUUID(),name,qty,unit,category:manualDraft.category,note,checked,stockOnPurchase:!!manualDraft.stockOnPurchase};
    const next=existing?before.manualShopping.map(value=>value.id===item.id?item:value):[...before.manualShopping,item];
    setManualSaving(true);
    try{await saveState({...before,manualShopping:next});setManualShopping(next);setCategory('全部');setModal('');toast.success(existing?'采购项已更新':'已加入菜篮子');}
    catch(error){toast.error('保存采购项失败：'+error.message);}
    finally{setManualSaving(false);}
  };
  const removeManualItem=async()=>{
    if(!manualDraft.id||!(await ask(`移除「${manualDraft.name}」？`,{title:'移除手动采购项？',label:'确认移除',danger:true})))return;
    const before=latestState.current,next=before.manualShopping.filter(item=>item.id!==manualDraft.id);
    setManualSaving(true);
    try{await saveState({...before,manualShopping:next});setManualShopping(next);setModal('');toast.success('采购项已移除');}
    catch(error){toast.error('移除失败：'+error.message);}
    finally{setManualSaving(false);}
  };
  const savePurchaseQuantity=()=>{
    const converted=convertQuantity(purchaseQuantity,purchaseUnit,basketItem.unit);
    const qty=converted==null?NaN:+converted.toFixed(6);
    if(!Number.isFinite(qty)||qty<=0){toast.error('请填写大于 0 的实际购买量');return;}
    const key=shoppingKey(basketItem);
    setPurchaseDrafts(current=>({...current,[key]:{...current[key],qty,checked:current[key]?.checked||false,sourceFingerprint:currentPurchaseFingerprint(basketItem)}}));
    setModal('');toast.success('购买量已保存');
  };
  const togglePurchased=(item,checked)=>{
    if(item.manual){setManualShopping(current=>current.map(value=>value.id===item.id?{...value,checked}:value));return;}
    const key=shoppingKey(item),current=purchaseDrafts[key];
    const qty=current?.qty??item.qty;
    if(checked&&(!Number.isFinite(Number(qty))||Number(qty)<=0)){openPurchaseEditor(item);toast('先填写实际购买量，再勾选已买');return;}
    setPurchaseDrafts(drafts=>({...drafts,[key]:{...drafts[key],qty:Number(qty),checked,sourceFingerprint:checked?currentPurchaseFingerprint(item):drafts[key]?.sourceFingerprint}}));
  };
  const confirmPurchaseReview=async item=>{
    if(basketSaveLock.current)return;
    basketSaveLock.current=true;setBasketSaving(true);
    try{
      const before=latestState.current,key=shoppingKey(item);
      const current=datedProcurement({weeks:before.weeks,pendingOrders:before.pendingOrders,fridge:before.fridge,from:today()}).items.find(value=>shoppingKey(value)===key);
      const nextDrafts={...before.purchaseDrafts,[key]:{...before.purchaseDrafts[key],sourceFingerprint:current?purchaseFingerprint(current):'missing'}};
      await saveState({...before,purchaseDrafts:nextDrafts});
      setPurchaseDrafts(nextDrafts);
      toast.success('购买量已复核');
    }catch(error){toast.error('复核保存失败：'+error.message);}
    finally{basketSaveLock.current=false;setBasketSaving(false);}
  };
  const assignLegacy=async()=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(legacyDate)){toast.error('请选择有效用餐日期');return;}
    if(menuSaveLock.current){toast('菜单正在保存，请稍后重试');return;}
    menuSaveLock.current=true;setMenuSaving(true);
    const before=latestState.current;
    const stamp=new Date().toISOString();
    const additions=before.confirmedRecipes.filter(item=>before.confirmed[item.id]>0).map((item,index)=>({id:`legacy-${stamp}-${index}`,date:legacyDate,createdAt:stamp,recipeSnapshot:structuredClone(item),servings:before.confirmed[item.id]}));
    const next=[...before.pendingOrders,...additions];
    const nextDrafts={...before.purchaseDrafts};
    for(const [key,qty] of Object.entries(before.purchased))if(Number(qty)>0)nextDrafts[key]??={qty:Number(qty),checked:true};
    try{await saveState({...before,pendingOrders:next,purchaseDrafts:nextDrafts,confirmed:{},confirmedRecipes:[],purchased:{}});setPendingOrders(next);setPurchaseDrafts(nextDrafts);setConfirmedQuantities({});setConfirmedRecipes([]);setPurchased({});toast.success('旧版点单已归入指定日期的待分配');}
    catch(error){toast.error('安排失败，旧记录已保留：'+error.message);}
    finally{menuSaveLock.current=false;setMenuSaving(false);}
  };
  const stockPurchased=async()=>{
    if(basketSaveLock.current)return;
    const before=latestState.current;
    const entries=Object.entries(before.purchaseDrafts).filter(([,draft])=>draft?.checked);
    const manualEntries=(before.manualShopping||[]).filter(item=>item.checked);
    if(!entries.length&&!manualEntries.length)return;
    const currentItems=datedProcurement({weeks:before.weeks,pendingOrders:before.pendingOrders,fridge:before.fridge,from:today()}).items;
    if(entries.some(([key,draft])=>{
      const item=currentItems.find(value=>shoppingKey(value)===key);
      return draft.sourceFingerprint!==(item?purchaseFingerprint(item):'missing');
    })){toast.error('采购需求已变化，请逐项复核已买数量后入库');return;}
    basketSaveLock.current=true;setBasketSaving(true);
    try{
      const nextFridge=[...before.fridge,...entries.map(([key,draft],index)=>{
        const [name,unit]=JSON.parse(key);
        const item=allShoppingItems.find(value=>shoppingKey(value)===key);
        return suggestStorage({...ingredient(name,Number(draft.qty),item?.category||'其他',unit),id:`purchase-${Date.now()}-${index}`,date:today()},before.storageRules);
      }),...manualEntries.filter(item=>item.stockOnPurchase).map((item,index)=>suggestStorage({...ingredient(item.name,item.qty,item.category,item.unit),id:`manual-purchase-${Date.now()}-${index}`,date:today()},before.storageRules))];
      const nextDrafts={...before.purchaseDrafts};for(const [key] of entries)delete nextDrafts[key];
      const nextManual=(before.manualShopping||[]).filter(item=>!item.checked);
      await saveState({...before,fridge:nextFridge,purchaseDrafts:nextDrafts,manualShopping:nextManual});
      setFridge(nextFridge);setPurchaseDrafts(nextDrafts);setManualShopping(nextManual);setModal('');
      toast.success(entries.length+manualEntries.filter(item=>item.stockOnPurchase).length?`已入库 ${entries.length+manualEntries.filter(item=>item.stockOnPurchase).length} 项，采购清单已更新`:`已完成 ${manualEntries.length} 项采购`);
    }catch(error){toast.error('入库失败，已买记录保留：'+error.message);}
    finally{basketSaveLock.current=false;setBasketSaving(false);}
  };
  const manualStock=()=>{if(editingStock!==null)setIngredientDraft({...ingredient('',100),days:0,date:today()});setEditingStock(null);setIngredientDraft(current=>suggestStorage(current,storageRules));setStockError('');setModal('stock');};
  async function selectStockImage(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(file.size>10*1024*1024)return toast.error('请选择10MB以内图片');
    setReadingStockImage(true);
    try{const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reader.onabort=()=>reject(new Error('图片读取失败，请重新选择'));reader.readAsDataURL(file);});setRecognitionImage(value);setRecognitionAuto(true);setRecognition('stock');setModal('');}catch(error){toast.error(error.message);}finally{setReadingStockImage(false);}
  }
  const changeQuantity = (recipeId, delta) =>
    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [recipeId]: Math.max(0, (currentQuantities[recipeId] || 0) + delta),
    }));
  const confirmSelection = async () => {
    if (!selectedCount||orderSaveLock.current) return;
    orderSaveLock.current=true;setOrderSaving(true);
    const stamp=new Date().toISOString();
    const date=today();
    const additions=recipes.filter(item=>quantities[item.id]>0).map((item,index)=>({
      id:`${stamp}-${index}`,date,createdAt:stamp,
      recipeSnapshot:structuredClone({...item,nutrition:calculateNutrition(item)}),
      servings:quantities[item.id],
    }));
    const next=[...latestState.current.pendingOrders,...additions];
    try {
      await saveState({...latestState.current,pendingOrders:next});
      setPendingOrders(next);
      setQuantities({});
      setModal("");
      toast.success("已加入当日菜单待分配，采购清单已更新");
    } catch(error) {toast.error('点单保存失败，本次选菜已保留：'+error.message);}
    finally{orderSaveLock.current=false;setOrderSaving(false);}
  };
  const addToMeal = (slot, recipeId) => {
    if(menuSaveLock.current){toast('菜单正在保存，请稍后重试');return;}
    const recipe=recipes.find(item=>item.id===recipeId);
    if (recipe) {
      const stamp=new Date().toISOString();
      const snapshot=structuredClone({...recipe,nutrition:calculateNutrition(recipe)});
      setPlan((currentPlan) => {
        const items = [...(currentPlan[slot] || [])];
        const index = items.findIndex((item) => sameRecipeSnapshot(item,snapshot));
        if (index >= 0)
          items[index] = {
            ...items[index],
            servings: (items[index].servings || 1) + 1,
            sourceOrders:[...(items[index].sourceOrders||[{id:null,createdAt:items[index].createdAt||null,servings:items[index].servings||1}]),{id:crypto.randomUUID(),createdAt:stamp,servings:1}],
          };
        else
          items.push({
            ...snapshot,
            servings: 1,
            createdAt:stamp,
            sourceOrders:[{id:crypto.randomUUID(),createdAt:stamp,servings:1}],
          });
        return { ...currentPlan, [slot]: items };
      });
      toast.success("已安排这道菜");
    }
  };
  const todayDate=today();
  const todayWeek=monday(todayDate);
  const todayIndex=Array.from({length:7},(_,index)=>dayAt(todayWeek,index)).indexOf(todayDate);
  const todayPlan=weeks[todayWeek] || {};
  const todayEntries=[
    ...pendingOrders.filter(order=>order.date===todayDate).map(order=>({id:order.id,meal:null,servings:order.servings,recipe:order.recipeSnapshot})),
    ...Object.entries(todayPlan).filter(([slot])=>Number(slot.split('-')[0])===todayIndex).flatMap(([slot,items])=>items.map((recipe,index)=>({id:`plan:${slot}:${index}`,meal:slot.split('-').slice(1).join('-'),servings:recipe.servings||1,recipe}))),
  ];
  const assignPendingOrder=async(id,meal)=>{
    if(menuSaveLock.current){toast('菜单正在保存，请稍后重试');return;}
    const before=latestState.current;
    const order=before.pendingOrders.find(item=>item.id===id);
    if(!order||!MEALS.some(([key])=>key===meal))return;
    const targetWeek=monday(order.date);
    const day=Array.from({length:7},(_,index)=>dayAt(targetWeek,index)).indexOf(order.date);
    const slot=`${day}-${meal}`,plan=before.weeks[targetWeek]||{};
    const entry={...order.recipeSnapshot,servings:order.servings,orderId:id,createdAt:order.createdAt,sourceOrders:[{id,createdAt:order.createdAt,servings:order.servings}]};
    const items=appendPlannedDish(plan[slot]||[],entry);
    const nextWeeks={...before.weeks,[targetWeek]:{...plan,[slot]:items}};
    const nextPending=before.pendingOrders.filter(item=>item.id!==id);
    menuSaveLock.current=true;setMenuSaving(true);
    try{await saveState({...before,pendingOrders:nextPending,weeks:nextWeeks});setPendingOrders(nextPending);setWeeks(nextWeeks);toast.success('菜品已分配到餐次');return true;}
    catch(error){toast.error('排餐保存失败：'+error.message);return false;}
    finally{menuSaveLock.current=false;setMenuSaving(false);}
  };
  const updateTodayEntry=async(id,changes)=>{
    if(changes.meal&&pendingOrders.some(item=>item.id===id))return assignPendingOrder(id,changes.meal);
    if(menuSaveLock.current){toast('菜单正在保存，请稍后重试');return;}
    const before=latestState.current;
    let nextPending=before.pendingOrders;
    let nextWeeks=before.weeks;
    const order=before.pendingOrders.find(item=>item.id===id);
    let removedRecipe=null,removedSlot=null;
    const snapshot=order?.recipeSnapshot;
    if(order){
      if(changes.remove || changes.meal){
        nextPending=before.pendingOrders.filter(item=>item.id!==id);
        if(changes.meal){
          const slot=`${todayIndex}-${changes.meal}`;
          const current=before.weeks[todayWeek]||{};
          nextWeeks={...before.weeks,[todayWeek]:{...current,[slot]:[...(current[slot]||[]),{...snapshot,servings:order.servings,orderId:id,createdAt:order.createdAt}]}};
        }
      }else if(changes.servings){
        nextPending=before.pendingOrders.map(item=>item.id===id?{...item,servings:changes.servings}:item);
      }
    }else if(id.startsWith('plan:')){
      const match=/^plan:(.+):(\d+)$/.exec(id);
      if(!match)return;
      const [,slot,indexText]=match,index=Number(indexText);
      const current=before.weeks[todayWeek]||{};
      const items=[...(current[slot]||[])];
      const recipe=items[index];if(!recipe)return;
      if(changes.remove){removedRecipe=recipe;removedSlot=slot;}
      if(changes.remove || changes.meal)items.splice(index,1);
      else if(changes.servings)items[index]={...recipe,servings:changes.servings};
      const updated={...current,[slot]:items};
      if(changes.meal){const target=`${todayIndex}-${changes.meal}`;updated[target]=appendPlannedDish(updated[target]||[],recipe);}
      nextWeeks={...before.weeks,[todayWeek]:updated};
    }else return;
    menuSaveLock.current=true;setMenuSaving(true);
    try{
      await saveState({...before,pendingOrders:nextPending,weeks:nextWeeks});
      setPendingOrders(nextPending);setWeeks(nextWeeks);
      if(changes.remove)toast.success('已移除菜品',{duration:5000,action:{label:'撤销',onClick:async()=>{
        if(menuSaveLock.current){toast.error('菜单正在保存，请稍后重试撤销');return;}
        menuSaveLock.current=true;setMenuSaving(true);
        try{const current=latestState.current;
          if(order){const restored=[...current.pendingOrders,order];await saveState({...current,pendingOrders:restored});setPendingOrders(restored);}
          else if(removedRecipe){const plan=current.weeks[todayWeek]||{};const restored={...current.weeks,[todayWeek]:{...plan,[removedSlot]:[...(plan[removedSlot]||[]),removedRecipe]}};await saveState({...current,weeks:restored});setWeeks(restored);}
        }catch(error){toast.error('撤销失败：'+error.message);}
        finally{menuSaveLock.current=false;setMenuSaving(false);}
      }}});
      else toast.success('当日菜单已更新');
    }catch(error){toast.error('菜单保存失败：'+error.message);}
    finally{menuSaveLock.current=false;setMenuSaving(false);}
  };
  const filteredRecipes = recipes.filter(
    (recipe) =>
      (page === 1 ? (libraryFilter.category === "全部" || (recipe.category?.trim() || '未分类') === libraryFilter.category) && matchesRecipeTime(recipe.time, libraryFilter.time) : category === "全部" || (recipe.category?.trim() || '未分类') === category) &&
      (recipe.name.includes(search.trim()) || recipe.ingredients.some(item => item.name.includes(search.trim()))) &&
      (!selectedIngredients.length ||
        selectedIngredients.every((ingredientName) =>
          recipe.ingredients.some((item) => ingredientKey(item.name) === ingredientKey(ingredientName)),
        )),
  );
  const saveRecipe = async () => {
    if (recipeSaving) return;
    if (
      !recipeDraft.name.trim() ||
      !recipeDraft.ingredients.length ||
      !recipeDraft.steps.length ||
      recipeDraft.ingredients.some(
        (item) =>
          !item.name.trim() ||
          (item.qty !== "" && item.qty != null && item.qty <= 0),
      ) ||
      recipeDraft.steps.some((step) => !step.trim()) ||
      recipeDraft.stepTimers?.some(value=>value!=null&&(!Number.isInteger(value)||value<1||value>999))
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
      stepTimers: recipeDraft.steps.map((_,index)=>recipeDraft.stepTimers?.[index]||null),
      category:recipeDraft.category?.trim() || '未分类',
      name: recipeDraft.name.trim(),
      id: recipeDraft.id || Date.now(),
      ingredients: recipeDraft.ingredients.map((item) => ({
        ...item,
        name: item.name.trim(),
        unit: item.unit.trim() === "克" ? "g" : item.unit.trim(),
        qty: item.qty === "" ? null : item.qty,
      })),
    };
    savedRecipe.nutrition=calculateNutrition(savedRecipe);
    const nextRecipes =
      recipeDraft.id
        ? recipes.map((item) =>
            item.id === recipeDraft.id ? savedRecipe : item,
          )
        : [...recipes, savedRecipe];
    const emptyDraft = {
      id: 0,
      name: "",
      category: recipeCategories.includes('素菜') ? '素菜' : '未分类',
      time: 15,
      weight: 300,
      ingredients: [ingredient("", 100)],
      steps: [""],
      stepTimers: [null],
    };
    setRecipeSaving(true);
    try {
      await saveState({...latestState.current, recipes: nextRecipes, recipeDraft: emptyDraft});
      setRecipes(nextRecipes);
      if (JSON.stringify(latestState.current.recipeDraft) === JSON.stringify(recipeDraft)) {
        setRecipeDraft(emptyDraft);
        pageFilters.current[0] = { category: "全部", search: "" };
        navigate(0);
        toast.success(recipeDraft.id ? "菜谱已更新，已确认采购与菜单快照保留" : "菜谱已保存到点单选菜");
      } else {
        toast.success("菜谱已保存，保存期间的后续修改仍在草稿中");
      }
    } catch (error) {
      toast.error("菜谱保存失败，草稿已保留：" + error.message);
    } finally {
      setRecipeSaving(false);
    }
  };
  const editRecipe = async (recipe) => {
    if (recipeSaving) return;
    const draft = latestState.current.recipeDraft;
    if (draft.id !== recipe.id) {
      const original = draft.id ? recipes.find(item => item.id === draft.id) : {
        id: 0, name: "", category: recipeCategories.includes('素菜') ? '素菜' : '未分类',
        time: 15, weight: 300, ingredients: [ingredient("", 100)], steps: [""], stepTimers:[null],
      };
      if (JSON.stringify(draft) !== JSON.stringify(original) &&
          !(await ask("当前编辑草稿尚未保存，切换菜谱会放弃这份草稿。", {title: "放弃当前草稿？", label: "放弃并编辑"}))) return;
      setRecipeDraft(structuredClone(recipe));
    }
    setModal("");
    navigate(1);
    setEditingRecipe(true);
  };
  const saveIngredient = async () => {
    if(stockSaving)return;
    setStockError('');
    try {
      const value={...ingredientDraft,name:ingredientDraft.name.trim(),unit:normalizeUnit(ingredientDraft.unit),qty:Number(ingredientDraft.qty),days:Number(ingredientDraft.days||0),date:ingredientDraft.date||today()};
      validateStock(value);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value.date))throw new Error('请填写有效入库日期');
      setStockSaving(true);
      const next=editingStock===null?[...fridge,value]:fridge.map((item,index)=>index===editingStock?value:item);
      await saveState({...latestState.current,fridge:next});
      setFridge(next);setModal('');setEditingStock(null);
      setIngredientDraft({...ingredient('',100),days:0,date:today()});
      toast.success('食材已保存');
    }catch(error){setStockError(error.message||'保存失败，输入已保留');}
    finally{setStockSaving(false);}
  };
  const clearFridge = async () => {
    if(stockSaving || !fridge.length)return;
    const before=latestState.current;
    if(!(await askClearFridge(`将删除冰箱内全部 ${before.fridge.length} 批库存，包括筛选后未显示的食材。采购缺口将重新计算；菜谱、已确认菜品和历史菜单保留。此操作无法撤销。`,{title:'清空整个冰箱？',label:'确认清空冰箱',danger:true})))return;
    if(JSON.stringify(latestState.current)!==JSON.stringify(before)){toast.error('数据已变化，请重新确认清空');return;}
    setStockSaving(true);
    try {
      await saveState({...before,fridge:[]});
      if(JSON.stringify(latestState.current)!==JSON.stringify(before)){await saveState(latestState.current);throw new Error('数据已变化，已保留库存，请重试');}
      setFridge([]);setSearch('');setCategory('全部');setStockFilter('all');
      toast.success('冰箱已清空，采购缺口已更新');
    }catch(error){toast.error('清空失败：'+error.message);}
    finally{setStockSaving(false);}
  };
  const exportShoppingList = async (format) => {
    const t = shoppingExportLines;
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
      t.forEach((e, t) => r.fillText(e, 50, 145 + t * 60,700));
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
  if (!hydrated) return saveStatus.includes("失败") && <main className="app-load-error" role="alert"><p>{saveStatus}</p><p>数据读取完成后才能编辑。</p><button className="primary" onClick={() => window.location.reload()}>重新加载</button></main>;
  const exportActions = <>
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
                  const e = shoppingExportLines.join("\n");
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
  </>;
  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "224px",
      }}
    >
      <Sidebar className="app-sidebar">
        <SidebarHeader>
          <div className="brand">
            <img className="brand-logo" src="/brand/mark.svg" alt=""/>
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
            <img className="brand-logo" src="/brand/mark.svg" alt="食光"/>
            <div>
              我的小厨房<small>数据保存在本机</small>
            </div>
            <Heart size={17} />
          </div>
        </SidebarFooter>
      </Sidebar>
      <main inert={!!reviewWeek} className={`main ${compact ? "compact-app" : ""} ${page === 0 && !showSettings && !recognition ? "order-page" : ""}`}>
        <header className="topbar">
          {compact && <>
            <div className="mobile-title">
              {showSettings || editingRecipe || recognition ? <button className="mobile-icon" aria-label="返回" onClick={returnToPage}><ArrowLeft size={22} /></button> : <img className="brand-logo" src="/brand/mark.svg" alt=""/>}
              <h1>{showSettings ? ({ai:'AI 配置',backup:'备份恢复',sync:'坚果云同步',reminders:'营养周报提醒',update:'版本更新'}[settingsPage]||"设置与数据") : recognition ? ({"recipe-import":"导入菜谱",stock:"拍照识别"}[recognition]) : editingRecipe ? (recipeDraft.id ? "编辑菜谱" : "新建菜谱") : ["点单", "菜谱", "菜篮子", "周菜单", "冰箱"][page]}</h1>
              {page === 1 && !showSettings && !recognition && !editingRecipe && <span className="library-total">{filteredRecipes.length} 道</span>}
              {page === 4 && !showSettings && !recognition && <span className="fridge-total">{fridge.length} 批食材</span>}
              <span role="status" className={saveStatus.includes("失败") ? "mobile-save-error" : "sr-only"}>{saveStatus}</span>
            </div>
            <div className="mobile-header-actions">
              {!showSettings && !recognition && !editingRecipe && page === 0 && <button className="mobile-icon" aria-label="设置与备份" onClick={() => setShowSettings(true)}><Settings2 size={22} /></button>}
              {!showSettings && !recognition && !editingRecipe && page === 4 && <button className="mobile-icon" aria-label="保质期规则" disabled={!hydrated} onClick={()=>setShowStorageRules(true)}><Settings2 size={22}/></button>}
              {!showSettings && !recognition && !editingRecipe && page === 1 && <button onClick={() => openRecognition("recipe-import")}><Upload size={18} />导入菜谱</button>}
              {!showSettings && !recognition && editingRecipe && page === 1 && <button className="editor-import-action" onClick={() => openRecognition("recipe-import")}>导入菜谱</button>}
              {!showSettings && page === 3 && menuView==='week' && <button onClick={() => setMealTargetOpen(true)}><Plus size={18} />安排菜品</button>}
              {!showSettings && page === 2 && <><button onClick={() => openManualEditor()}><Plus size={18} />手动添加</button><button disabled={!shoppingList.length&&!legacyShoppingList.length} onClick={() => setModal("export")}><Download size={18} />导出</button></>}
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
              page={settingsPage}
              onPageChange={setSettingsPage}
              onCheckUpdate={()=>updateRef.current?.check()}
              onSyncTarget={setSyncTarget}
              state={fullState}
              onRestore={restoreState}

            />
          )}

          {recognition&&!showSettings&&<RecognitionPanel storageRules={storageRules} key={recognition} mode={recognition} initialImage={recognitionImage} autoStart={recognitionAuto} onAutoStart={()=>setRecognitionAuto(false)} onManual={()=>{setRecognition(null);setEditingRecipe(true);}} onSettings={()=>{setRecognitionImage('');setSettingsPage('ai');setShowSettings(true);}}
            onImportRecipes={async items=>{const next=[...latestState.current.recipes,...items.map(item=>({...item,nutrition:calculateNutrition(item)}))];await saveState({...latestState.current,recipes:next});setRecipes(next);}}
            onImportStock={async items=>{const next=[...latestState.current.fridge,...items];await saveState({...latestState.current,fridge:next});setFridge(next);}}/>}
          <input ref={fridgeCamera} type="file" accept="image/*" capture="environment" aria-label="冰箱拍摄图片" hidden onChange={selectStockImage}/>
          <input ref={fridgeAlbum} type="file" accept="image/*" aria-label="冰箱相册图片" hidden onChange={selectStockImage}/>
          {!showSettings && !recognition && <>
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
                    "根据日期排单与冰箱库存，自动整理食材缺口。",
                    "拖动菜品到对应餐次，也可以先选菜，再点击空格。",
                    "记录每一份新鲜，让家里的食材物尽其用。",
                  ][page]
                }
              </p>
            </div>
            {page !== 4 && <button
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
            </button>}
          </div>
          {page === 0 && (
            <>
              {compact && <label className="search mobile-search library-search"><Search size={18}/><input aria-label="搜索菜品" placeholder="搜索菜名或食材" value={search} onChange={event => setSearch(event.target.value)} /></label>}
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
                      data-category={categoryName}
                      onClick={() => {setCategory(categoryName);document.querySelector('.recipe-section')?.scrollTo({top:0});}}
                    >
                      {!compact && <span>{["✦", "☀", "❀", "♨", "◡", "≈", "♡"][index] || '◇'}</span>}
                      <span className="category-name">{categoryName}</span>
                    </button>
                  ))}
                  <button className="manage-categories" onClick={()=>setManagingCategories(true)}>管理分类</button>
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
                          {hasUsableImage(recipe.image) ? (
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
                                        ingredientKey(stock.name) === ingredientKey(item.name) &&
                                        comparableUnit(stock.unit) === comparableUnit(item.unit),
                                    )
                                    .reduce(
                                      (sum, stock) => sum + convertQuantity(stock.qty,stock.unit,item.unit),
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
                                className={`plus ${quantities[recipe.id] ? 'is-selected' : ''}`}
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

                </section>
              </div>
              {(!compact || selectedCount > 0) && <div className="selection-bar">
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
                    <small>查看本次点单，确认后在当日菜单分配餐次</small>
                  </div>
                </button>
                <button
                  className="primary"
                  onClick={() => setModal("selection")}
                  disabled={!selectedCount}
                >
                  {"确认选菜 "}
                  <ArrowRight size={18} />
                </button>
              </div>}
            </>
          )}
          {page === 2 && (
            <>
              <div className="section-tools">
                <h2>
                  {"还需买 "}
                  <span>
                    {remainingShopping}
                    {` / ${shoppingList.length} 项`}
                  </span>
                </h2>
                <div className="basket-list-actions"><button type="button" className="outline" onClick={() => openManualEditor()}><Plus size={17} />手动添加</button><button
                    className="primary"
                    disabled={!shoppingList.length&&!legacyShoppingList.length}
                    onClick={() => setModal("export")}
                  ><Download size={17} />预览与导出</button></div>
              </div>
              {!!checkedShopping.length&&<button type="button" className="primary basket-stock-action" onClick={()=>setModal('purchase-stock')}>{purchaseActionLabel}</button>}
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
                    <article key={basketKey(item)} className={`stock-card shopping-card ${basketDraft(item)?.checked?'is-purchased':''}`}>
                      <label className="shopping-check"><input type="checkbox" aria-label={`已买${item.name}（${item.unit}）`} checked={!!basketDraft(item)?.checked} onChange={event=>togglePurchased(item,event.target.checked)}/><span className="sr-only">已买</span></label>
                      <h3><button type="button" className="basket-name" aria-label={item.manual?`编辑${item.name}手动采购项`:`编辑${item.name}购买量与来源`} onClick={()=>item.manual?openManualEditor(item):openPurchaseEditor(item)}>{item.name}<span aria-hidden="true"> ›</span></button></h3>
                      <button type="button" className="basket-quantity" aria-label={item.manual?`编辑${item.name}手动采购项数量`:`修改${item.name}实际购买量`} onClick={()=>item.manual?openManualEditor(item):openPurchaseEditor(item)}>
                        <span>{basketDraft(item)?.checked?'已买 ':basketDraft(item)?.qty?'拟买 ':''}{basketDraft(item)?.qty??item.qty??"待确认"} <small>{item.unit}</small></span>
                      </button>
                      <p className="shopping-category">{item.category}</p>
                      {item.manual&&(item.note||item.stockOnPurchase)&&<p className="shopping-stock-note">{item.note?`备注：${item.note}`:'买后入库'}</p>}
                      {!item.manual&&item.qty == null && <p className="shopping-stock-reason"><span>请核对所需用量</span></p>}
                      {!item.manual&&!!purchaseDrafts[shoppingKey(item)]?.qty&&purchaseDrafts[shoppingKey(item)].sourceFingerprint!==currentPurchaseFingerprint(item)&&<p className="shopping-stock-reason" role="status"><span>排单或库存已变化，请复核购买量</span></p>}
                    </article>
                  ))}
              </div>
              {!shoppingList.length && (
                <div className="empty">
                  <Check size={40} />
                  <h2>{pendingOrders.length||Object.keys(weeks).length ? "所需食材已备齐" : "菜篮子空空的"}</h2>
                  <p>{pendingOrders.length||Object.keys(weeks).length ? "当前排单无需补充采购。" : "先去选菜或安排周菜单，缺少的食材会出现在这里。"}</p>
                  <button className="primary" onClick={() => navigate(0)}>
                    去选菜
                  </button>
                </div>
              )}
              {!!shoppingList.length && !shoppingList.some(item => category === "全部" || item.category === category) && <div className="empty">这个分类没有需要采购的食材。</div>}
              {!!legacyOrders.length&&<details className="basket-legacy"><summary>旧版待安排菜品 · {legacyOrders.length} 道</summary><p>旧版点单没有用餐日期，不会自动归入今天。选定日期后，原菜品会进入该日待分配。</p>{legacyOrders.map(item=><p key={item.id}>{item.name} ×{confirmedQuantities[item.id]}</p>)}{!legacyShoppingList.length&&<p>当前食材已备齐，无需采购。</p>}<label>用餐日期 <DateTimePicker type="date" value={legacyDate} onChange={event=>setLegacyDate(event.target.value)}/></label><button type="button" className="outline" disabled={menuSaving} onClick={assignLegacy}>归入指定日期</button></details>}
              </section>
              </div>
            </>
          )}
          {page === 3 && (
            <>
              <div className="menu-view-tabs" role="tablist" aria-label="菜单视图"><button type="button" role="tab" aria-selected={menuView==='today'} onClick={()=>setMenuView('today')}>当日菜单</button><button type="button" role="tab" aria-selected={menuView==='week'} onClick={()=>setMenuView('week')}>周菜单</button></div>
              {menuView==='today'?<TodayMenu date={todayDate} entries={todayEntries} saving={menuSaving} onAssign={assignPendingOrder} onRemove={id=>updateTodayEntry(id,{remove:true})} onChangeMeal={(id,meal)=>updateTodayEntry(id,{meal})} onChangeServings={(id,servings)=>updateTodayEntry(id,{servings})}/>:<>
              {compact ? <MobileWeek slot={mealSlot} setSlot={setMealSlot} onHistory={()=>setModal("history")} onReview={()=>setReviewWeek(week)} week={week} setWeek={setWeek} day={selectedDay} setDay={setSelectedDay} plan={plan} setPlan={setPlan} recipes={recipes} findRecipe={findRecipe} addToMeal={addToMeal} onSelectRecipes={() => navigate(0)} view={weekView} onViewChange={setWeekView} pendingOrders={pendingOrders} onAssignPending={assignPendingOrder} saving={menuSaving}/> : <>
              <div className="panel">
                <div className="section-tools">
                  <h2>待安排的美味</h2>
                  <span className="subtle">
                    可重复安排 · 首次安排为一份 · 可调整份数
                  </span>
                </div>
                <div className="chip-row">
                  {recipes
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
                {!recipes.length && (
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
                  <DateTimePicker aria-label="当前周"
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
                  <div className="day-head">一周五餐</div>
                  {["一", "二", "三", "四", "五", "六", "日"].map((e, t) => (
                    <div key={e} className="day-head">
                      周{e}
                      <small>{dayAt(week, t).slice(5)}</small>
                    </div>
                  ))}
                  {MEALS.map(([e,mealName]) => (
                    <div key={e} className="week-row">
                      <div className="meal-label">
                        {mealName}
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
                                const dragged=event.dataTransfer.getData("text/plain");
                                const recipe=recipes.find(item=>String(item.id)===dragged);
                                if(recipe)addToMeal(r,recipe.id);
                              }}
                            >
                              {(plan[r] || []).map((e, t) => (
                                <div key={t} className={"planned " + "low"}>
                                  <span>{findRecipe(e)?.name || "菜谱内容已缺失"}</span>
                                  <button type="button" className="text-link" aria-label={`查看${findRecipe(e)?.name || '缺失菜谱'}做法`} onClick={() => setWeekSnapshot(findRecipe(e) || {name: "菜谱内容已缺失"})}>查看做法</button>
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
              {!compact&&<NutritionReviewButton onClick={()=>setReviewWeek(week)}/>}
              <div className="week-footer-actions">
                <button className="text-link" onClick={()=>setModal('history')}><CalendarDays size={16}/>历史</button>
                <button className="text-link" onClick={() => setModal("clear")}>
                  <Trash2 size={16} />
                  清空本周
                </button>
              </div>
              </>}
            </>
          )}
          {page === 4 && (
            <>
              <div className="search mobile-search library-search fridge-search-row">
                <Search size={18}/><input aria-label="搜索冰箱食材" placeholder="搜索食材" value={search} onChange={event => setSearch(event.target.value)}/>
                <FridgeFilters categories={stockCategories} category={category} status={stockFilter} onChange={next=>{setCategory(next.category);setStockFilter(next.status);}}/>
              </div>
              <div className="stock-add-actions">
                <button type="button" className="outline" disabled={readingStockImage} onClick={()=>fridgeAlbum.current.click()}><ImagePlus size={18}/>相册选择</button>
                <button type="button" className="outline" disabled={readingStockImage} onClick={()=>fridgeCamera.current.click()}><Camera size={18}/>拍摄</button>
                <button type="button" className="outline" onClick={manualStock}><Plus size={18}/>手动添加</button>
              </div>

              {readingStockImage&&<p role="status">正在读取图片…</p>}
              {!compact && <div className="stock-summary"><span>共 {fridge.length} 批食材</span></div>}
              <div className="stock-layout">
              <section className="stock-results">
              <div className="stock-grid stock-list">
                {visibleStock.map(({stock,index,status})=>{
                  return <button key={stock.id||index} className={`stock-compact-row ${status.kind}`} onClick={()=>{setEditingStock(index);setIngredientDraft({...stock});setStockError('');setModal('stock');}}>
                    <strong>{stock.name}</strong><span>{stock.category||'其他'}</span><span>{stock.qty} {stock.unit}</span>
                    <span className="stock-status">{status.label}</span>
                  </button>;
                })}
              </div>
              {!visibleStock.length && <div className="empty"><p>{fridge.length ? "没有符合当前搜索和筛选条件的食材。" : "冰箱里还没有食材。"}</p>{!!fridge.length && <button className="text-link" onClick={()=>{setSearch('');setCategory('全部');setStockFilter('all');}}>清除筛选</button>}</div>}
              {(expiredCount > 0 || soonCount > 0) && <p role="status" className="stock-risk-summary">⚠ {expiredCount > 0 && <strong>{expiredCount} 批过期 </strong>}{soonCount > 0 && <span>{soonCount} 批临期</span>}</p>}

              <div className="stock-bottom-actions">
                <button className="primary stock-recommend-entry" disabled={!fridge.length || stockSaving} onClick={()=>setModal('fridge-recipes')}>看看能做什么<ArrowRight size={17}/></button>
                <button className="outline stock-clear-entry" disabled={!fridge.length || stockSaving} onClick={clearFridge}>{stockSaving?'正在保存…':'一键清空'}</button>
              </div>
              </section>
              </div>
            </>
          )}
          {page === 1 && !editingRecipe && <section className="recipe-library">
            <div className="library-tools">
              <div className="search library-search"><Search size={18}/><input aria-label="搜索我的菜谱" placeholder="搜索菜名或食材" value={search} onChange={event => setSearch(event.target.value)}/><RecipeFilters categories={["全部",...new Set([...recipeCategories.filter(c=>c!=="全部"),...recipes.map(r=>r.category).filter(Boolean)])]} value={libraryFilter} onChange={setLibraryFilter}/></div>
              {!compact && <button className="outline" onClick={() => openRecognition("recipe-import")}><Upload size={18}/>导入菜谱</button>}
            </div>
            <h2>我的菜谱 <small>{filteredRecipes.length} 道</small></h2>
            {filteredRecipes.map(recipe => <button key={recipe.id} className="library-recipe" onClick={() => {setActiveRecipe(recipe);setModal("detail");}}>
              {hasUsableImage(recipe.image) ? <img src={recipe.image} alt=""/> : <span className="library-placeholder" aria-hidden="true">{recipe.name.trim().slice(0,2)||'菜'}</span>}
              <span><strong>{recipe.name}</strong><small>{recipe.category}{recipe.time ? ` · ${recipe.time} 分钟` : ""}</small></span><ArrowRight size={18}/>
            </button>)}
            {!filteredRecipes.length && <div className="empty">没有找到符合条件的菜谱。<button className="text-link" onClick={()=>{setSearch("");setLibraryFilter({category:"全部",time:"all"});}}>清除搜索与筛选</button></div>}
          </section>}
          {page === 1 && editingRecipe && (
            <div className="editor-layout">
              <section className="panel editor" aria-busy={recipeSaving} inert={recipeSaving}>
                {!compact && <button className="text-link" onClick={() => setEditingRecipe(false)}><ArrowLeft size={18}/>返回我的菜谱（保留草稿）</button>}
                <div className="section-tools">
                  <h2>{recipeDraft.id ? "编辑菜谱" : "新建菜谱"}</h2>
                  {!compact && <button
                    className="outline"
                    onClick={() => openRecognition("recipe-import")}
                  >
                    <Upload size={16} />
                    导入菜谱
                  </button>}
                </div>
                <button type="button" className="photo-upload" onClick={()=>recipePhotoInput.current.click()}>
                  {hasUsableImage(recipeDraft.image) ? <><img src={recipeDraft.image} alt="菜谱图片预览"/><span>更换菜谱图片</span></> : <><Plus size={25} aria-hidden="true"/><span>添加菜谱图片</span><small>点击从相册选择，可选</small></>}
                </button>
                <input
                  ref={recipePhotoInput}
                  hidden
                  aria-label="菜谱图片"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () =>
                      setRecipeDraft((draft) => ({...draft, image: reader.result}));
                    reader.onerror = () => toast.error("图片读取失败");
                    reader.readAsDataURL(file);
                  }}
                />
                {isMissingLocalImage(recipeDraft.image)&&<p role="status">原图片暂时无法读取；可重新选择图片替换，文字草稿已保留。</p>}
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
                  <div className="recipe-category-picker">
                    <span>分类</span>
                    <div className="category-suggestions" role="group" aria-label="菜谱分类">
                      {[...new Set([...recipeCategories.slice(1), recipeDraft.category].filter(Boolean))].map((categoryName) => (
                        <button type="button" key={categoryName} aria-pressed={recipeDraft.category === categoryName} onClick={() => setRecipeDraft(draft => ({...draft, category: categoryName}))}>{categoryName}</button>
                      ))}
                    </div>
                  </div>
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
                <div className="recipe-steps-table"><div className="recipe-steps-head"><span>步骤内容</span><span>计时</span><span>操作</span></div>
                {recipeDraft.steps.map((step, index) => (
                  <div className="recipe-step-editor" key={index}
                    draggable
                    onDragStart={() => setDraggedStep(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => setRecipeDraft((draft) => moveRecipeStep(draft,draggedStep,index))}
                  >
                    <div className="step-content">
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
                    </div>
                    <div className="step-duration">{recipeDraft.stepTimers?.[index] != null ? <label><input autoFocus={recipeDraft.stepTimers[index]===''} type="number" min="1" max="999" step="1" inputMode="numeric" aria-label={`步骤${index+1}计时分钟`} value={recipeDraft.stepTimers[index]} onChange={event=>setRecipeDraft(draft=>({...draft,stepTimers:draft.steps.map((_,timerIndex)=>timerIndex===index?(event.target.value===''?'':Number(event.target.value)):draft.stepTimers?.[timerIndex]??null)}))} onBlur={event=>{if(event.target.value==='')setRecipeDraft(draft=>({...draft,stepTimers:draft.steps.map((_,timerIndex)=>timerIndex===index?null:draft.stepTimers?.[timerIndex]??null)}));}}/><small>分</small></label> : <button type="button" aria-label={`为步骤${index+1}添加计时`} onClick={()=>setRecipeDraft(draft=>({...draft,stepTimers:draft.steps.map((_,timerIndex)=>timerIndex===index?'':draft.stepTimers?.[timerIndex]??null)}))}>＋ 计时</button>}</div>
                    <details className="step-actions" onToggle={event=>{if(event.currentTarget.open)document.querySelectorAll('.step-actions[open]').forEach(menu=>{if(menu!==event.currentTarget)menu.open=false;});}}><summary aria-label={`步骤${index+1}操作`}>⋯</summary><div onClick={event=>{if(event.target.closest('button'))event.currentTarget.parentElement.open=false;}}>
                      <button
                        type="button"
                        aria-label={"上移步骤" + (index + 1)}
                        disabled={index === 0}
                        onClick={() => setRecipeDraft((draft) => moveRecipeStep(draft,index,index-1))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={"下移步骤" + (index + 1)}
                        disabled={index === recipeDraft.steps.length - 1}
                        onClick={() => setRecipeDraft((draft) => moveRecipeStep(draft,index,index+1))}
                      >
                        ↓
                      </button>
                    <button
                      type="button"
                      aria-label="删除步骤"
                      onClick={() =>
                        setRecipeDraft((draft) => ({
                          ...draft,
                          steps: draft.steps.filter(
                            (_step2, _index6) => _index6 !== index,
                          ),
                          stepTimers: (draft.stepTimers||[]).filter((_,timerIndex)=>timerIndex!==index),
                        }))
                      }
                    >
                      ×
                    </button>
                    {recipeDraft.stepTimers?.[index] != null && <button type="button" aria-label={`移除步骤${index+1}计时`} onClick={()=>setRecipeDraft(draft=>({...draft,stepTimers:draft.steps.map((_,timerIndex)=>timerIndex===index?null:draft.stepTimers?.[timerIndex]??null)}))}>移除计时</button>}
                    </div></details>
                  </div>
                ))}
                </div>
                <div className="step-add-actions"><button className="outline" onClick={() => setRecipeDraft(draft=>({...draft,steps:[...draft.steps,''],stepTimers:[...(draft.stepTimers||[]),null]}))}>＋ 添加步骤</button><button className="outline" disabled={!recipeDraft.steps.length||recipeDraft.stepTimers?.[recipeDraft.steps.length-1]!=null} onClick={()=>setRecipeDraft(draft=>({...draft,stepTimers:draft.steps.map((_,index)=>index===draft.steps.length-1?'':draft.stepTimers?.[index]??null)}))}>＋ 添加时间</button></div>
                <details className="recipe-nutrition-tools"><summary>高级计算</summary><RecipeNutrition recipe={recipeDraft} onChange={setRecipeDraft}/></details>

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
        {page === 1 && editingRecipe && !recognition && !showSettings && !keyboardOpen && <footer className="editor-save-bar"><button className="primary save-recipe" disabled={recipeSaving} onClick={saveRecipe}><Check size={17}/>{recipeSaving ? "正在保存…" : "确认保存到菜品库"}</button></footer>}
        <footer className="site-footer">
          {"食光 SHIGUANG "}
          <span>一餐一饭，皆是生活。</span>
        </footer>
      </main>
      <AppUpdate ref={updateRef}/>
      {managingCategories && <CategoryManager names={recipeCategories.slice(1)} recipes={recipes} onClose={()=>setManagingCategories(false)} onChange={(action,source,target)=>{
        const next=changeCategory(latestState.current,action,source,target);
        setSavedCategories(next.recipeCategories);setRecipes(next.recipes);
        if(next.recipeDraft)setRecipeDraft(next.recipeDraft);
        const destination=target.trim();
        if(action==='add'){setCategory(destination);categoryScrollTarget.current=destination;}
        else {
          if(category===source)setCategory(destination);
          if(libraryFilter.category===source)setLibraryFilter(current=>({...current,category:destination}));
          for(const filters of Object.values(pageFilters.current))if(filters.category===source)filters.category=destination;
          categoryScrollTarget.current=destination;
        }
        toast.success(action==='delete'?'分类已删除，菜谱已转移':action==='rename'?'分类已重命名':'分类已添加');
      }}/>}
      {showStorageRules&&<StorageRules value={storageRules} onClose={()=>setShowStorageRules(false)} onSave={async rules=>{
        validateStorageRules(rules);
        await saveState({...latestState.current,storageRules:rules});
        setStorageRules(rules);toast.success('保质期规则已保存');
      }}/>}
      {compact && !editingRecipe && !recognition && !showSettings && !reviewWeek && <nav className="mobile-bottom-nav" aria-label="主导航">
        {[[0,"点单",Utensils],[4,"冰箱",Refrigerator],[2,"菜篮子",ShoppingBasket],[3,"菜单",CalendarDays],[1,"菜谱",BookOpen]].map(([index,label,Icon]) => <button key={index} aria-current={page === index && !showSettings ? "page" : undefined} onClick={() => navigate(index)}><span><Icon size={22}/></span>{label}</button>)}
      </nav>}
      {!reviewWeek&&reminder?.settings.inApp&&reminder.pendingWeek&&<aside className="reminder-banner" role="status"><span>{reminder.pendingWeek} 起这一周的菜单营养待回顾</span><button className="text-link" onClick={()=>setReviewWeek(reminder.pendingWeek)}>查看营养回顾</button></aside>}
      {reviewWeek&&<section className="nutrition-page" aria-label="菜单营养回顾">
        <div className="nutrition-page-shell">
          <header className="nutrition-page-header"><button type="button" className="mobile-icon" aria-label="返回周菜单" onClick={()=>setReviewWeek(null)}><ArrowLeft size={22}/></button><h1 ref={reviewHeading} tabIndex={-1}>菜单营养回顾</h1></header>
          <div className="nutrition-page-body">
          {reviewWeek&&<NutritionPanel key={reviewWeek} week={reviewWeek} plan={weeks[reviewWeek]||{}} report={nutritionReports[reviewWeek]}
            onSavePlan={async(next,expected)=>{if(weekNutritionInput(latestState.current.weeks[reviewWeek]||{})!==expected)throw new Error('菜单已改变，请重试');const before=structuredClone(latestState.current),updated={...before.weeks,[reviewWeek]:next};await saveState({...before,weeks:updated});if(JSON.stringify(latestState.current)!==JSON.stringify(before)){await saveState(latestState.current);throw new Error('保存期间数据已改变，请重试；本地修改保留');}setWeeks(updated);}}
            onSaveReport={async report=>{if(weekNutritionInput(latestState.current.weeks[reviewWeek]||{})!==report.inputFingerprint)throw new Error('菜单已改变，请重新生成');const before=structuredClone(latestState.current),updated={...before.nutritionReports,[reviewWeek]:report};await saveState({...before,nutritionReports:updated});if(JSON.stringify(latestState.current)!==JSON.stringify(before)){await saveState(latestState.current);throw new Error('保存期间数据已改变，请重试；原报告保留');}setNutritionReports(updated);}}/>}
          </div>
        </div>
      </section>}
      <Dialog open={mealTargetOpen} onOpenChange={setMealTargetOpen}>
        <DialogContent layout="page" className="app-dialog meal-picker-dialog">
          <DialogTitle>安排哪一餐</DialogTitle>
          <DialogDescription>{dayAt(week, selectedDay)} · 选择目标餐次</DialogDescription>
          {MEALS.map(([key, name]) => <button type="button" className="meal-picker-row" key={key} onClick={() => {setMealSlot(`${selectedDay}-${key}`);setMealTargetOpen(false);}}>{name}<ArrowRight size={18}/></button>)}
        </DialogContent>
      </Dialog>
      <Dialog open={!!modal} onOpenChange={(open) => {if(!open && !stockSaving && !manualSaving){if(modal==="detail" && detailOrigin){setModal(detailOrigin);setDetailOrigin("");}else {if(modal==="history")setWeekSnapshot(null);setModal("");}}}}>
        <DialogContent layout={modal === "clear" ? undefined : "page"} className={`app-dialog ${modal==='stock'?'stock-dialog':''} ${modal==='detail'?'recipe-detail-dialog':''} ${modal==='clear'?'confirm-dialog':''}`} aria-busy={stockSaving}
          footer={modal === "detail" ? <>{Number(activeRecipe?.time) > 0 && <RecipeTimer key={activeRecipe.id} minutes={activeRecipe.time} />}<button className="primary" onClick={()=>{changeQuantity(activeRecipe.id,1);toast.success("已加入点单清单");}}>＋ 加入菜单</button></>
            : modal === "selection" ? <button className="primary" disabled={orderSaving} onClick={confirmSelection}>{orderSaving?'正在保存…':`确认并同步 · ${selectedCount} 份菜品`}</button>
            : modal === "purchase-edit" ? <button className="primary" onClick={savePurchaseQuantity}>保存购买量</button>
            : modal === "manual-shopping" ? <button className="primary" disabled={manualSaving} type="submit" form="manual-shopping-form">{manualSaving?'正在保存…':manualDraft.id?'保存采购项':'加入菜篮子'}</button>
            : modal === "purchase-stock" ? <button className="primary" disabled={basketSaving||!!staleCheckedShopping.length} onClick={stockPurchased}>{basketSaving?'正在处理…':staleCheckedShopping.length?`先复核 ${staleCheckedShopping.length} 项购买量`:purchaseActionLabel}</button>
            : modal === "export" ? exportActions
            : modal === "stock" ? <button className="primary" disabled={stockSaving} type="submit" form="stock-edit-form">{stockSaving?'正在保存…':editingStock===null?'确认放入冰箱':'保存食材修改'}</button> : undefined} >
          <DialogTitle>
            {{
              detail: activeRecipe?.name,
              selection: "我的点单清单",
              stock: editingStock===null?"添加新鲜食材":"编辑食材",
              export: "采购清单预览",
              clear: "清空本周安排？",
              history: "膳食日历",
              "fridge-recipes":"看看能做什么",
              "purchase-edit":`修改${basketItem?.name||'食材'}购买量`,
              "manual-shopping":manualDraft.id?'编辑手动采购项':'手动添加采购项',
              "purchase-stock":stockingCount?'核对已买食材并入库':'确认已买采购项',
            }[modal] || "食光"}
          </DialogTitle>
          <DialogDescription className={modal === "clear" ? "" : "sr-only"}>
            {modal === "detail"
              ? "食材与制作步骤"
              : modal === "clear"
                ? "本周安排将被移除，已存档记录会保留。"
                : modal === "fridge-recipes" ? "选择菜品，查看做法与所需食材" : "确认信息后再保存"}
          </DialogDescription>
          {modal === "fridge-recipes" && (()=>{
            const matches=fridgeRecipes(recipes,fridge);
            return <><div className="fridge-recipe-picker" ref={node=>{if(node)node.closest(".dialog-page-body").scrollTop=fridgeScroll.current;}}>{matches.map(({recipe,count})=><button type="button" key={recipe.id} className="fridge-recipe-choice" onClick={event=>{fridgeScroll.current=event.currentTarget.closest('.dialog-page-body').scrollTop;setActiveRecipe(recipe);setDetailOrigin('fridge-recipes');setModal('detail');}}><span><strong>{recipe.name}</strong><small>已有 {count} 种食材</small></span><ArrowRight size={18}/></button>)}</div>{!matches.length&&<p>菜谱库中暂无匹配菜品。</p>}<button className="outline" onClick={()=>{setModal('');navigate(1);}}>浏览菜谱库</button></>;
          })()}
          {modal === "detail" && activeRecipe && (
            <>
              <div className="detail-overview">
                {hasUsableImage(activeRecipe.image) && <button className="detail-photo" aria-label="查看菜谱大图" onClick={()=>setPreviewImage(true)}><img src={activeRecipe.image} alt={activeRecipe.name}/></button>}
                {isMissingLocalImage(activeRecipe.image)&&<p role="status">原图片暂时无法读取，菜谱文字仍可查看。</p>}
                <div><strong>{activeRecipe.category}</strong><p>{[activeRecipe.time > 0 && `${activeRecipe.time} 分钟`,activeRecipe.weight > 0 && `每份约 ${activeRecipe.weight} g`].filter(Boolean).join(" · ")}</p></div>
              <details className="detail-more"><summary>更多操作</summary><div className="actions">
                <button
                  className="outline"
                  onClick={() => editRecipe(activeRecipe)}
                >
                  编辑菜谱
                </button>
                <button
                  className="outline"
                  onClick={async () => {
                    if (
                      !(await ask(`将从菜谱库移除「${activeRecipe.name}」。已确认采购和历史菜单保留快照。`, { title: "删除这道菜谱？", label: "确认删除", danger: true }))
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
              </div></details>
              </div>
              <h3>所需食材</h3>
              {activeRecipe.ingredients.map((item) => {
                const t =
                  item.qty != null &&
                  fridge
                    .filter(
                      (stock) =>
                        ingredientKey(stock.name) === ingredientKey(item.name) &&
                        comparableUnit(stock.unit) === comparableUnit(item.unit) &&
                        usableStock(stock),
                    )
                    .reduce((sum, stock) => sum + convertQuantity(stock.qty,stock.unit,item.unit), 0) >= item.qty;
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
                <div className="recipe-step-detail" key={index}>
                  <p><b className="step-number">{index + 1}</b>{step}</p>
                  {Number(activeRecipe.stepTimers?.[index])>0 && <RecipeTimer minutes={activeRecipe.stepTimers[index]} label={`步骤 ${index+1} 计时`}/>}
                </div>
              ))}

            </>
          )}
          {modal === "selection" && (
            <>
              <SelectionItems recipes={recipes} quantities={quantities} onChange={changeQuantity} />

            </>
          )}
          {modal === 'purchase-edit' && basketItem && <div className="basket-edit-content">
            <section className="basket-edit-section basket-edit-main" aria-label="购买量"><h3>实际购买量</h3>
              <div className="basket-edit-fields"><label>数量<input autoFocus type="number" inputMode="decimal" min="0.001" step="any" value={purchaseQuantity} onChange={event=>setPurchaseQuantity(event.target.value)}/></label>
              {['g','kg'].includes(normalizeUnit(basketItem.unit))&&<label>单位<AppSelect aria-label="购买量单位" value={purchaseUnit} onChange={event=>{const next=event.target.value;setPurchaseQuantity(current=>current===''?'':String(convertQuantity(current,purchaseUnit,next)));setPurchaseUnit(next);}}><option value="g">克（g）</option><option value="kg">千克（kg）</option></AppSelect></label>}</div>
              <p>按实际买到的数量填写；修改不会增加排单需求。</p>
            </section>
            <section className="basket-edit-section" aria-label="需求核算"><h3>需求核算</h3>
              <div className={`basket-demand-grid ${purchaseDrafts[shoppingKey(basketItem)]?.sourceFingerprint!==currentPurchaseFingerprint(basketItem)&&purchaseDrafts[shoppingKey(basketItem)]?.qty?'has-previous':''}`}>
                {!!purchaseDrafts[shoppingKey(basketItem)]?.qty&&purchaseDrafts[shoppingKey(basketItem)].sourceFingerprint!==currentPurchaseFingerprint(basketItem)&&<div><span>上次拟购买</span><strong>{purchaseDrafts[shoppingKey(basketItem)].qty} <small>{basketItem.unit}</small></strong></div>}
                <div><span>当前排单共需</span><strong>{basketItem.requiredQty??'待确认'} <small>{basketItem.unit}</small></strong></div><div className="basket-demand-gap"><span>当前还需购买</span><strong>{basketItem.qty??'待确认'} <small>{basketItem.unit}</small></strong></div>
              </div>
              {!!purchaseDrafts[shoppingKey(basketItem)]?.qty&&purchaseDrafts[shoppingKey(basketItem)].sourceFingerprint!==currentPurchaseFingerprint(basketItem)&&<p className="basket-edit-alert" role="alert">排单或库存已变化。请对照上次拟购和当前需求，确认实际买到的数量。</p>}
            </section>
            <section className="basket-edit-section" aria-label="排单来源"><h3>排单来源</h3>
              {basketItem.sources?.length?<ul className="basket-source-list">{basketItem.sources.map((source,index)=><li key={index}><span>{source.date} · {MEALS.find(([key])=>key===source.meal)?.[1]||'待分配'}</span><strong>{source.recipeName} ×{source.servings}</strong><small>需 {source.requiredQty??'待确认'}{basketItem.unit}</small></li>)}</ul>:<p>原排单已变更；已买记录仍可核对入库。</p>}
            </section>
          </div>}
          {modal === 'manual-shopping' && <form id="manual-shopping-form" className="basket-manual-form" onSubmit={event=>{event.preventDefault();saveManualItem();}}>
            <p>临时购买的食材或物品会单独列入菜篮子，不改变菜谱和菜单排单。</p>
            <label>名称<input autoFocus required maxLength={80} value={manualDraft.name} onChange={event=>setManualDraft(current=>({...current,name:event.target.value}))} placeholder="例如：保鲜袋" /></label>
            <div className="basket-manual-fields"><label>数量<input required type="number" inputMode="decimal" min="0.001" step="any" value={manualDraft.qty} onChange={event=>setManualDraft(current=>({...current,qty:event.target.value}))}/></label><label>单位<input required maxLength={20} value={manualDraft.unit} onChange={event=>setManualDraft(current=>({...current,unit:event.target.value}))} placeholder="个、包、g…"/></label></div>
            <label>分类<AppSelect aria-label="手动采购项分类" value={manualDraft.category} onChange={event=>setManualDraft(current=>({...current,category:event.target.value}))}>{stockCategories.filter(value=>value!=='全部').map(value=><option key={value} value={value}>{value}</option>)}</AppSelect></label>
            <label>备注（选填）<textarea maxLength={200} rows={2} value={manualDraft.note} onChange={event=>setManualDraft(current=>({...current,note:event.target.value}))} placeholder="品牌、规格或代买要求"/></label>
            <label className="basket-manual-stock"><input type="checkbox" checked={manualDraft.stockOnPurchase} onChange={event=>setManualDraft(current=>({...current,stockOnPurchase:event.target.checked}))}/><span>购买后放入冰箱库存</span></label>
            {manualDraft.id&&<button type="button" className="text-link basket-manual-remove" disabled={manualSaving} onClick={removeManualItem}>移除此项</button>}
          </form>}
          {modal === 'purchase-stock' && <div className="basket-stock-content">{!!staleCheckedShopping.length&&<p role="alert">排单来源或库存与上次保存购买量时不同。请逐项核对当前来源及实际买到的数量，再确认入库。</p>}{checkedShopping.map(item=><div className="list-row" key={basketKey(item)}><span>{item.name}{item.manual&&!item.stockOnPurchase?' · 仅完成采购':''}</span><strong>{basketDraft(item)?.qty} {item.unit}</strong>{staleCheckedShopping.includes(item)&&<><small>当前来源：{item.sources?.length?item.sources.map(source=>`${source.date} ${source.recipeName} ×${source.servings}`).join('；'):'已无相关排单'}。{item.requiredQty==null?'菜谱未填写用量，请核对实际购买量。':`当前共需 ${item.requiredQty}${item.unit}，还需购买 ${item.qty??'待确认'}${item.unit}。`}</small><button type="button" className="outline" disabled={basketSaving} onClick={()=>confirmPurchaseReview(item)}>确认购买量为 {basketDraft(item)?.qty}{item.unit}</button></>}</div>)}<p>{stockingCount?'需入库的项目会新增今天的冰箱批次；其他手动项仅完成采购。':'这些手动采购项完成后将从菜篮子移除，不会放入冰箱。'}</p></div>}
          {modal === "stock" && (
            <form id="stock-edit-form" className="editor stock-editor" onSubmit={event=>{event.preventDefault();saveIngredient();}}>
              <fieldset disabled={stockSaving}><StockFields rules={storageRules} autoFill={editingStock===null} value={ingredientDraft} onChange={setIngredientDraft}/></fieldset>
              {stockError&&<p role="alert">{stockError}</p>}

              {editingStock!==null&&<button className="text-link" disabled={stockSaving} type="button" onClick={async()=>{
                if(!(await ask('删除该批次后，采购缺口将重新计算。',{title:'删除食材？',label:'确认删除',danger:true})))return;
                try{const next=fridge.filter((_,i)=>i!==editingStock);await saveState({...latestState.current,fridge:next});setFridge(next);setModal('');setEditingStock(null);setIngredientDraft({...ingredient('',100),days:0,date:today()});}catch(error){setStockError(error.message);}
              }}>删除食材</button>}
            </form>
          )}
          {modal === "export" && (
            <>
              {shoppingExportLines.map((line,index)=><div key={index} className="list-row">{line}</div>)}


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
              <div className="history-week-tools"><label>
                <span className="sr-only">选择存档日期</span>
                <DateTimePicker aria-label="选择存档日期"
                  type="date"
                  value={archiveDate}
                  onChange={(event) => {setArchiveDate(monday(event.target.value));setArchiveDay(0);}}
                />
              </label>
              <AppSelect aria-label="已有菜单周" value={archiveDate} onChange={event=>{setArchiveDate(event.target.value);setArchiveDay(0);}}><option value="">选择一周</option>{Object.keys({...archives,...weeks}).sort().reverse().map(date=><option key={date} value={date}>{date} 起</option>)}</AppSelect></div>
              {archiveDate && <div className="week-dates history-dates" aria-label="历史菜单日期">{[0,1,2,3,4,5,6].map(day=><button key={day} aria-pressed={archiveDay===day} onClick={()=>setArchiveDay(day)}><span>周{"一二三四五六日"[day]}</span><b>{Number(dayAt(archiveDate,day).slice(-2))}</b></button>)}</div>}
              {{ ...archives, ...weeks }[archiveDate] ? (
                Object.entries({ ...archives, ...weeks }[archiveDate]).filter(([key])=>Number(key.split("-")[0])===archiveDay).map(
                  ([slot, items]) => items.length > 0 && (
                    <div key={slot} className="list-row history-meal-row">
                      <strong>周{"一二三四五六日"[+slot.split("-")[0]]} {slot.split("-")[1]}餐</strong>
                      <div className="history-meal-list">{items.map((item, index) => (
                        <div key={index} className="history-meal-item">
                          <span>{findRecipe(item)?.name || "菜谱内容已缺失"} × {item.servings || 1}</span>
                          <button type="button" className="text-link" aria-label={`查看${findRecipe(item)?.name || '缺失菜谱'}做法`} onClick={() => setWeekSnapshot(findRecipe(item) || {name: "菜谱内容已缺失"})}>查看做法</button>
                        </div>
                      ))}</div>
                    </div>
                  ),
                )
              ) : null}
              {archiveDate && !Object.entries({...archives,...weeks}[archiveDate] || {}).some(([key,items])=>Number(key.split("-")[0])===archiveDay && items.length) && <p className="subtle">当天暂无菜单</p>}
              <details className="history-copy"><summary>复制这一周菜单</summary><label>
                复制到目标周{" "}
                <DateTimePicker aria-label="复制到目标周"
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
                onClick={async () => {
                  if (
                    Object.values(weeks[copyTarget] || {}).some(
                      (items) => items.length,
                    ) &&
                    !(await ask("目标周已有安排，替换后将使用所选周的菜单。", { title: "替换目标周安排？", label: "确认替换", danger: true }))
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
                  setMenuView('week');
                  toast.success("已复制，目标周可独立修改");
                }}
              >
                复制菜单
              </button></details>
              <RecipeSnapshotDialog recipe={weekSnapshot} onClose={() => setWeekSnapshot(null)}/>
            </>
          )}
          <Dialog open={previewImage && modal === "detail" && hasUsableImage(activeRecipe?.image)} onOpenChange={setPreviewImage}><DialogContent className="app-dialog image-preview-dialog"><DialogTitle>菜谱图片</DialogTitle><DialogDescription className="sr-only">{activeRecipe?.name}</DialogDescription><img src={hasUsableImage(activeRecipe?.image)?activeRecipe.image:undefined} alt={activeRecipe?.name}/></DialogContent></Dialog>
          {confirmation}
        </DialogContent>
      </Dialog>
      {!modal && <RecipeSnapshotDialog recipe={weekSnapshot} onClose={() => setWeekSnapshot(null)}/>}
      {clearFridgeConfirmation}
      {hydrated&&<SyncPanel state={fullState} onRestore={restoreState} target={syncTarget}/>}
      <Toaster richColors position="top-center" offset={compact ? "calc(60px + env(safe-area-inset-top))" : undefined} mobileOffset={{top:"calc(60px + env(safe-area-inset-top))"}} />
    </SidebarProvider>
  );
}
export { App as default };
