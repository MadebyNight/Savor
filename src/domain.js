export const MEALS = [['早','早餐'],['中','午餐'],['下午茶','下午茶'],['晚','晚餐'],['夜宵','夜宵']];
export const trimName = value => String(value ?? '').trim();
// 仅合并明确同义名称，不把部位、品种或生熟状态当作同一种食材。
const ingredientAliases = Object.fromEntries([
  ['番茄','西红柿'], ['土豆','马铃薯'], ['卷心菜','包菜','圆白菜','洋白菜'],
  ['花菜','菜花'], ['黄瓜','青瓜'], ['西兰花','绿花椰菜'], ['香菜','芫荽'],
].flatMap(([name,...aliases])=>aliases.map(alias=>[alias,name])));
export const ingredientKey = value => ingredientAliases[trimName(value)] || trimName(value);
export function fridgeRecipes(recipes, fridge, date) {
  const available=new Set(fridge.filter(stock=>usableStock(stock,date)).map(stock=>ingredientKey(stock.name)).filter(Boolean));
  return recipes.map(recipe=>({recipe,count:new Set(recipe.ingredients.map(item=>ingredientKey(item.name)).filter(name=>available.has(name))).size}))
    .filter(item=>item.count>0).sort((a,b)=>b.count-a.count);
}
export const normalizeUnit = value => ({'克':'g','毫升':'ml','千克':'kg','公斤':'kg','g':'g','ml':'ml','kg':'kg'}[trimName(value).toLowerCase()] || trimName(value));
export const comparableUnit = value => normalizeUnit(value)==='kg'?'g':normalizeUnit(value);
export const convertQuantity = (qty,from,to) => {
  const source=normalizeUnit(from),target=normalizeUnit(to);
  if(source===target)return Number(qty);
  if(source==='kg'&&target==='g')return Number(qty)*1000;
  if(source==='g'&&target==='kg')return Number(qty)/1000;
  return null;
};
export const dayAt = (value, offset) => {
  const date = new Date(value + "T12:00:00");
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("sv-SE");
};
export const monday = (value) => {
  const date = new Date(value + "T12:00:00");
  return dayAt(value, -(date.getDay() + 6) % 7);
};
export const usableStock = (
  stock,
  date = new Date().toLocaleDateString("sv-SE"),
) => !stock.days || dayAt(stock.date || date, Number(stock.days)) > date;
export function stockStatus(stock, date = new Date().toLocaleDateString('sv-SE')) {
  if (!Number(stock.days)) return {kind:'unknown',remaining:null,rank:2,label:'保存期待补充'};
  const expiry = dayAt(stock.date || date, Number(stock.days) - 1);
  const remaining = Math.round((Date.parse(expiry+'T00:00:00Z')-Date.parse(date+'T00:00:00Z'))/86400000);
  const threshold = stock.days <= 3 ? 1 : stock.days <= 7 ? 2 : 3;
  if (remaining < 0) return {kind:'expired',remaining,rank:0,label:'过期'};
  if (remaining <= threshold) return {kind:'soon',remaining,rank:1,label:`剩余${remaining}天`};
  return {kind:'normal',remaining,rank:3,label:`剩余${remaining}天`};
}
export function procurement(recipes, quantities, fridge, date) {
  const requirements = new Map();
  for (const recipe of recipes) {
    if (!quantities[recipe.id]) continue;
    for (const item of recipe.ingredients) {
      const name=trimName(item.name), unit=comparableUnit(item.unit), key = ingredientKey(name) + "|" + unit;
      const previous = requirements.get(key);
      const unknown =
        item.qty == null || item.qty === "" || previous?.qty === null;
      requirements.set(key, {
        ...item,name:previous?.name || name,unit,
        qty: unknown
          ? null
          : (previous?.qty || 0) + convertQuantity(item.qty,item.unit,unit) * quantities[recipe.id],
      });
    }
  }
  return [...requirements.values()]
    .map((item) => {
      const availableQty = fridge
        .filter(stock => ingredientKey(stock.name) === ingredientKey(item.name) &&
          comparableUnit(stock.unit) === item.unit && usableStock(stock, date))
        .reduce((total, stock) => total + convertQuantity(stock.qty,stock.unit,item.unit), 0);
      return {
        ...item,
        requiredQty: item.qty == null ? null : +item.qty.toFixed(3),
        availableQty: +availableQty.toFixed(3),
        qty: item.qty == null ? null : Math.max(0, +(item.qty - availableQty).toFixed(3)),
      };
    })
    .filter((item) => item.qty == null || item.qty > 0);
}

