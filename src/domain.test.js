import test from "node:test";
import assert from "node:assert/strict";
import { stockStatus, ingredientKey, fridgeRecipes, shoppingKey, isPurchased, reconcilePurchased, datedProcurement, MEALS, monday, dayAt, usableStock, procurement, normalizeUnit, comparableUnit, convertQuantity, trimName } from "./domain.js";
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
    [{ name: "米", unit: "g", qty: 170, requiredQty: 200, availableQty: 30 }],
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

test('采购说明与缺口共用库存口径，未知需求保留库存参考', () => {
  const recipes=[{id:'r',ingredients:[{name:'番茄',qty:250,unit:'g'},{name:'盐',qty:null,unit:'g'}]}];
  const fridge=[
    {name:'西红柿',qty:100,unit:'克',days:0},
    {name:'番茄',qty:100,unit:'g',days:0},
    {name:'番茄',qty:900,unit:'g',date:'2020-01-01',days:1},
    {name:'番茄',qty:0.1,unit:'kg',days:0},
    {name:'盐',qty:50,unit:'g',days:0},
  ];
  const result=procurement(recipes,{r:2},fridge,'2026-09-23');
  assert.deepEqual(result.map(({qty,requiredQty,availableQty})=>({qty,requiredQty,availableQty})),[
    {qty:200,requiredQty:500,availableQty:300},
    {qty:null,requiredQty:null,availableQty:50},
  ]);
  assert.equal(procurement(recipes,{r:2},[])[0].availableQty,0);
  assert.deepEqual(procurement([recipes[0]],{r:2},[...fridge,{name:'番茄',qty:300,unit:'g',days:0}]).map(item=>item.name),['盐']);
  const fractional=procurement([{id:'r',ingredients:[{name:'米',qty:0.1,unit:'kg'}]}],{r:3},[{name:'米',qty:0.1,unit:'kg',days:0}])[0];
  assert.deepEqual([fractional.unit,fractional.requiredQty,fractional.availableQty,fractional.qty],['g',300,100,200]);
});
test("克与千克双向抵扣，其他不同单位仍不混算", () => {
  const recipes = [
    { id: 1, ingredients: [{ name: "米", unit: "g", qty: 100 }] },
  ];
  assert.deepEqual(procurement(recipes,{1:1},[{name:'米',unit:'kg',qty:0.05,days:0}]).map(({unit,qty,availableQty})=>({unit,qty,availableQty})),[{unit:'g',qty:50,availableQty:50}]);
  assert.deepEqual(procurement([{id:2,ingredients:[{name:'米',unit:'kg',qty:0.2}]}],{2:1},[{name:'米',unit:'g',qty:50,days:0}]).map(({unit,qty})=>({unit,qty})),[{unit:'g',qty:150}]);
  assert.equal(procurement(recipes,{1:1},[{name:'米',unit:'ml',qty:100,days:0}])[0].qty,100);
  assert.equal(comparableUnit('KG'),'g');
  assert.equal(convertQuantity(0.35,'千克','g'),350);
  assert.equal(convertQuantity(350,'g','公斤'),0.35);
  assert.equal(convertQuantity(1,'ml','g'),null);
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

test('冰箱按全菜谱与同义名称推荐，排除过期且不混淆生熟部位',()=>{
  const recipes=[{id:'a',ingredients:[{name:'番茄'},{name:'鸡蛋'}]},{id:'b',ingredients:[{name:'土豆'}]},{id:'c',ingredients:[{name:'鸡胸肉'}]}];
  const fridge=[{name:'西红柿',days:0},{name:'马铃薯',days:1,date:'2020-01-01'},{name:'熟鸡胸肉',days:0}];
  assert.deepEqual(fridgeRecipes(recipes,fridge,'2026-09-23').map(({recipe,count})=>[recipe.id,count]),[['a',1]]);
  assert.equal(ingredientKey(' 西红柿 '),'番茄');
  assert.notEqual(ingredientKey('鸡肉'),ingredientKey('鸡胸肉'));
  assert.notEqual(ingredientKey('生鸡胸肉'),ingredientKey('熟鸡胸肉'));
  assert.notEqual(ingredientKey('小番茄'),ingredientKey('番茄'));
  assert.deepEqual(fridgeRecipes(recipes,[]),[]);
});
test('同义食材合并采购需求并统一扣减，不改食材展示名称',()=>{
  const recipes=[{id:'a',ingredients:[{name:'西红柿',qty:200,unit:'g'},{name:'番茄',qty:100,unit:'g'}]}];
  const result=procurement(recipes,{a:1},[{name:'番茄',qty:250,unit:'克',days:0}]);
  assert.equal(result.length,1);assert.equal(result[0].name,'西红柿');assert.equal(result[0].qty,50);
  assert.equal(recipes[0].ingredients[0].name,'西红柿');
});

test('日期排单与待分配共算，分配后只计一次，旧确认独立展示',()=>{
  const recipe={id:'r',name:'番茄蛋',ingredients:[{name:'番茄',qty:200,unit:'g'}],steps:['炒']};
  const pending={id:'o1',date:'2026-09-29',createdAt:'2026-09-26T08:00:00.000Z',recipeSnapshot:recipe,servings:1};
  const input={weeks:{'2026-09-28':{'1-中':[{...recipe,servings:1}]}},pendingOrders:[pending],legacyRecipes:[recipe],legacyQuantities:{r:1},fridge:[],from:'2026-09-28',to:'2026-10-04'};
  const first=datedProcurement(input);
  assert.equal(first.items[0].qty,400);
  assert.equal(first.items[0].sources.length,2);
  assert.equal(first.legacyItems[0].qty,200);
  assert.ok(first.items[0].sourceFingerprint.length<200);
  const moved=datedProcurement({...input,pendingOrders:[],weeks:{'2026-09-28':{'1-中':[{...recipe,servings:2,createdAt:'2026-09-26T08:00:00.000Z'}]}}});
  assert.equal(moved.items[0].qty,400);
  assert.equal(moved.items[0].sources.length,1);
  assert.equal(moved.items[0].sources[0].servings,2);
  assert.equal(moved.items[0].sources[0].createdAt,'2026-09-26T08:00:00.000Z');
  const repeated=datedProcurement({...input,pendingOrders:[],weeks:{'2026-09-28':{'1-中':[{...recipe,servings:1,orderId:'one',createdAt:'2026-09-26T08:00:00.000Z'},{...recipe,servings:2,orderId:'two',createdAt:'2026-09-26T09:00:00.000Z'}]}}});
  assert.equal(repeated.items[0].qty,600);
  assert.equal(repeated.items[0].sources.length,1);
  assert.equal(repeated.items[0].sources[0].servings,3);
  assert.equal(repeated.items[0].sources[0].timestamps.length,2);
  const merged=datedProcurement({...input,pendingOrders:[],weeks:{'2026-09-28':{'1-中':[{...recipe,servings:3,sourceOrders:[{id:'one',createdAt:'2026-09-26T08:00:00.000Z',servings:1},{id:'two',createdAt:'2026-09-26T09:00:00.000Z',servings:2}]}]}}});
  assert.equal(merged.items[0].sources[0].timestamps.length,2);
});

test('库存按日期先后只抵一次，并排除用餐前过期或尚未入库的批次',()=>{
  const recipe={id:'r',name:'番茄蛋',ingredients:[{name:'番茄',qty:100,unit:'g'}]};
  const weeks={'2026-09-28':{'0-早':[{...recipe,servings:1}],'2-晚':[{...recipe,servings:1}]}};
  const fridge=[{name:'番茄',qty:40,unit:'g',date:'2026-09-28',days:2},
    {name:'番茄',qty:30,unit:'g',date:'2026-09-30',days:3},
    {name:'番茄',qty:10,unit:'g',date:'2026-09-20',days:2}];
  const result=datedProcurement({weeks,fridge,from:'2026-09-28',to:'2026-10-04'}).items[0];
  assert.deepEqual([result.requiredQty,result.availableQty,result.qty],[200,70,130]);
  assert.deepEqual(result.sources.map(source=>source.date),['2026-09-28','2026-09-30']);
  assert.equal(datedProcurement({weeks,fridge,from:'2026-09-30',to:'2026-10-04',asOf:'2026-09-26'}).items[0].qty,70);
  const longStock=[{name:'番茄',qty:80,unit:'g',date:'2026-09-26',days:10}];
  assert.equal(datedProcurement({weeks,fridge:longStock,from:'2026-09-30',asOf:'2026-09-26'}).items[0].qty,100);
});

test('同义食材与克千克合并，未知用量不虚构缺口，历史日期默认排除',()=>{
  const weeks={'2026-09-28':{'0-早':[
    {id:'a',name:'甲',servings:1,ingredients:[{name:'番茄',unit:'克',qty:100},{name:'盐',unit:'g',qty:null}]},
    {id:'b',name:'乙',servings:1,ingredients:[{name:'西红柿',unit:'g',qty:50},{name:'番茄',unit:'kg',qty:1}]},
  ]}};
  const items=datedProcurement({weeks,fridge:[],from:'2026-09-28'}).items;
  assert.deepEqual(items.map(item=>[item.name,item.unit,item.qty]),[['番茄','g',1150],['盐','g',null]]);
  assert.equal(datedProcurement({weeks,fridge:[{name:'盐',qty:50,unit:'g',date:'2026-09-28',days:0}],from:'2026-09-28'}).items[1].availableQty,50);
  assert.equal(datedProcurement({weeks,fridge:[],from:'2026-09-29'}).items.length,0);
});
test('日期采购中千克库存按克抵扣且只分配一次',()=>{
  const recipe={id:'r',name:'米饭',ingredients:[{name:'米',qty:300,unit:'g'}]};
  const weeks={'2026-09-28':{'0-中':[{...recipe,servings:1}],'1-中':[{...recipe,servings:1}]}};
  const item=datedProcurement({weeks,fridge:[{name:'米',qty:0.4,unit:'kg',date:'2026-09-28',days:0}],from:'2026-09-28'}).items[0];
  assert.deepEqual([item.unit,item.requiredQty,item.availableQty,item.qty],['g',600,400,200]);
});


test('菜谱时长筛选：未知值与区间边界互斥', async () => {
  const {matchesRecipeTime} = await import('./domain.js');
  for (const value of [null, undefined, '', 0, -1, 'invalid']) {
    assert.equal(matchesRecipeTime(value,'unknown'),true);
    assert.equal(matchesRecipeTime(value,'quick'),false);
  }
  for (const [value,expected] of [[1,'quick'],[15,'quick'],[15.5,'medium'],[30,'medium'],[31,'long']]) {
    for (const filter of ['quick','medium','long','unknown']) assert.equal(matchesRecipeTime(value,filter),filter===expected);
    assert.equal(matchesRecipeTime(value,'all'),true);
  }
});
