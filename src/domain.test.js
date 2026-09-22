import test from "node:test";
import assert from "node:assert/strict";
import { stockStatus, shoppingKey, isPurchased, reconcilePurchased, MEALS, monday, dayAt, usableStock, procurement, normalizeUnit, trimName } from "./domain.js";
import {backup,validateBackup} from './services.js';
test('五餐备份往返保留旧三餐、新餐次和独立快照，采购不随安排增加',()=>{
  assert.deepEqual(MEALS.map(([key])=>key),['早','中','下午茶','晚','夜宵']);
  const recipe={id:'r',name:'测试菜',ingredients:[{name:'米',qty:100,unit:'g'}],steps:['煮熟']};
  const plan=Object.fromEntries(MEALS.map(([key])=>['0-'+key,[{...structuredClone(recipe),servings:2}]]));
  const state={recipes:[recipe],fridge:[],confirmed:{r:1},confirmedRecipes:[recipe],weeks:{'2026-09-21':plan},archives:{}};
  const restored=validateBackup(JSON.parse(JSON.stringify(backup(state))));
  restored.weeks['2026-09-28']=structuredClone(restored.weeks['2026-09-21']);
  restored.weeks['2026-09-28']['0-下午茶'][0].name='独立修改';
  restored.recipes=[];
  assert.equal(restored.weeks['2026-09-21']['0-下午茶'][0].name,'测试菜');
  assert.equal(restored.weeks['2026-09-21']['0-夜宵'][0].servings,2);
  assert.equal(procurement(restored.confirmedRecipes,restored.confirmed,[])[0].qty,100);
});
test("真实周跨年与周日归属", () => {
  assert.equal(monday("2027-01-03"), "2026-12-28");
  assert.equal(dayAt("2026-12-28", 7), "2027-01-04");
});
test("库存期限当天仍可用，次日不抵扣，未知期限可用", () => {
  const stock = { date: "2026-09-01", days: 2 };
  assert.equal(usableStock(stock, "2026-09-02"), true);
  assert.equal(usableStock(stock, "2026-09-03"), false);
  assert.equal(usableStock({ ...stock, days: 0 }, "2026-09-30"), true);
});
test('临期分段3/4/7/8天边界，与采购到期日和未知期限一致',()=>{
  for(const [days,threshold] of [[3,1],[4,2],[7,2],[8,3]]) {
    const stock={date:'2026-09-01',days};
    const edge=dayAt(stock.date,days-1-threshold);
    assert.equal(stockStatus(stock,edge).kind,'soon');
    assert.equal(stockStatus(stock,dayAt(edge,-1)).kind,'normal');
    assert.equal(stockStatus(stock,dayAt(stock.date,days-1)).remaining,0);
    assert.equal(usableStock(stock,dayAt(stock.date,days-1)),true);
    assert.equal(stockStatus(stock,dayAt(stock.date,days)).kind,'expired');
    assert.equal(usableStock(stock,dayAt(stock.date,days)),false);
  }
  assert.equal(stockStatus({days:0}).kind,'unknown');
  assert.equal(stockStatus({days:null}).remaining,null);
});
test("采购仅按确认份数并汇总未过期批次抵扣", () => {
  assert.deepEqual(
    procurement(
      [{ id: 1, ingredients: [{ name: "米", unit: "g", qty: 100 }] }],
      { 1: 2 },
      [
        { name: "米", unit: "g", qty: 30, days: 0 },
        { name: "米", unit: "g", qty: 500, date: "2026-01-01", days: 1 },
      ],
      "2026-09-16",
    ),
    [{ name: "米", unit: "g", qty: 170 }],
  );
});
test("未知数量保留待确认且不能被库存抵扣", () => {
  assert.equal(
    procurement(
      [{ id: 1, ingredients: [{ name: "盐", unit: "g", qty: null }] }],
      { 1: 3 },
      [{ name: "盐", unit: "g", qty: 100, days: 0 }],
    )[0].qty,
    null,
  );
});
test("不同单位不抵扣，空确认清单为空", () => {
  const recipes = [
    { id: 1, ingredients: [{ name: "米", unit: "g", qty: 100 }] },
  ];
  assert.equal(
    procurement(recipes, { 1: 1 }, [{ name: "米", unit: "kg", qty: 1 }])[0].qty,
    100,
  );
  assert.deepEqual(procurement(recipes, {}, []), []);
});
test('单位与名称规范化后可抵扣',()=>{
 const recipe={id:'r',ingredients:[{name:' 番茄 ',qty:100,unit:'克'}]};
 assert.equal(normalizeUnit('克'),'g');assert.equal(trimName(' 番茄 '),'番茄');
 assert.deepEqual(procurement([recipe],{r:1},[{name:'番茄',qty:100,unit:'g'}]),[]);
});


test('采购勾选按名称单位和数量保留，需求变化或移除自动失效',()=>{
 const item={name:'米',unit:'g',qty:100};const purchased={[shoppingKey(item)]:100};
 assert.equal(isPurchased(item,purchased),true);
 assert.equal(isPurchased({...item,qty:200},purchased),false);
 assert.equal(isPurchased({...item,unit:'袋'},purchased),false);
 assert.deepEqual(reconcilePurchased([item],purchased),purchased);
 assert.deepEqual(reconcilePurchased([],purchased),{});
 const unknown={...item,qty:null};assert.equal(isPurchased(unknown,{}),false);
 assert.equal(isPurchased(unknown,{[shoppingKey(unknown)]:null}),true);
 const state={recipes:[],fridge:[],confirmed:{},weeks:{},archives:{},confirmedRecipes:[],purchased};
 assert.deepEqual(validateBackup(backup(state)).purchased,purchased);
 assert.throws(()=>validateBackup(backup({...state,purchased:{invalid:'true'}})));
});
test('库存状态短文案，保留原来的到期边界',()=>{
 const stock={date:'2026-09-01',days:3};
 assert.equal(stockStatus(stock,'2026-09-04').label,'过期');
 assert.equal(stockStatus(stock,'2026-09-03').label,'剩余0天');
 assert.equal(stockStatus(stock,'2026-09-02').label,'剩余1天');
});
