"""已安排菜谱快照在源菜谱缺失后仍可只读查看，并正确处理返回键。"""
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'),
    )
    page = browser.new_page(viewport={'width': 320, 'height': 640})
    page.emulate_media(reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:5173'), wait_until='domcontentloaded')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''async () => {
      const {monday} = await import('/src/domain.js');
      const state = JSON.parse(localStorage.getItem('shiguang-v1'));
      const week = monday(new Date().toLocaleDateString('sv-SE'));
      state.weeks = {[week]: {'0-早': [{
        id: 'deleted-recipe', name: '旧版番茄蛋', category: '家常菜',
        image: 'shiguang-missing-local-image:old-photo.jpg',
        ingredients: [{name: '旧配方番茄', qty: 2, unit: '个'}],
        steps: ['按旧做法慢炒。'], servings: 2,
      }]}};
      state.recipes = state.recipes.filter(recipe => recipe.id !== 'deleted-recipe');
      state.confirmedRecipes = [];
      localStorage.setItem('shiguang-v1', JSON.stringify(state));
    }''')
    page.reload(wait_until='domcontentloaded')
    page.get_by_role('navigation', name='主导航').get_by_role('button', name='周菜单', exact=True).click()
    page.locator('.week-dates button').first.click()
    baseline = page.evaluate('''() => {
      const {weeks, recipes, confirmed, confirmedRecipes} = JSON.parse(localStorage.getItem('shiguang-v1'));
      return {weeks, recipes, confirmed, confirmedRecipes};
    }''')
    page.get_by_role('button', name='安排周1早餐', exact=True).click()
    picker = page.get_by_role('dialog', name='早餐 · 管理菜品')
    assert picker.evaluate('element => element.scrollWidth <= element.clientWidth + 1')
    page.screenshot(path=str(ROOT / '.android-tools/device-logs/ux-week-snapshot-picker.png'))
    page.get_by_role('button', name='查看旧版番茄蛋做法', exact=True).click()
    snapshot = page.get_by_role('dialog', name='旧版番茄蛋')
    expect(snapshot).to_contain_text('旧配方番茄')
    expect(snapshot).to_contain_text('2个')
    expect(snapshot).to_contain_text('按旧做法慢炒。')
    expect(snapshot).to_contain_text('图片暂时无法读取，原引用已保留。')
    expect(snapshot.locator('img')).to_have_count(0)
    assert snapshot.evaluate('element => element.scrollWidth <= element.clientWidth + 1')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ROOT / '.android-tools/device-logs/ux-week-snapshot.png'))
    page.evaluate('window.dispatchEvent(new Event("shiguang:back", {cancelable: true}))')
    expect(snapshot).to_have_count(0)
    expect(page.get_by_role('dialog', name='早餐 · 管理菜品')).to_be_visible()
    page.evaluate('window.dispatchEvent(new Event("shiguang:back", {cancelable: true}))')
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert page.evaluate('''() => {
      const {weeks, recipes, confirmed, confirmedRecipes} = JSON.parse(localStorage.getItem('shiguang-v1'));
      return {weeks, recipes, confirmed, confirmedRecipes};
    }''') == baseline
    assert not errors, errors
    browser.close()

print('PASS: deleted recipe snapshot, readonly ingredients and steps, back order, 320px layout')
