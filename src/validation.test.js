import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAIDrafts} from './validation.js';
import {validateBackup} from './services.js';

const recipe=()=>({id:'r',name:'青椒',ingredients:[{name:'青椒',qty:2,unit:'个'}],steps:['炒熟']});
const state=()=>({recipes:[recipe()],fridge:[],confirmed:{},weeks:{},archives:{},confirmedRecipes:[]});
test('AI 单个食材和文字步骤可兼容，缺失食材不编造',()=>{
  const result=normalizeAIDrafts([{name:'菜',ingredients:{name:'米',qty:null,unit:'g'},steps:'洗净\n煮熟'}],'recipes')[0];
  assert.equal(result.ingredients.length,1);assert.deepEqual(result.steps,['洗净','煮熟']);
  assert.deepEqual(normalizeAIDrafts([{name:'待补充'}],'recipes')[0].ingredients,[]);
});
test('AI 内部结构和保存字段类型均校验，不静默丢弃错误食材',()=>{
  for(const patch of [{name:42},{ingredients:[null]},{ingredients:42},{steps:[{}]},{category:{}},{time:{}},{ingredients:[{name:'米',unit:42}]}]) {
    assert.throws(()=>normalizeAIDrafts([{...recipe(),...patch}],'recipes'),/格式无效/);
  }
  for(const patch of [{qty:{}},{unit:42},{days:-1}])assert.throws(()=>normalizeAIDrafts([{name:'米',qty:1,unit:'g',...patch}],'stock'),/格式无效/);
});
test('备份校验覆盖渲染字段、嵌套食材、所有菜单和采购快照',()=>{
  for(const patch of [{category:{}},{time:{}},{weight:[]},{image:{}},{ingredients:[null]},{ingredients:[{name:'米',unit:{}}]},{steps:[42]}]) {
    for(const collection of ['recipes','confirmedRecipes','weeks','archives']) {
      const value=state(),bad={...recipe(),...patch};
      if(['weeks','archives'].includes(collection))value[collection]={week:{'0-早':[bad]}};
      else value[collection]=[bad];
      const original=structuredClone(value);
      assert.throws(()=>validateBackup(value),/格式无效/);assert.deepEqual(value,original);
    }
  }
});
test('备份拒绝重复、缺失、危险 ID；不同餐次可使用同一个菜谱快照',()=>{
  for(const ids of [['r','r'],[1,'1'],['r',null],['r','__proto__']]) {
    const value=state();value.recipes=ids.map(id=>({...recipe(),id}));assert.throws(()=>validateBackup(value),/ID/);
  }
  const value=state();value.weeks={'2026-09-14':{'0-早':[recipe()],'0-午':[recipe()]}};
  assert.deepEqual(validateBackup(value).weeks,value.weeks);
});
test('原有备份和旧版菜单迁移保留，非法库存和选菜不写入',()=>{
  const value=state();delete value.archives;value.plan={'0-早':['r','missing']};
  const restored=validateBackup(value);assert.equal(restored.archives['旧版存档']['0-早'][0].name,'青椒');
  assert.equal(restored.archives['旧版存档']['0-早'][1].missing,true);
  assert.throws(()=>validateBackup({...state(),qty:[]}),/选菜份数/);
  assert.throws(()=>validateBackup({...state(),fridge:[{id:1,name:'米',qty:2,unit:{}}]}),/库存/);
  const manual={name:'米',qty:2,unit:'g'};
  assert.deepEqual(validateBackup({...state(),fridge:[manual]}).fridge,[manual]);
});
