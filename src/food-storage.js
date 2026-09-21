export const STORAGE_METHODS = {unknown:'未确定',chilled:'冷藏（≤4°C）',frozen:'冷冻（≤−18°C）',ambient:'常温'};
export const STORAGE_SOURCE = 'https://www.fda.gov/media/74435/download';
// FDA 2018 chart: use the lower bound, only for the explicitly matched state.
const rules = [
  [['生鸡肉','鸡胸肉','生鸡胸肉','鸡腿','鸡翅','生火鸡肉'],1,'生禽肉'],
  [['生猪肉末','猪肉馅','生牛肉末','牛肉馅'],1,'生绞肉'],
  [['生牛排','生猪排','生羊排'],3,'生肉排'],
  [['生鱼','生鱼片','生虾','鲜虾','生鱿鱼'],1,'生鱼与海鲜'],
  [['熟鸡肉','熟肉','熟鱼','熟鸡胸肉'],3,'熟肉/禽/鱼'],
  [['熟鸡蛋','水煮蛋'],7,'煮熟鸡蛋'],
  [['带壳生鸡蛋','鸡蛋'],21,'新鲜带壳鸡蛋'],
  [['生蛋清','生蛋黄'],2,'生蛋清/蛋黄'],
  [['肉汤'],1,'肉汁与肉汤'],
  [['熟蔬菜汤'],3,'汤与炖菜'],
];
export function estimateStorage(name, storageMethod) {
  const rule=rules.find(([names])=>names.includes(String(name||'').trim()));
  if(storageMethod!=='chilled'||!rule)return {days:0,shelfLifeSource:{kind:'unknown'}};
  return {days:rule[1],shelfLifeSource:{kind:'reference',rule:rule[2],condition:'持续冷藏≤4°C；入库前未超出包装期限',url:STORAGE_SOURCE,version:'FDA-2018'}};
}
export function suggestStorage(stock) {
  if(Number(stock.days)>0 || ['manual','package'].includes(stock.shelfLifeSource?.kind))return stock;
  return {...stock,...estimateStorage(stock.name,stock.storageMethod)};
}
