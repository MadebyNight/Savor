"""点单首屏密度、可点击面积及冰箱跨同义词推荐。"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.android-tools/device-logs'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':320,'height':680})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'),wait_until='networkidle')
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    def nav(name):page.get_by_role('navigation',name='主导航').get_by_role('button',name=name,exact=True).click()
    click('添加番茄炒鸡蛋')
    data=page.evaluate("""()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {y:r.y,height:r.height,bottom:r.bottom}};const area=rect('.recipe-section');return {top:rect('.topbar'),search:rect('.mobile-search'),nav:rect('.mobile-bottom-nav'),confirm:rect('.selection-bar'),card:rect('.recipe-card'),visible:[...document.querySelectorAll('.recipe-card')].filter(e=>{const r=e.getBoundingClientRect();return r.y>=area.y&&r.bottom<=area.bottom}).length}}""")
    assert data['visible']>=5,data
    (OUT/'order-after.json').write_text(json.dumps(data))
    page.screenshot(path=str(OUT/'order-after.png'))
    for width,height in [(320,640),(390,844),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for button in page.locator('.recipe-card .counter button').all():
            box=button.bounding_box();assert box['width']>=48 and box['height']>=48
        assert page.locator('.recipe-section').bounding_box()['y']+page.locator('.recipe-section').bounding_box()['height']<=page.locator('.selection-bar').bounding_box()['y']
    click('确认选菜');expect(page.get_by_role('dialog')).to_be_visible();click('关闭弹窗')
    page.set_viewport_size({'width':320,'height':680})
    for name in ['点单','菜谱','菜篮子','周菜单','冰箱']:
        nav(name)
        assert abs(page.locator('.topbar').bounding_box()['height']-data['top']['height'])<1,name
        assert abs(page.locator('.mobile-bottom-nav').bounding_box()['height']-data['nav']['height'])<1,name
        assert page.locator('.topbar').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),name
    nav('菜谱')
    tools=page.locator('.library-tools')
    search=page.get_by_role('textbox',name='搜索我的菜谱',exact=True)
    import_button=page.get_by_role('button',name='导入菜谱',exact=True)
    assert search.locator('..').bounding_box()['height']<=45
    expect(page.locator('.topbar').get_by_role('button',name='导入菜谱',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='新建菜谱',exact=True)).to_have_count(0)
    visible=page.locator('.library-recipe').evaluate_all("es=>es.filter(e=>e.getBoundingClientRect().bottom<=document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top).length")
    assert visible>=7,visible
    page.screenshot(path=str(OUT/'library-compact.png'))
    search.fill('番茄');assert page.locator('.library-recipe').count()==2
    page.locator('.library-recipe').first.click();expect(page.get_by_role('dialog')).to_contain_text('番茄炒鸡蛋');click('关闭弹窗')
    search.fill('');click('导入菜谱');expect(page.get_by_label('识别原文',exact=True)).to_be_visible();click('手动添加')
    expect(page.get_by_role('heading',name='新建菜谱',exact=True).first).to_be_visible()
    click('返回')
    nav('点单');click('设置与备份')
    assert abs(page.locator('.topbar').bounding_box()['height']-data['top']['height'])<1
    click('返回')
    # 名称、份数和主操作在小屏大字号下仍可用，长标题可以换行。
    page.evaluate("""()=>{const state=JSON.parse(localStorage.getItem('shiguang-v1'));state.recipes[0].name='番茄鸡蛋搭配香菇青菜的家常炖菜';state.fridge=[{name:'西红柿',qty:1,unit:'g',days:0,date:'2026-09-23',id:'alias',category:'蔬菜'}];localStorage.setItem('shiguang-v1',JSON.stringify(state));}""")
    page.reload(wait_until='networkidle');page.set_viewport_size({'width':320,'height':680})
    page.evaluate("document.documentElement.style.fontSize='20px'")
    assert page.locator('.recipe-card').first.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    click('添加番茄鸡蛋搭配香菇青菜的家常炖菜')
    expect(page.locator('.recipe-card').first.locator('.counter b')).to_have_text('2')
    nav('冰箱');click('看看能做什么')
    expect(page.locator('.fridge-recipe-choice').first).to_contain_text('已有 1 种食材')
    page.locator('.fridge-recipe-choice').first.click()
    expect(page.locator('.detail-ingredient').filter(has_text='番茄')).to_contain_text('缺少')
    assert not errors,errors
    print('PASS order density, target sizes, selected counts, long names, alias recommendation; measurements:',json.dumps(data))
    browser.close()
