import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateStorage,suggestStorage,DEFAULT_STORAGE_RULES,validateStorageRules} from './food-storage.js';
import {validateStock} from './validation.js';
import {backup,validateBackup} from './services.js';
test('六类默认值、完全匹配和自定义优先，不内置名称表',()=>{
 const rules=structuredClone(DEFAULT_STORAGE_RULES);rules.items=[{name:'鸡蛋',days:21}];
 for(const [category,days] of Object.entries(rules.categories))assert.equal(estimateStorage('任意名称',category,rules).days,days);
 assert.equal(estimateStorage(' 鸡蛋 ','肉类',rules).days,21);
 assert.equal(estimateStorage('鸡蛋羹','肉类',rules).days,1);
 assert.equal(estimateStorage('鸡蛋','肉类').days,1);
 assert.equal(estimateStorage('食材','其他制品').days,3);
 const auto=suggestStorage({name:'鸡蛋',category:'肉类'},rules);
 assert.equal(suggestStorage({...auto,name:'鸡蛋羹'},rules).days,1);
 assert.equal(suggestStorage({...auto,category:'蔬菜'},rules).days,21);
 assert.equal(auto.shelfLifeSource.url,undefined);
});
test('包装和手动期限优先，旧数据不重算，非法来源拒绝',()=>{
 for(const source of ['manual','package']) {
  const stock={name:'鸡胸肉',qty:1,unit:'份',storageMethod:'chilled',days:7,shelfLifeSource:{kind:source}};
  assert.deepEqual(suggestStorage(stock),stock);assert.equal(validateStock(stock),stock);
 }
 assert.equal(suggestStorage({name:'鸡胸肉',storageMethod:'chilled',days:4}).days,4);
 assert.throws(()=>validateStock({name:'鸡肉',qty:1,unit:'份',storageMethod:'bad'}));
});
test('规则校验与备份往返，旧备份无需规则，拒绝重复名称和非法天数',()=>{
 const rules=structuredClone(DEFAULT_STORAGE_RULES);rules.items=[{name:'鸡蛋',days:21}];
 const state={recipes:[],fridge:[],confirmed:{},storageRules:rules};
 assert.deepEqual(validateBackup(backup(state)).storageRules,rules);
 assert.equal(validateBackup({recipes:[],fridge:[],confirmed:{}}).storageRules,undefined);
 for(const days of [0,-1,1.5,Infinity,'3',null])assert.throws(()=>validateStorageRules({...rules,items:[{name:'鸡蛋',days}]}));
 assert.throws(()=>validateBackup(backup({...state,storageRules:{...rules,items:[...rules.items,...rules.items]}})));
 assert.throws(()=>validateStorageRules({...rules,categories:{蔬菜:3}}));
 for(const kind of ['manual','package'])assert.equal(suggestStorage({name:'鸡蛋',days:0,shelfLifeSource:{kind}},rules).days,0);
});
