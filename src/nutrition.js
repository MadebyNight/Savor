import data from './nutrition-data.json' with {type:'json'};
import {MEALS,normalizeUnit} from './domain.js';
export const METRICS=[['energyKcal','能量','kcal'],['proteinG','蛋白质','g'],['fatG','脂肪','g'],['carbohydrateG','碳水化合物','g'],['fiberG','膳食纤维','g']];
const keys=METRICS.map(([key])=>key);
const empty=()=>Object.fromEntries(keys.map(key=>[key,null]));
export const nutritionInput=recipe=>JSON.stringify((recipe.ingredients||[]).map(i=>({name:String(i.name||'').trim(),qty:i.qty==null||i.qty===''?null:Number(i.qty),unit:normalizeUnit(i.unit),grams:i.grams==null||i.grams===''?null:Number(i.grams)})));
export function edibleGrams(item){
 if(Number(item.grams)>0&&Number.isFinite(Number(item.grams)))return Number(item.grams);
 const unit=normalizeUnit(item.unit),qty=Number(item.qty);
 return qty>0&&Number.isFinite(qty)&&['g','kg'].includes(unit)?qty*(unit==='kg'?1000:1):null;
}
export function calculateNutrition(recipe,{fresh=false}={}){
 const inputFingerprint=nutritionInput(recipe);
 if(!fresh&&recipe.nutrition?.inputFingerprint===inputFingerprint)return structuredClone(recipe.nutrition);
 const entries=(recipe.ingredients||[]).map((item,index)=>{
  const food=data.foods.find(f=>f.aliases.includes(String(item.name||'').trim())),grams=edibleGrams(item);
  const values=Object.fromEntries(keys.map(key=>[key,food&&grams!=null&&food.values[key]!=null?food.values[key]*grams/100:null]));
  return {index,name:String(item.name||''),grams,foodId:food?.foodId||null,basis:food?.basis||null,sourceVersion:data.sourceVersion,values,sources:Object.fromEntries(keys.map(key=>[key,values[key]===null?null:'local']))};
 });
 return finishNutrition({version:1,inputFingerprint,generatedAt:new Date().toISOString(),entries});
}
function finishNutrition(snapshot){
 const {entries}=snapshot;
 return {...snapshot,values:Object.fromEntries(keys.map(key=>{const known=entries.filter(e=>e.values[key]!=null);return [key,known.length?known.reduce((sum,e)=>sum+e.values[key],0):null];})),coverage:Object.fromEntries(keys.map(key=>[key,{known:entries.filter(e=>e.values[key]!=null).length,total:entries.length}]))};
}
export function missingNutrition(recipe){
 const snapshot=calculateNutrition(recipe);
 return snapshot.entries.filter(e=>keys.some(key=>e.values[key]===null)).map(e=>({index:e.index,ingredient:recipe.ingredients[e.index],missing:keys.filter(key=>e.values[key]===null)}));
}
export function mergeNutritionAI(recipe,items,model){
 if(!Array.isArray(items)||items.length>recipe.ingredients.length)throw new Error('AI 营养结果格式无效');
 const snapshot=calculateNutrition(recipe),seen=new Set();
 for(const item of items){
  if(!Number.isInteger(item?.index)||!snapshot.entries[item.index]||seen.has(item.index)||!item.values||typeof item.values!=='object')throw new Error('AI 营养条目无效');
  seen.add(item.index);const entry=snapshot.entries[item.index];
  for(const key of keys){
   const value=item.values[key];
   if(value!=null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>(key==='energyKcal'?1e7:1e6)))throw new Error('AI 返回非法营养数值，未保存');
   if(entry.values[key]===null&&value!=null){entry.values[key]=value;entry.sources[key]='ai';}
  }
 }
 return finishNutrition({...snapshot,model,generatedAt:new Date().toISOString()});
}
export function validateNutrition(value){
 if(!value||value.version!==1||typeof value.inputFingerprint!=='string'||typeof value.generatedAt!=='string'||!Array.isArray(value.entries)||value.entries.length>1000)throw new Error('营养快照格式无效');
 for(const [index,entry] of value.entries.entries()){
  if(!Number.isInteger(entry.index)||entry.index!==index||typeof entry.name!=='string'||!entry.values||!entry.sources)throw new Error('营养条目格式无效');
  for(const key of keys){const n=entry.values[key];if(n!==null&&(typeof n!=='number'||!Number.isFinite(n)||n<0||n>(key==='energyKcal'?1e7:1e6)))throw new Error('营养数值无效');if(![null,'local','ai'].includes(entry.sources[key]))throw new Error('营养来源无效');if((n===null)!==(entry.sources[key]===null))throw new Error('营养来源与数值不一致');}
 }
 const rebuilt=finishNutrition(value);
 if(keys.some(key=>rebuilt.values[key]!==value.values?.[key]||rebuilt.coverage[key].known!==value.coverage?.[key]?.known||rebuilt.coverage[key].total!==value.coverage?.[key]?.total))throw new Error('营养合计与条目不一致');
 return value;
}
export function plannedItems(plan,day=null){
 return Array.from({length:7},(_,d)=>d).filter(d=>day===null||d===day).flatMap(d=>MEALS.flatMap(([key])=>(plan[`${d}-${key}`]||[]).map((recipe,index)=>({slot:`${d}-${key}`,index,recipe}))));
}
export function summarizeNutrition(plan,day=null){
 const totals=empty(),coverage=Object.fromEntries(keys.map(k=>[k,{known:0,total:0}]));let local=0,ai=0;
 const missing=[],categories=Object.create(null);const items=plannedItems(plan,day);
 for(const {recipe} of items){
  const servings=recipe.servings||1;
  const valid=recipe.nutrition?.inputFingerprint===nutritionInput(recipe)?recipe.nutrition:null;
  const entries=valid?.entries||recipe.ingredients?.map((i,index)=>({index,name:i.name,values:empty(),sources:{}}))||[];
  for(const entry of entries){
   const category=recipe.ingredients[entry.index]?.category||'未分类';categories[category]=(categories[category]||0)+1;
   const gaps=[];
   for(const key of keys){coverage[key].total++;if(entry.values[key]===null){gaps.push(key);continue;}coverage[key].known++;totals[key]=(totals[key]??0)+entry.values[key]*servings;if(entry.sources[key]==='ai')ai++;else local++;}
   if(gaps.length)missing.push({recipe:recipe.name,ingredient:entry.name,metrics:gaps});
  }
  if(!entries.length)missing.push({recipe:recipe.name,ingredient:'未录入食材',metrics:keys});
 }
 return {values:totals,coverage,missing,categories,recipes:items.length,sources:{local,ai}};
}
export const weekNutritionInput=plan=>JSON.stringify(plannedItems(plan).map(({slot,index,recipe})=>({slot,index,name:recipe.name,servings:recipe.servings||1,input:nutritionInput(recipe),nutrition:recipe.nutrition||null,categories:recipe.ingredients?.map(i=>i.category||'未分类')})));
export const NUTRITION_SOURCE=data;
