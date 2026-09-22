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
export const normalizeUnit = value => ({'克':'g','毫升':'ml','千克':'kg','公斤':'kg','g':'g','ml':'ml','kg':'kg'}[trimName(value)] || trimName(value));
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
      const name=trimName(item.name), unit=normalizeUnit(item.unit), key = ingredientKey(name) + "|" + unit;
      const previous = requirements.get(key);
      const unknown =
        item.qty == null || item.qty === "" || previous?.qty === null;
      requirements.set(key, {
        ...item,name:previous?.name || name,unit,
        qty: unknown
          ? null
          : (previous?.qty || 0) + item.qty * quantities[recipe.id],
      });
    }
  }
  return [...requirements.values()]
    .map((item) => ({
      ...item,
      qty:
        item.qty == null
          ? null
          : Math.max(
              0,
              +(
                item.qty -
                fridge
                  .filter(
                    (stock) =>
                      ingredientKey(stock.name) === ingredientKey(item.name) &&
                      normalizeUnit(stock.unit) === item.unit &&
                      usableStock(stock, date),
                  )
                  .reduce((total, stock) => total + Number(stock.qty), 0)
              ).toFixed(3),
            ),
    }))
    .filter((item) => item.qty == null || item.qty > 0);
}

export const shoppingKey = item => JSON.stringify([trimName(item.name),normalizeUnit(item.unit)]);
export const isPurchased = (item, purchased) => Object.hasOwn(purchased,shoppingKey(item)) && purchased[shoppingKey(item)]===item.qty;
export function reconcilePurchased(items,purchased){
 return Object.fromEntries(items.filter(item=>isPurchased(item,purchased)).map(item=>[shoppingKey(item),item.qty]));
}
