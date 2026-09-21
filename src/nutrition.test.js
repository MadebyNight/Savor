import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateNutrition,mergeNutritionAI,summarizeNutrition,validateNutrition,weekNutritionInput} from './nutrition.js';
import {validateReport} from './nutrition-report.js';
import {validateBackup,backup} from './services.js';
const recipe={id:1,name:'番茄菜',steps:['煮'],ingredients:[{name:'番茄',qty:100,unit:'g',category:'蔬菜'},{name:'未知食材',qty:1,unit:'个'}]};
test('本地克重换算、缺失不为零与历史不暗中重算',()=>{
 const a=calculateNutrition(recipe),b=calculateNutrition({...recipe,ingredients:[{name:'番茄',qty:.1,unit:'kg'}]});
 assert.equal(a.values.energyKcal,b.values.energyKcal);assert.equal(a.entries[1].values.energyKcal,null);assert.deepEqual(a.coverage.energyKcal,{known:1,total:2});
 assert.equal(summarizeNutrition({'0-早':[recipe]}).values.energyKcal,null);
 assert.equal(calculateNutrition({...recipe,ingredients:[{name:'番茄',qty:100,unit:'ml'}]}).values.energyKcal,null);
 assert.equal(calculateNutrition({...recipe,ingredients:[{name:'番茄',qty:1,unit:'个',grams:100}]}).values.energyKcal,a.values.energyKcal);
});
test('AI 按指标补缺、不能覆盖本地，非法输出不写入',()=>{
 const a=calculateNutrition(recipe),merged=mergeNutritionAI(recipe,[{index:0,values:{energyKcal:999}},{index:1,values:{energyKcal:50,proteinG:0}}],'test');
 assert.equal(merged.values.energyKcal,a.values.energyKcal+50);assert.equal(merged.entries[1].values.proteinG,0);assert.equal(merged.entries[1].values.fatG,null);assert.equal(merged.entries[1].sources.energyKcal,'ai');
 for(const value of [-1,Infinity,'12'])assert.throws(()=>mergeNutritionAI(recipe,[{index:1,values:{energyKcal:value}}],'test'));
 assert.throws(()=>mergeNutritionAI(recipe,[{index:1,values:{}},{index:1,values:{}}],'test'));
 validateNutrition(merged);const broken=structuredClone(merged);broken.values.energyKcal++;assert.throws(()=>validateNutrition(broken));
 assert.deepEqual(calculateNutrition({...recipe,nutrition:merged}),merged);
 assert.equal(calculateNutrition({...recipe,nutrition:merged,ingredients:[{name:'番茄',qty:200,unit:'g'}]}).entries.length,1);
});
test('五餐、重复安排及份数计入营养，旧快照独立',()=>{
 const item={...recipe,nutrition:calculateNutrition(recipe),servings:2};const plan={'0-早':[item],'0-下午茶':[item],'6-夜宵':[item]};
 assert.equal(summarizeNutrition(plan).values.energyKcal,item.nutrition.values.energyKcal*6);assert.equal(summarizeNutrition(plan,0).values.energyKcal,item.nutrition.values.energyKcal*4);assert.deepEqual(summarizeNutrition(plan).coverage.energyKcal,{known:3,total:6});
 const before=weekNutritionInput(plan);plan['6-夜宵'][0]={...item,servings:3};assert.notEqual(weekNutritionInput(plan),before);
});
test('周报与营养随备份保留；拒绝非法汇总',()=>{
 const item={...recipe,nutrition:calculateNutrition(recipe)},plan={'6-夜宵':[item]},report={weekStart:'2026-09-21',inputFingerprint:weekNutritionInput(plan),reportText:'部分估算',generatedAt:new Date().toISOString(),model:'test',summarySnapshot:summarizeNutrition(plan)};
 validateReport(report);const state={recipes:[item],fridge:[],confirmed:{1:1},weeks:{'2026-09-21':plan},nutritionReports:{'2026-09-21':report}};
 assert.deepEqual(validateBackup(backup(state)).nutritionReports,state.nutritionReports);
 const bad=structuredClone(report);bad.summarySnapshot.values.energyKcal=-1;assert.throws(()=>validateReport(bad));assert.throws(()=>validateReport({...report,weekStart:'2026-09-22'}));
});
