"""最终预览结构回归：冰箱首屏、组合筛选、连续列表、共用搜索与批次编辑。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/layout-fix'
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width':390,'height':844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'), wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''() => {
      const state=JSON.parse(localStorage.getItem('shiguang-v1'));
      const date=new Date().toLocaleDateString('sv-SE');
      state.fridge=[
        {id:'a',name:'小青菜',category:'蔬菜',qty:676,unit:'g',days:0,date},
        {id:'b',name:'鲜牛奶',category:'奶制品',qty:1,unit:'瓶',days:1,date:'2020-01-01'},
        {id:'c',name:'西兰花',category:'蔬菜',qty:300,unit:'g',days:2,date},
        {id:'d',name:'鸡蛋',category:'其他',qty:6,unit:'个',days:15,date},
        {id:'e',name:'西芹',category:'蔬菜',qty:620,unit:'g',days:0,date},
        {id:'f',name:'鸡胸肉',category:'肉类',qty:400,unit:'g',days:0,date}
      ];
      localStorage.setItem('shiguang-v1',JSON.stringify(state));
    }''')
    page.reload(wait_until='networkidle')
    def nav(name): page.get_by_role('navigation',name='主导航').get_by_role('button',name=name,exact=True).click()
    def click(name): page.get_by_role('button',name=name,exact=True).click()
    nav('冰箱')
    for width,height in [(320,640),(360,800),(390,844),(430,932),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        expect(page.locator('.stock-compact-row').first).to_contain_text('鲜牛奶')
        cats=page.locator('.stock-categories')
        assert cats.bounding_box()['height'] <= 64, (width,cats.bounding_box())
        assert cats.evaluate('e=>getComputedStyle(e).flexDirection') == 'row'
        first=page.locator('.stock-compact-row').first.bounding_box()
        bottom=page.locator('.mobile-bottom-nav').bounding_box()['y']
        if height>=640: assert first['y']+first['height'] < bottom-100, (width,first,bottom)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('.workspace').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        if width in (360,390): page.screenshot(path=str(OUT/f'fridge-{width}.png'))
    page.set_viewport_size({'width':390,'height':844})
    search=page.get_by_role('textbox',name='搜索冰箱食材',exact=True)
    search.fill('小青菜');expect(page.locator('.stock-compact-row')).to_have_count(1)
    page.get_by_label('期限筛选',exact=True).click();page.locator('.picker-options').get_by_role('button',name='过期',exact=True).click()
    expect(page.locator('.stock-compact-row')).to_have_count(0)
    expect(page.get_by_text('没有符合当前搜索和筛选条件的食材。',exact=True)).to_be_visible()
    click('清除筛选');expect(page.locator('.stock-compact-row')).to_have_count(6)
    page.locator('.stock-categories').get_by_role('button',name='肉类',exact=True).click()
    expect(page.locator('.stock-compact-row')).to_have_count(1)
    page.locator('.stock-compact-row').click()
    expect(page.get_by_label('食材名称',exact=True)).to_have_value('鸡胸肉')
    page.get_by_label('数量',exact=True).fill('450');click('保存食材修改')
    expect(page.locator('.stock-compact-row')).to_contain_text('450')
    page.locator('.stock-categories').get_by_role('button',name='全部',exact=True).click()
    search.fill('西芹');nav('点单');nav('冰箱');expect(search).to_have_value('西芹')
    search.fill('');page.get_by_role('button',name='手动添加',exact=True).click()
    fields=page.locator('.stock-fields')
    page.wait_for_function("() => {const labels=document.querySelectorAll('.stock-fields > label');return Math.abs(labels[1].getBoundingClientRect().y-labels[2].getBoundingClientRect().y)<1;}")
    page.screenshot(path=str(OUT/'stock-sheet.png'),animations='disabled');click('关闭弹窗')
    page.set_viewport_size({'width':320,'height':640})
    page.evaluate("document.documentElement.style.fontSize='20px'")
    assert page.locator('.workspace').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    for row in page.locator('.stock-compact-row').all(): assert row.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    page.evaluate("document.documentElement.style.fontSize=''")
    for name in ['点单','菜谱','冰箱']:
        nav(name)
        field=page.locator('.search input').first
        field.focus()
        assert field.evaluate('e=>getComputedStyle(e).boxShadow')=='none'
        assert field.locator('..').evaluate('e=>getComputedStyle(e).outlineColor')=='rgb(181, 155, 84)'
    nav('菜篮子')
    assert page.locator('.stock-categories').evaluate('e=>getComputedStyle(e).flexDirection')=='column'
    assert not errors, errors
    browser.close()
print('PASS layout: stock first screen, combined filters, empty state, sorted batch edit, search persistence, sheet fields, large font, shared search, basket isolation')
