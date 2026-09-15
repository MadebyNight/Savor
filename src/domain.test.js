import test from "node:test";
import assert from "node:assert/strict";
import { monday, dayAt, usableStock, procurement, normalizeUnit, trimName } from "./domain.js";
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
