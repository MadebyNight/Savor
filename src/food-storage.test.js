import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateStorage,suggestStorage} from './food-storage.js';
import {validateStock} from './validation.js';
test('冷藏规则限明确名称和状态；冷冻品质不冒充安全期限',()=>{
 assert.equal(estimateStorage('鸡胸肉','chilled').days,1);
 assert.equal(estimateStorage('鸡胸肉','frozen').days,0);
 assert.equal(estimateStorage('鸡胸肉','ambient').days,0);
 assert.equal(estimateStorage('鸡胸肉沙拉','chilled').days,0);
 assert.equal(estimateStorage('熟鸡肉','chilled').days,3);
 assert.equal(estimateStorage('肉汤','chilled').days,1);
 assert.equal(estimateStorage('不认识的食材','chilled').days,0);
});
test('包装和手动期限优先，旧数据不重算，非法来源拒绝',()=>{
 for(const source of ['manual','package']) {
  const stock={name:'鸡胸肉',qty:1,unit:'份',storageMethod:'chilled',days:7,shelfLifeSource:{kind:source}};
  assert.deepEqual(suggestStorage(stock),stock);assert.equal(validateStock(stock),stock);
 }
 assert.equal(suggestStorage({name:'鸡胸肉',storageMethod:'chilled',days:4}).days,4);
 assert.throws(()=>validateStock({name:'鸡肉',qty:1,unit:'份',storageMethod:'bad'}));
});
