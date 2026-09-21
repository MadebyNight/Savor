import {useEffect,useRef,useState} from 'react';
import {calculateNutrition,missingNutrition,mergeNutritionAI,METRICS,NUTRITION_SOURCE,plannedItems,summarizeNutrition,weekNutritionInput,nutritionInput} from '../nutrition.js';
import {nutritionRequest,defaultAI,resolveAIEndpoint} from '../services.js';
import {validateReport} from '../nutrition-report.js';
import {getPreference} from '../storage.js';
import {getDeveloperConfig} from '../developer-ai.js';
import {dayAt} from '../domain.js';
import useConfirm from './useConfirm.jsx';

async function configuration(){return await getDeveloperConfig()||await getPreference('ai-config',defaultAI);}
export function NutritionSummary({summary,title='当日预计营养'}){
 const partial=summary.missing?.length>0;
 return <section className="nutrition-summary" aria-label={title}><h3>{title}</h3><p className="subtle">菜单预计营养，非实际摄入</p>
  <div className="nutrition-values">{METRICS.map(([key,label,unit])=><div key={key}><small>{label}</small><b>{summary.values[key]===null?'—':Math.round(summary.values[key]*10)/10} <small>{unit}</small></b><small>{summary.coverage[key].known}/{summary.coverage[key].total} 项</small></div>)}</div>
  <p className="subtle">{Object.values(summary.values).every(v=>v===null)?'未估算':partial?'部分估算 · 已知部分合计':'已估算'} · 覆盖率按食材条目计，非重量覆盖率</p>
  <p className="subtle">来源：{summary.sources?.local?'本地 CoFID 2021 ':''}{summary.sources?.ai?'AI 补充估算':''}{!summary.sources?.local&&!summary.sources?.ai?'待补充':''}</p>
 </section>;
}
export function RecipeNutrition({recipe,onChange}){
 const [ask,confirmation]=useConfirm(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),running=useRef(false),latest=useRef(recipe);latest.current=recipe;
 useEffect(()=>()=>{generation.current++;},[]);
 const snapshot=calculateNutrition(recipe),missing=missingNutrition(recipe);
 const summary=summarizeNutrition({'0-早':[{...recipe,nutrition:snapshot,servings:1}]},0);
 async function supplement(){
  if(running.current)return;running.current=true;const token=++generation.current;const input=nutritionInput(recipe);setError('');
  try{
   const config=await configuration();
   if(!(await ask(`将向 ${resolveAIEndpoint(config.url)} 发送下方 ${missing.length} 项食材名称、数量、单位及缺失指标。AI 对克重和营养的假设仅是估算，可能产生费用。`,{title:'发送营养缺失项？',label:'同意估算'})))return;
   if(token!==generation.current)return;setBusy(true);
   const result=await nutritionRequest(config,{items:missing},'supplement');
   if(token!==generation.current)return;
   if(input!==nutritionInput(latest.current))throw new Error('食材已修改，请重新估算；未写入旧结果');
   const nutrition=mergeNutritionAI(recipe,result.items,config.model);await onChange({...recipe,nutrition});
  }catch(e){if(token===generation.current)setError(e.message);}finally{if(token===generation.current){setBusy(false);running.current=false;}}
 }
 return <section className="recipe-nutrition"><NutritionSummary summary={summary} title="整菜预计营养"/>
  <p className="subtle">按可食部计算；未录入的油、调料及弃汤/烹饪损失未计。单位不明确时填写整项食材可食克重。</p>
  <div className="nutrition-weight-fields">{recipe.ingredients.map((item,index)=><label key={index}>{item.name||`食材${index+1}`}可食克重<input aria-label={`${item.name||`食材${index+1}`}可食克重`} type="number" min="0.001" step="any" disabled={busy} placeholder="g/kg 自动换算" value={item.grams??''} onChange={async e=>{try{await onChange({...recipe,nutrition:undefined,ingredients:recipe.ingredients.map((v,i)=>i===index?{...v,grams:e.target.value===''?null:Number(e.target.value)}:v)});}catch(error){setError(error.message);}}}/></label>)}</div>
  {!!missing.length&&<><p className="subtle">待补充：{missing.map(m=>`${m.ingredient.name}（${m.missing.map(k=>METRICS.find(([key])=>key===k)[1]).join('、')}）`).join('；')}</p><button type="button" className="outline" disabled={busy} onClick={supplement}>{busy?'正在估算…':'AI 补充缺失项'}</button></>}
  {busy&&<button type="button" className="text-link" onClick={()=>{generation.current++;running.current=false;setBusy(false);}}>取消估算</button>}
  {error&&<p role="alert">{error}</p>}{confirmation}
 </section>;
}
export default function NutritionPanel({week,plan,report,onSavePlan,onSaveReport}){
 const [ask,confirmation]=useConfirm(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const token=useRef(0),running=useRef(false),latest=useRef(plan);latest.current=plan;
 useEffect(()=>()=>{token.current++;},[]);
 const summary=summarizeNutrition(plan),input=weekNutritionInput(plan),outdated=report&&report.inputFingerprint!==input;
 async function generate(){
  if(running.current)return;running.current=true;const current=++token.current;setError('');
  try{
   const config=await configuration();
   if(!(await ask(`将向 ${resolveAIEndpoint(config.url)} 发送 ${week} 至 ${dayAt(week,6)} 的预计营养、覆盖率、缺失食材及下方类别汇总。分析仅针对菜单计划，可能产生费用。`,{title:'生成 AI 营养周报？',label:'同意生成'})))return;
   if(current!==token.current)return;setBusy(true);
   const result=await nutritionRequest(config,{weekStart:week,weekEnd:dayAt(week,6),summary},'report');
   if(current!==token.current)return;
   if(weekNutritionInput(latest.current)!==input)throw new Error('菜单已改变，请重新生成；已有报告保留');
   await onSaveReport(validateReport({weekStart:week,summarySnapshot:summary,inputFingerprint:input,reportText:result.reportText,generatedAt:new Date().toISOString(),model:config.model}));
  }catch(e){if(current===token.current)setError(e.message);}finally{if(current===token.current){setBusy(false);running.current=false;}}
 }
 return <div className="nutrition-panel"><h2>本周菜单营养回顾</h2><p>{week} — {dayAt(week,6)}</p><p className="subtle">包含目标周完整计划（含周日晚餐与夜宵）；不是实际食用记录。</p>
  {!summary.recipes&&<p>该周没有安排</p>}<NutritionSummary summary={summary} title="本周预计营养"/>
  <details><summary>每日分布与覆盖情况</summary>{Array.from({length:7},(_,d)=><NutritionSummary key={d} summary={summarizeNutrition(plan,d)} title={dayAt(week,d)}/>)}</details>
  <p>食材类别汇总（条目数）：{Object.entries(summary.categories).map(([name,count])=>`${name} ${count}`).join('、')||'无'}。不按类别推断实际摄入重量。</p>
  <button className="outline" disabled={busy||!summary.recipes} onClick={async()=>{try{if(!(await ask('将按当前菜单快照重新计算本地营养，不改当前菜谱库或采购。已有 AI 补充仅在食材未改变时保留。',{title:'重新估算该周菜单？',label:'重新计算'})))return;const next=structuredClone(plan);for(const {slot,index,recipe} of plannedItems(next))next[slot][index]={...recipe,nutrition:calculateNutrition(recipe)};await onSavePlan(next,input);}catch(e){setError(e.message);}}}>重新计算本地营养</button>
  <details><summary>逐道补充营养与可食克重</summary>{plannedItems(plan).map(({slot,index,recipe})=><details key={`${slot}:${index}`}><summary>{recipe.name} · {slot} · {recipe.servings||1}份</summary><RecipeNutrition recipe={recipe} onChange={async value=>{const next=structuredClone(plan);next[slot][index]={...value,nutrition:calculateNutrition(value)};await onSavePlan(next,input);}}/></details>)}</details>
  <button className="primary" disabled={busy||!summary.recipes} onClick={generate}>{busy?'正在生成…':'生成 AI 周报'}</button>
  {busy&&<button className="outline" onClick={()=>{token.current++;running.current=false;setBusy(false);}}>取消生成</button>}
  {error&&<p role="alert">{error}</p>}{report&&<article><h3>已保存周报 {outdated&&'· 已过时'}</h3><p className="subtle">{report.generatedAt} · {report.model}</p><p style={{whiteSpace:'pre-wrap'}}>{report.reportText}</p>{outdated&&<p>菜单或营养已改变；重新生成需再次确认发送。</p>}</article>}
  <details><summary>参考数据与估算限制</summary><p>CoFID 2021，共 {NUTRITION_SOURCE.foods.length} 个精确匹配参考条目，品种和烹饪状态可能不同。痕量及缺失均保留未知。</p><p>{NUTRITION_SOURCE.licence}</p><a href={NUTRITION_SOURCE.url} target="_blank" rel="noreferrer">查看官方来源</a></details>{confirmation}
 </div>;
}
