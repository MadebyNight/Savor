import { recipeCategories as defaults } from './data.js';

export function categoryNames(saved, recipes = []) {
  return [...new Set([...(saved ?? defaults.slice(1)), ...recipes.map(r => r.category?.trim() || '未分类'), '未分类'])]
    .filter(name => name && name !== '全部');
}

export function changeCategory(state, action, source, target) {
  const names = categoryNames(state.recipeCategories, state.recipes);
  const name = target?.trim();
  if (!name || name === '全部' || name.length > 20) throw new Error('分类名称需为 1–20 个字，且不能使用“全部”');
  if (action !== 'add' && (!names.includes(source) || source === '未分类')) throw new Error('该分类不能修改');
  if (action !== 'delete' && names.includes(name)) throw new Error('已存在同名分类');
  if (action === 'delete' && (name === source || !names.includes(name))) throw new Error('请选择其他分类接收菜谱');
  const recipeCategories = action === 'add' ? [...names.filter(n => n !== '未分类'), name, '未分类']
    : action === 'delete' ? names.filter(n => n !== source) : names.map(n => n === source ? name : n);
  const move = recipe => recipe && (recipe.category?.trim() || '未分类') === source ? {...recipe, category:name} : recipe;
  return {...state, recipeCategories,
    recipes: action === 'add' ? state.recipes : state.recipes.map(move),
    ...(state.recipeDraft ? {recipeDraft:action === 'add' ? state.recipeDraft : move(state.recipeDraft)} : {}),
  };
}
