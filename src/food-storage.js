export const STORAGE_METHODS = {unknown:'未确定',chilled:'冷藏（≤4°C）',frozen:'冷冻（≤−18°C）',ambient:'常温'};
export const DEFAULT_STORAGE_RULES = {categories:{蔬菜:3,水果:5,肉类:1,豆制品:2,奶制品:7,其他:3},items:[]};
export function validateStorageRules(value) {
  const validDays=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
  if(!value || !value.categories || Array.isArray(value.categories) || !Array.isArray(value.items) ||
    Object.keys(value.categories).length!==6 || Object.keys(DEFAULT_STORAGE_RULES.categories).some(key=>!validDays(value.categories[key])))throw new Error('分类默认天数应为正整数');
  const names=new Set();
  for(const item of value.items){
    if(!item || typeof item.name!=='string' || !item.name.trim() || item.name!==item.name.trim() || !validDays(item.days))throw new Error('请填写食材名称和正整数天数');
    if(names.has(item.name))throw new Error('食材名称重复，请修改已有规则');
    names.add(item.name);
  }
  return value;
}
export function estimateStorage(name, category, rules=DEFAULT_STORAGE_RULES) {
  const match=rules.items.find(item=>item.name===String(name||'').trim());
  const key=Object.hasOwn(rules.categories,category)?category:'其他';
  return {days:match?match.days:rules.categories[key],shelfLifeSource:{kind:'reference',rule:match?`食材规则：${match.name}`:`分类默认：${key}`,condition:'按规则自动填写，仅供参考，请以包装及实际保存情况为准。',version:'category-v1'}};
}
export function suggestStorage(stock,rules=DEFAULT_STORAGE_RULES) {
  if(['manual','package'].includes(stock.shelfLifeSource?.kind) || (Number(stock.days)>0&&stock.shelfLifeSource?.version!=='category-v1'))return stock;
  return {...stock,...estimateStorage(stock.name,stock.category,rules)};
}