// 排单沿用 weeks[周一日期][周内序号-餐次]；旧确认清单没有日期，单独返回供用户安排。
export function datedProcurement({weeks = {}, pendingOrders = [], legacyRecipes = [], legacyQuantities = {}, fridge = [], from = todayDate(), to, asOf = todayDate()} = {}) {
  const dated = [];
  for (const [week, plan] of Object.entries(weeks)) {
    for (const [slot, recipes] of Object.entries(plan || {})) {
      const match = /^([0-6])-(.+)$/.exec(slot);
      if (!match || !Array.isArray(recipes)) continue;
      const date = dayAt(week, Number(match[1]));
      for (const recipe of recipes) dated.push({date, meal:match[2], recipe, servings:recipe.servings || 1, createdAt:recipe.createdAt || null});
    }
  }
  for (const order of pendingOrders) {
    if (order?.date && order.recipeSnapshot) dated.push({
      date:order.date, meal:null, recipe:order.recipeSnapshot,
      servings:order.servings || 1, createdAt:order.createdAt || null,
    });
  }
  dated.sort((a,b)=>a.date.localeCompare(b.date) || String(a.meal).localeCompare(String(b.meal)) || String(a.recipe.id).localeCompare(String(b.recipe.id)));
  const allocationStart=from<asOf?from:asOf;
  const rows = new Map();
  for (const entry of dated) {
    if (entry.date < allocationStart || (to && entry.date > to)) continue;
    for (const ingredient of entry.recipe.ingredients || []) {
      const name=trimName(ingredient.name), unit=comparableUnit(ingredient.unit);
      if (!name) continue;
      const key=JSON.stringify([ingredientKey(name),unit]);
      const row=rows.get(key) || {name,unit,category:ingredient.category || '其他',requiredQty:0,availableQty:0,qty:0,sources:[],demands:[]};
      const amount=ingredient.qty == null || ingredient.qty === '' ? null : convertQuantity(ingredient.qty,ingredient.unit,unit) * entry.servings;
      const visible=entry.date>=from;
      row.demands.push({date:entry.date,amount,visible});
      if (!visible) {rows.set(key,row);continue;}
      const {servings:ignoredServings,createdAt:ignoredCreatedAt,orderId:ignoredOrderId,sourceOrders:ignoredSourceOrders,...snapshot}=entry.recipe;
      if(snapshot.nutrition)snapshot.nutrition={...snapshot.nutrition,generatedAt:undefined};
      row.sources.push({date:entry.date,meal:entry.meal,recipeId:entry.recipe.id,recipeName:entry.recipe.name,
        servings:entry.servings,requiredQty:amount,createdAt:entry.createdAt,
        timestamps:entry.recipe.sourceOrders?.map(source=>source.createdAt).filter(Boolean) || (entry.createdAt?[entry.createdAt]:[]),
        snapshot:JSON.stringify(snapshot)});
      if (amount === null) row.requiredQty=null;
      else if (row.requiredQty !== null) row.requiredQty+=amount;
      rows.set(key,row);
    }
  }
  const items=[...rows].filter(([,row])=>row.sources.length).map(([key,row])=>{
    const batches=fridge.filter(stock=>JSON.stringify([ingredientKey(stock.name),comparableUnit(stock.unit)])===key)
      .map(stock=>({...stock,remaining:convertQuantity(stock.qty,stock.unit,row.unit)}))
      .sort((a,b)=>{
        const expiry=stock=>stock.days ? dayAt(stock.date || from || todayDate(),Number(stock.days)) : '9999-12-31';
        return expiry(a).localeCompare(expiry(b));
      });
    for (const demand of row.demands) {
      if (demand.amount === null) {
        if (demand.visible) {
          row.qty=null;
          row.availableQty=Math.max(row.availableQty,batches.filter(batch=>(!batch.date || batch.date<=demand.date)&&usableStock(batch,demand.date)).reduce((sum,batch)=>sum+batch.remaining,0));
        }
        continue;
      }
      let missing=demand.amount;
      for (const batch of batches) {
        if (!missing) break;
        if ((batch.date && batch.date > demand.date) || !usableStock(batch,demand.date)) continue;
        const used=Math.min(missing,batch.remaining);
        batch.remaining-=used;missing-=used;if(demand.visible)row.availableQty+=used;
      }
      if (demand.visible && row.qty !== null) row.qty+=missing;
    }
    const grouped=new Map();
    for (const source of row.sources) {
      const groupKey=JSON.stringify([source.date,source.meal,source.recipeId,source.snapshot]);
      const previous=grouped.get(groupKey);
      if (previous) {
        previous.servings+=source.servings;
        previous.requiredQty=previous.requiredQty === null || source.requiredQty === null ? null : previous.requiredQty+source.requiredQty;
        previous.timestamps.push(...source.timestamps);
      } else grouped.set(groupKey,{...source});
    }
    const sources=[...grouped.values()].map(({snapshot,...source})=>source);
    const sourceFingerprint=JSON.stringify([...grouped].map(([groupKey,source])=>{
      let hash=2166136261;
      for (let i=0;i<groupKey.length;i++) hash=Math.imul(hash ^ groupKey.charCodeAt(i),16777619);
      return [groupKey.length,(hash>>>0).toString(16),source.servings,source.requiredQty];
    }));
    return {name:row.name,unit:row.unit,category:row.category,
      requiredQty:row.requiredQty===null?null:+row.requiredQty.toFixed(3),
      availableQty:+row.availableQty.toFixed(3),qty:row.qty===null?null:+row.qty.toFixed(3),
      sources,sourceFingerprint};
  });
  return {items,legacyItems:procurement(legacyRecipes,legacyQuantities,fridge,from || todayDate())};
}

const todayDate=()=>new Date().toLocaleDateString('sv-SE');

export const shoppingKey = item => JSON.stringify([trimName(item.name),normalizeUnit(item.unit)]);
export const isPurchased = (item, purchased) => Object.hasOwn(purchased,shoppingKey(item)) && purchased[shoppingKey(item)]===item.qty;
export function reconcilePurchased(items,purchased){
 return Object.fromEntries(items.filter(item=>isPurchased(item,purchased)).map(item=>[shoppingKey(item),item.qty]));
}

// 空值和旧数据中的 0 都视为未填写；边界不重叠。
export function matchesRecipeTime(value, filter = "all") {
  const minutes = Number(value);
  const known = Number.isFinite(minutes) && minutes > 0;
  if (filter === "all") return true;
  if (filter === "unknown") return !known;
  if (!known) return false;
  if (filter === "quick") return minutes <= 15;
  if (filter === "medium") return minutes > 15 && minutes <= 30;
  return filter === "long" && minutes > 30;
}
