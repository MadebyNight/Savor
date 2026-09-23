"""设置单行导航与目标周营养回顾的视觉、日期及返回回归。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/device-logs'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:5173'), wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    target = page.evaluate(r"""async()=>{
      const {calculateNutrition,summarizeNutrition,weekNutritionInput}=await import('/src/nutrition.js');
      const {monday,dayAt}=await import('/src/domain.js');
      const current=monday(new Date().toLocaleDateString('sv-SE')),week=dayAt(current,-7);
      const plan=Object.fromEntries(Array.from({length:7},(_,d)=>{
        const recipe={id:d+1,name:`第${d+1}天番茄`,ingredients:[{name:'番茄',qty:(d+1)*100,unit:'g',category:'蔬菜'}],steps:['煮'],servings:1};
        recipe.nutrition=calculateNutrition(recipe);return [`${d}-早`,[recipe]];
      }));
      const state=JSON.parse(localStorage.getItem('shiguang-v1'));
      state.weeks={[week]:plan,[current]:{}};
      state.nutritionReports={[week]:{weekStart:week,inputFingerprint:weekNutritionInput(plan),summarySnapshot:summarizeNutrition(plan),generatedAt:new Date().toISOString(),model:'test',reportText:'这周已有七天的菜单记录。\n\n测试建议：按计划安排下一周。\n\n测试建议：保留喜欢的菜品。'}};
      localStorage.setItem('shiguang-v1',JSON.stringify(state));
      return {week,dates:Array.from({length:7},(_,d)=>dayAt(week,d)),next:dayAt(week,7),energies:Array.from({length:7},(_,d)=>Math.round(summarizeNutrition(plan,d).values.energyKcal*10)/10)};
    }""")
    page.reload(wait_until='networkidle')

    def click(name):
        page.get_by_role('button', name=name, exact=True).click()

    click('设置与备份')
    tabs = page.get_by_role('navigation', name='设置分页')
    for width, font in [(390, 14), (320, 20)]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.evaluate('(size)=>document.documentElement.style.fontSize=size+"px"', font)
        boxes = [button.bounding_box() for button in tabs.get_by_role('button').all()]
        assert max(box['y'] for box in boxes) - min(box['y'] for box in boxes) < 1
        if width == 320: assert tabs.evaluate('e=>e.scrollWidth>e.clientWidth')
        click('营养周报提醒')
        expect(tabs.get_by_role('button', name='营养周报提醒')).to_have_attribute('aria-current', 'page')
        if tabs.evaluate('e=>e.scrollWidth>e.clientWidth'): assert tabs.evaluate('e=>e.scrollLeft>0')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / f'settings-single-row-{width}.png'))
    page.evaluate("document.documentElement.style.fontSize='14px'")
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")
    page.get_by_role('navigation', name='主导航').get_by_role('button', name='周菜单', exact=True).click()
    page.locator('.week-picker summary').click()
    click('上一周')
    page.locator('.week-picker summary').click()
    page.locator('.nutrition-review-entry').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 'nutrition-entry.png'))
    click('本周菜单营养回顾')
    review = page.locator('.nutrition-dialog').first
    review.evaluate('async e=>{await Promise.all(e.getAnimations().map(a=>a.finished))}')
    expect(page.locator('.review-period')).to_contain_text(target['week'])
    expect(page.locator('.review-advice-date')).to_contain_text(target['next'])
    expect(page.locator('.review-dates button')).to_have_count(7)
    expect(page.get_by_text('参考数据与估算限制', exact=True)).to_have_count(0)
    expect(page.get_by_text('尚未计入的食材', exact=False)).to_have_count(0)
    for day, date in enumerate(target['dates']):
        click(date)
        expect(page.get_by_role('button', name=date, exact=True)).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('.review-day-content')).to_contain_text(date)
        expect(page.locator('.review-energy strong').first).to_have_text(str(target['energies'][day]))
        expect(page.locator('.review-day-menu')).to_have_text(f'第{day+1}天番茄')
    for width, font in [(390, 14), (320, 20)]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.evaluate('(size)=>document.documentElement.style.fontSize=size+"px"', font)
        assert review.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        assert page.locator('.review-dates button').count()==7
        assert page.locator('.review-dates').evaluate('e=>getComputedStyle(e).overflowX==="auto"')
        review.locator('.dialog-page-body').evaluate('e=>e.scrollTop=0')
        page.screenshot(path=str(OUT / f'nutrition-review-{width}.png'))
    click('高级计算')
    expect(page.get_by_role('dialog', name='高级计算', exact=True)).to_be_visible()
    page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")
    expect(page.locator('.nutrition-advanced')).to_have_count(0)
    expect(page.get_by_role('button', name=target['dates'][-1], exact=True)).to_have_attribute('aria-pressed', 'true')
    click('关闭弹窗')
    page.locator('.week-picker summary').click()
    click('下一周')
    page.locator('.week-picker summary').click()
    click('本周菜单营养回顾')
    expect(page.locator('.review-period')).to_contain_text(target['next'])
    expect(page.get_by_role('button', name='生成下周建议', exact=True)).to_be_disabled()
    expect(page.locator('.review-report')).to_have_count(0)
    expect(page.locator('.review-day-content')).to_contain_text('暂无菜单')
    assert not errors, errors
    browser.close()
print('PASS review layout: single-row settings, seven target dates, daily totals, historical week, advanced back, empty week, large font')
