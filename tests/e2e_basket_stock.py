"""菜篮子库存说明：隔离示例数据，验证差额、未知用量、勾选与窄屏。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/device-logs'

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width':390,'height':844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4175'),wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''() => {
      const state=JSON.parse(localStorage.getItem('shiguang-v1'));
      const recipe={...state.recipes[0],id:'basket-test',name:'库存说明测试',ingredients:[
        {name:'番茄',qty:500,unit:'g',category:'蔬菜'},
        {name:'鸡蛋',qty:3,unit:'个',category:'其他'},
        {name:'小葱',qty:null,unit:'g',category:'蔬菜'}]};
      state.recipes=[recipe]; state.confirmedRecipes=[recipe]; state.confirmed={'basket-test':1};state.purchased={};
      state.fridge=[{id:'a',name:'西红柿',qty:200,unit:'克',days:0},
        {id:'b',name:'小葱',qty:50,unit:'g',days:0},
        {id:'c',name:'番茄',qty:900,unit:'g',days:1,date:'2020-01-01'}];
      localStorage.setItem('shiguang-v1',JSON.stringify(state));
    }''')
    page.reload(wait_until='networkidle')
    def basket():
        page.get_by_role('navigation',name='主导航').get_by_role('button',name='菜篮子',exact=True).click()
    basket()
    tomato=page.locator('.shopping-card').filter(has=page.get_by_role('heading',name='番茄',exact=True))
    expect(tomato.locator('strong')).to_contain_text('还需买 300')
    expect(tomato.locator('.shopping-stock-note')).to_have_text('共需 500g · 冰箱可用 200g')
    expect(tomato.locator('.shopping-stock-reason')).to_have_text('库存不足，补买差额')
    egg=page.locator('.shopping-card').filter(has=page.get_by_role('heading',name='鸡蛋',exact=True))
    expect(egg.locator('.shopping-stock-note')).to_have_text('共需 3个 · 冰箱可用 0个')
    expect(egg.locator('.shopping-stock-reason')).to_have_count(0)
    unknown=page.locator('.shopping-card').filter(has=page.get_by_role('heading',name='小葱',exact=True))
    expect(unknown.locator('.shopping-stock-note')).to_have_text('用量待确认 · 冰箱可用 50g')
    expect(unknown.locator('.shopping-stock-reason')).to_have_text('请核对所需用量')
    tomato.get_by_role('checkbox').check()
    expect(tomato.locator('strong')).to_contain_text('已买 300')
    page.reload(wait_until='networkidle');basket()
    expect(tomato.get_by_role('checkbox')).to_be_checked()
    tomato.get_by_role('checkbox').uncheck()
    for width,height,font in [(320,680,14),(320,640,20),(390,844,14),(844,390,14)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('size=>document.documentElement.style.fontSize=size+"px"',font)
        for card in page.locator('.shopping-card').all():
            assert card.evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(width,font)
        assert page.locator('.stock-results').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(width,font)
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(OUT/'basket-stock-app.png'),full_page=True)
    assert not errors,errors
    browser.close()
    print('PASS: stock notes, unknown quantities, purchase persistence, narrow/large-font layouts')
