const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = where => { throw new Error(where + '格式无效，请核对字段类型后重试'); };
const text = (value, where, required = false) => {
  if (value == null && !required) return;
  if (typeof value !== 'string' || (required && !value.trim())) fail(where);
};
const number = (value, where, min = 0, integer = false) => {
  if (value == null || value === '') return;
  if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value)) || Number(value) < min || (integer && !Number.isInteger(Number(value)))) fail(where);
};
const id = (value, where) => {
  if (!((typeof value === 'string' && value.trim()) || (typeof value === 'number' && Number.isFinite(value))) || ['__proto__','constructor','prototype'].includes(String(value))) fail(where);
};
export function validateRecipe(recipe, where = '菜谱', draft = false) {
  if (!object(recipe)) fail(where);
  if (!draft) id(recipe.id, where + ' ID');
  text(recipe.name, where + '名称', !draft);
  text(recipe.category, where + '分类');
  text(recipe.image, where + '图片');
  number(recipe.time, where + '用时');
  number(recipe.weight, where + '重量');
  if (!Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) fail(where + '食材或步骤');
  recipe.ingredients.forEach((item, index) => {
    const field = where + '第 ' + (index + 1) + ' 项食材';
    if (!object(item)) fail(field);
    text(item.name, field + '名称', !draft);
    text(item.category, field + '分类');
    text(item.unit, field + '单位');
    number(item.qty, field + '数量', Number.MIN_VALUE);
  });
  recipe.steps.forEach(step => text(step, where + '步骤', !draft));
  return recipe;
}
export function validateStock(stock, where = '库存', draft = false) {
  if (!object(stock)) fail(where);
  // 手动库存使用数组位置编辑，旧数据并没有 ID。
  if (!draft && stock.id != null) id(stock.id, where + ' ID');
  text(stock.name, where + '名称', !draft);
  text(stock.unit, where + '单位', !draft);
  text(stock.category, where + '分类');
  text(stock.date, where + '日期');
  number(stock.qty, where + '数量', Number.MIN_VALUE);
  if (!draft && (stock.qty == null || stock.qty === '')) fail(where + '数量');
  number(stock.days, where + '保存天数', 0, true);
  return stock;
}
export function uniqueIds(items, where) {
  const seen = new Set();
  for (const item of items) {
    id(item?.id, where + ' ID');
    const key = String(item.id);
    if (seen.has(key)) throw new Error(where + '存在重复 ID，未恢复任何数据');
    seen.add(key);
  }
}
// 只兼容含义明确的结构差异，不把未知内容或错误字段悄悄丢弃。
export function normalizeAIDrafts(items, kind) {
  if (!Array.isArray(items) || items.length > 100) fail('AI 返回的条目');
  return items.map((item, index) => {
    const where = '第 ' + (index + 1) + ' 项识别草稿';
    if (!object(item)) fail(where);
    const result = {...item, name: item.name ?? '', category: item.category ?? (kind === 'stock' ? '其他' : '素菜')};
    if (kind === 'stock') {
      result.unit ??= '';
      validateStock(result, where, true);
    } else {
      const ingredients = item.ingredients == null ? [] : object(item.ingredients) ? [item.ingredients] : item.ingredients;
      if (!Array.isArray(ingredients)) fail(where + '食材');
      result.ingredients = ingredients.map(ingredient => typeof ingredient === 'string' ? {name:ingredient,qty:null,unit:''} : ingredient);
      result.steps = typeof item.steps === 'string' ? item.steps.split(/\r?\n/).filter(step => step.trim()) : item.steps ?? [];
      validateRecipe(result, where, true);
    }
    return result;
  });
}
