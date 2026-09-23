"""隔离浏览器验证全部库存清空、确认取消、保存失败和采购重算。"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':320,'height':680})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4175'),wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''()=>{
      const s=JSON.parse(localStorage.getItem('shiguang-v1'));
      const r={...s.recipes[0],ingredients:[{name:'番茄',qty:500,unit:'g',category:'蔬菜'}]};
      s.confirmedRecipes=[r];s.confirmed={[r.id]:1};s.purchased={};
      s.fridge=[{id:'a',name:'番茄',qty:200,unit:'g',days:0,category:'蔬菜'},
        {id:'b',name:'鸡蛋',qty:3,unit:'个',days:0,category:'其他'}];
      localStorage.setItem('shiguang-v1',JSON.stringify(s));
    }''')
    page.reload(wait_until='networkidle')
    def nav(name):page.get_by_role('navigation',name='主导航').get_by_role('button',name=name,exact=True).click()
    def state():return page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')
    nav('冰箱')
    page.get_by_label('搜索冰箱食材',exact=True).fill('番茄')
    baseline=state()
    clear=page.get_by_role('button',name='一键清空',exact=True)
    clear.click()
    expect(page.get_by_role('dialog')).to_contain_text('全部 2 批库存')
    page.get_by_role('button',name='取消',exact=True).click()
    assert state()['fridge']==baseline['fridge']
    page.evaluate('''()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='shiguang-v1')throw new Error('test write failure');return window.originalSetItem.call(this,k,v)}}''')
    clear.click();page.get_by_role('button',name='确认清空冰箱',exact=True).click()
    expect(clear).to_be_enabled()
    assert state()['fridge']==baseline['fridge']
    expect(page.locator('.stock-compact-row')).to_have_count(1)
    page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem;}')
    for width,font in [(320,14),(320,20),(390,14)]:
        page.set_viewport_size({'width':width,'height':844})
        page.evaluate('n=>document.documentElement.style.fontSize=n+"px"',font)
        assert page.locator('.stock-bottom-actions').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        a=clear.bounding_box();b=page.locator('.stock-recommend-entry').bounding_box()
        assert abs(a['y']-b['y'])<1
    page.screenshot(path=str(ROOT/'.android-tools/device-logs/clear-fridge-actions.png'),animations='disabled',full_page=True)
    clear.click();page.get_by_role('button',name='确认清空冰箱',exact=True).click()
    expect(clear).to_be_disabled()
    page.reload(wait_until='networkidle');nav('冰箱')
    expect(clear).to_be_disabled()
    current=state();assert current['fridge']==[]
    for field in ['recipes','confirmed','confirmedRecipes','weeks','archives']:assert current.get(field)==baseline.get(field),field
    nav('菜篮子');expect(page.locator('.shopping-card strong').first).to_contain_text('500')
    assert not errors,errors
    browser.close()
    print('PASS: cancel, failed save, all batches despite filter, empty disabled, restart, preserved recipes/menus, procurement recalculated, side-by-side layout')
