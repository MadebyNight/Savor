"""正式手机布局回归。使用独立浏览器上下文，截图为评审产物。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/mobile-review'
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: (errors.append('Unexpected native dialog: '+d.type), d.dismiss()))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:5173'))
    page.wait_for_load_state('networkidle')

    def nav(name):
        page.get_by_role('navigation', name='主导航').get_by_role('button',name=name,exact=True).click()

    def state():
        return page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')

    def shot(name):
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.locator('[data-sonner-toast]').evaluate_all('(items) => items.forEach(item => item.style.visibility = "hidden")')
        page.screenshot(path=str(OUT / name))

    def no_overflow():
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), '页面水平溢出'
        for target in ['.workspace', '.recipe-section', '.stock-results']:
            element=page.locator(target)
            if element.count():
                assert element.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), f'{target} 水平溢出'

    expect(page.get_by_role('heading', name='点单', exact=True)).to_be_visible()
    assert page.locator('.recipe-card').first.bounding_box()['y'] < 210
    expect(page.locator('.welcome-banner')).not_to_be_visible()
    shot('01-点单.png')
    page.get_by_label('搜索菜品',exact=True).fill('鸡胸肉')
    assert page.locator('.recipe-card').count() == 1
    nav('冰箱'); nav('点单')
    expect(page.get_by_label('搜索菜品',exact=True)).to_have_value('鸡胸肉')
    page.get_by_label('搜索菜品',exact=True).fill('')
    page.locator('.categories').get_by_role('button',name='素菜').click()
    assert page.locator('.recipe-card').count() >= 1
    page.locator('.categories').get_by_role('button',name='全部').click()
    page.get_by_role('button',name='添加番茄炒鸡蛋',exact=True).click()
    page.get_by_role('button',name='添加番茄炒鸡蛋',exact=True).click()
    page.get_by_role('button',name='确认选菜',exact=False).click()
    page.get_by_role('dialog').get_by_role('button',name='确认并同步',exact=False).click()
    page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).confirmed[1] === 2')
    shot('02-已选.png')

    nav('冰箱')
    page.get_by_role('button',name='手动添加',exact=True).click()
    page.get_by_role('dialog').get_by_label('食材名称',exact=True).fill('番茄')
    page.get_by_role('dialog').get_by_label('数量',exact=True).fill('100')
    # 同时用于生产预览，防止 CSS 构建优化引入弹窗位移回归。
    for height in [336, 844]:
        page.set_viewport_size({'width':390,'height':height})
        page.wait_for_function("""() => {
            const r=document.querySelector('.app-dialog').getBoundingClientRect();
            return r.left>=-1 && r.top>=-1 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;
        }""")
    page.get_by_role('button',name='确认放入冰箱',exact=True).click()
    page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).fridge.length === 1')
    shot('03-冰箱.png')
    nav('菜篮子')
    expect(page.locator('.stock-card').filter(has=page.get_by_role('heading',name='番茄',exact=True))).to_contain_text('500')
    shot('04-采购.png')

    nav('周菜单')
    page.locator('.week-dates button').first.click()
    page.get_by_role('button',name='安排周1早餐',exact=True).click()
    page.get_by_role('dialog').get_by_role('button',name='番茄炒鸡蛋',exact=True).click()
    page.get_by_label('番茄炒鸡蛋餐次份数',exact=True).fill('3')
    page.wait_for_function('Object.values(JSON.parse(localStorage.getItem("shiguang-v1")).weeks).some(w=>w["0-早"]?.[0]?.servings === 3)')
    assert state()['confirmed']['1'] == 2
    page.get_by_role('button',name='关闭弹窗',exact=True).click()
    page.locator('.week-dates button').nth(1).click()
    expect(page.get_by_label('番茄炒鸡蛋餐次份数')).not_to_be_visible()
    page.get_by_role('button',name='一周总览',exact=True).click()
    expect(page.locator('.meal-table-dishes').filter(has_text='番茄炒鸡蛋')).to_contain_text('×3')
    page.get_by_role('button',name='返回单日',exact=True).click()
    page.locator('.week-dates button').first.click()
    shot('05-周菜单.png')

    nav('菜谱')
    expect(page.get_by_placeholder('给这道菜起个名字')).not_to_be_visible()
    shot('06-菜谱.png')
    page.get_by_role('button',name='导入菜谱',exact=True).click();page.get_by_role('button',name='手动添加',exact=True).click()
    page.get_by_placeholder('给这道菜起个名字').fill('手机回归菜谱')
    page.get_by_label('食材名称',exact=True).fill('土豆')
    page.get_by_label('步骤1',exact=True).fill('洗净切块并煮熟。')
    page.get_by_role('button',name='返回',exact=True).click();nav('点单');nav('菜谱')
    page.get_by_role('button',name='导入菜谱',exact=True).click();page.get_by_role('button',name='手动添加',exact=True).click()
    expect(page.get_by_placeholder('给这道菜起个名字')).to_have_value('手机回归菜谱')
    no_overflow()
    page.get_by_role('button',name='确认保存到菜品库',exact=True).click()
    page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(r=>r.name==="手机回归菜谱")')

    # 删除菜谱不得破坏已安排快照与采购。
    page.get_by_role('button',name='番茄炒鸡蛋',exact=True).click()
    page.locator('.detail-more > summary').click()
    page.get_by_role('button',name='编辑菜谱',exact=True).click()
    expect(page.get_by_placeholder('给这道菜起个名字')).to_have_value('番茄炒鸡蛋')
    page.get_by_role('button',name='返回',exact=True).click()
    nav('点单')
    page.get_by_role('button',name='番茄炒鸡蛋',exact=True).click()
    page.locator('.detail-more > summary').click()
    page.get_by_role('button',name='删除菜谱',exact=True).click()
    confirm = page.get_by_role('dialog',name='删除这道菜谱？',exact=True)
    expect(confirm.get_by_role('button',name='取消',exact=True)).to_be_focused()
    before = state()
    confirm.get_by_role('button',name='取消',exact=True).click()
    assert state() == before
    page.get_by_role('button',name='删除菜谱',exact=True).click()
    page.keyboard.press('Escape')
    expect(confirm).not_to_be_visible()
    assert state() == before
    page.get_by_role('button',name='删除菜谱',exact=True).click()
    confirm.get_by_role('button',name='关闭弹窗',exact=True).click()
    assert state() == before
    page.get_by_role('button',name='删除菜谱',exact=True).click()
    confirm.get_by_role('button',name='确认删除',exact=True).click()
    nav('周菜单')
    expect(page.locator('.meal-table-dishes').filter(has_text='番茄炒鸡蛋')).to_contain_text('×3')
    nav('点单')
    page.get_by_role('button',name='确认选菜',exact=False).click()
    page.get_by_role('dialog').get_by_role('button',name='确认并同步',exact=False).click()
    before_clear = state()
    page.get_by_role('dialog',name='清空采购需求？',exact=True).get_by_role('button',name='取消',exact=True).click()
    assert state() == before_clear
    page.get_by_role('dialog').get_by_role('button',name='确认并同步',exact=False).click()
    page.get_by_role('dialog',name='清空采购需求？',exact=True).get_by_role('button',name='确认清空').click()
    page.wait_for_function('!Object.values(JSON.parse(localStorage.getItem("shiguang-v1")).confirmed).some(Boolean)')
    nav('周菜单')
    expect(page.locator('.meal-table-dishes').filter(has_text='番茄炒鸡蛋')).to_contain_text('×3')

    for width,height in [(360,800),(390,844),(430,932),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        for name in ['点单','冰箱','菜篮子','周菜单','菜谱']:
            nav(name);no_overflow()
        nav('点单')
        page.get_by_role('button',name='设置与备份').click()
        no_overflow()
        page.get_by_role('button',name='返回',exact=True).click()
    page.set_viewport_size({'width':390,'height':844})
    page.emulate_media(reduced_motion='reduce')
    page.evaluate('''() => {
      const sizes = [...document.querySelectorAll('.compact-app *, .mobile-bottom-nav *')].map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);
      sizes.forEach(([el,size]) => el.style.fontSize=`${size*1.3}px`);
    }''')
    no_overflow()
    page.reload();page.wait_for_load_state('networkidle')
    nav('周菜单');page.locator('.week-dates button').first.click()
    expect(page.locator('.meal-table-dishes').filter(has_text='番茄炒鸡蛋')).to_contain_text('×3')
    assert not errors,errors
    print('PASS: mobile navigation, filtering, purchase deduction, day/overview, draft resume, edit, snapshot after delete/clear, restart, 4 viewport sizes, enlarged text')
    browser.close()
