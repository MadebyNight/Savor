"""确认菜单紧凑条目：密度、长名称、份数、移除、持久化及确认同步。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width': 320, 'height': 680})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:4173'), wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''() => {
      const s=JSON.parse(localStorage.getItem('shiguang-v1'));
      const names=['番茄炒蛋','清蒸鲈鱼','蒜蓉西兰花','红烧肉','凉拌黄瓜','冬瓜排骨汤','可乐鸡翅','麻婆豆腐','香菇青菜','土豆炖牛腩','香煎三文鱼配芦笋','紫菜蛋花汤'];
      s.recipes=names.map((name,i)=>({...s.recipes[0],id:'selection-'+i,name}));
      s.qty=Object.fromEntries(s.recipes.map((r,i)=>[r.id,i===2?2:1]));
      s.confirmed={};s.confirmedRecipes=[];
      localStorage.setItem('shiguang-v1',JSON.stringify(s));
    }''')
    page.reload(wait_until='networkidle')
    def open_selection(): page.get_by_role('button', name='确认选菜', exact=False).click()
    def click(name): page.get_by_role('button', name=name, exact=True).click()
    def saved(): page.wait_for_function("JSON.parse(localStorage.getItem('shiguang-v1')).qty['selection-0']===2")
    open_selection()
    for width, height in [(320,680),(360,800),(390,844),(430,932),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        chips=page.locator('.selection-chip')
        expect(chips).to_have_count(12)
        page.evaluate('Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))')
        boxes=chips.evaluate_all('(els)=>els.map(e=>({y:e.getBoundingClientRect().y,height:e.getBoundingClientRect().height}))')
        if width<=430: assert sum(abs(b['y']-boxes[0]['y'])<1 for b in boxes)>=3, (width,boxes)
        assert all(b['height']>=48 for b in boxes)
        assert page.locator('.app-dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        for chip in chips.all(): assert chip.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    page.set_viewport_size({'width':320,'height':680})
    # Model Android's 1.15 text scale for the explicit px sizes too.
    scaled=page.add_style_tag(content='.selection-chip{font-size:16.1px}.selection-quantity{font-size:13.8px}')
    ys=page.locator('.selection-chip').evaluate_all('(els)=>els.map(e=>e.getBoundingClientRect().y)')
    assert sum(abs(y-ys[0])<1 for y in ys)>=3
    assert page.locator('.selection-chip').nth(2).evaluate('e=>getComputedStyle(e).flexDirection')=='column'
    scaled.evaluate('e=>e.remove()')
    click('番茄炒蛋，1份');click('增加番茄炒蛋份数')
    expect(page.get_by_role('button',name='番茄炒蛋，2份',exact=True)).to_contain_text('×2')
    expect(page.locator('.selection-summary')).to_have_text('已选 12 道菜 · 共 14 份')
    saved()
    click('关闭弹窗');open_selection()
    expect(page.locator('.selection-editor')).to_have_count(0)
    click('番茄炒蛋，2份');click('减少番茄炒蛋份数');click('减少番茄炒蛋份数')
    expect(page.locator('.selection-chip')).to_have_count(11)
    expect(page.locator('.selection-chip').first).to_be_focused()
    click('香煎三文鱼配芦笋，1份')
    for _ in range(11): click('增加香煎三文鱼配芦笋份数')
    expect(page.get_by_role('button',name='香煎三文鱼配芦笋，12份',exact=True)).to_be_attached()
    assert page.locator('.app-dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    page.evaluate("document.documentElement.style.fontSize='20px'")
    assert page.locator('.app-dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    page.evaluate("document.documentElement.style.fontSize=''")
    click('确认并同步 · 23 份菜品')
    page.wait_for_function("JSON.parse(localStorage.getItem('shiguang-v1')).confirmed['selection-10']===12")
    page.reload(wait_until='networkidle');open_selection()
    expect(page.locator('.selection-chip')).to_have_count(11)
    assert page.evaluate("JSON.parse(localStorage.getItem('shiguang-v1')).confirmedRecipes.length") == 11
    # Empty selection keeps the existing explicit confirmation before clearing procurement.
    while page.locator('.selection-chip').count():
        page.locator('.selection-chip').first.click()
        while page.locator('.selection-editor').count(): page.locator('.selection-stepper button').first.click()
    expect(page.get_by_text('还没有选择菜品。',exact=True)).to_be_visible()
    click('确认并同步 · 0 份菜品')
    expect(page.get_by_role('dialog',name='清空采购需求？',exact=True)).to_be_visible()
    click('取消')
    assert page.evaluate("Object.values(JSON.parse(localStorage.getItem('shiguang-v1')).confirmed).reduce((a,b)=>a+b,0)") == 23
    assert not errors, errors
    browser.close()
print('PASS selection: responsive density, complete names, touch targets, quantities, removal/focus, persistence, confirmation and empty cancellation')
