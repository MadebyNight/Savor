import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryNames,changeCategory} from './categories.js';
import {backup,validateBackup,businessState} from './services.js';

const recipe={id:1,name:'测试菜',category:'荤菜',ingredients:[{name:'肉',qty:100,unit:'g'}],steps:['煮熟']};
const state=()=>({recipes:[structuredClone(recipe)],fridge:[],confirmed:{1:1},confirmedRecipes:[structuredClone(recipe)],weeks:{'2026-09-21':{'0-中':[{...structuredClone(recipe),servings:1}]}},archives:{},recipeDraft:{...structuredClone(recipe),id:0}});
test('旧分类迁移、空分类持久化及备份兼容',()=>{
  assert.ok(categoryNames(null,[{category:'自定义'}]).includes('自定义'));
  assert.ok(categoryNames(null,[{category:''}]).includes('未分类'));
  const next=changeCategory(state(),'add','',' 夜宵 ');
  assert.ok(validateBackup(backup(next)).recipeCategories.includes('夜宵'));
  assert.ok(businessState(next).recipeCategories.includes('夜宵'));
  assert.doesNotThrow(()=>validateBackup(backup(state())));
  for(const names of [['全部'],[''],['x','x'],[2],{}])assert.throws(()=>validateBackup({...state(),recipeCategories:names}));
});
test('重命名和删除迁移当前菜谱及编辑草稿，不改采购或历史快照',()=>{
  const before=state();
  const renamed=changeCategory(before,'rename','荤菜','家常菜');
  assert.equal(renamed.recipes[0].category,'家常菜');
  assert.equal(renamed.recipeDraft.category,'家常菜');
  const removed=changeCategory(renamed,'delete','家常菜','未分类');
  assert.equal(removed.recipes[0].category,'未分类');
  assert.ok(!categoryNames(removed.recipeCategories,removed.recipes).includes('家常菜'));
  assert.deepEqual(removed.confirmedRecipes,before.confirmedRecipes);
  assert.deepEqual(removed.weeks,before.weeks);
  assert.equal(before.recipes[0].category,'荤菜');
  assert.throws(()=>changeCategory(before,'add','','荤菜'));
  assert.throws(()=>changeCategory(before,'delete','未分类','荤菜'));
  assert.throws(()=>changeCategory(before,'delete','荤菜','不存在'));
  assert.throws(()=>changeCategory(before,'add','','全部'));
});
