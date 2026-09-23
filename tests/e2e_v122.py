"""V1.2.2：筛选组合、取消与页面独立性，以及次级页固定操作和返回层级。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/device-logs'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width': 320, 'height': 680})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:5173'), wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''() => {
      const state=JSON.parse(localStorage.getItem('shiguang-v1'));
      state.recipes = [null,0,15,16,30,31].map((time,i)=>({...state.recipes[0],id:100+i,name:'测试菜'+i,category:'自定义分类',time}));
      state.recipes.push({...state.recipes[0],id:200,name:'另一种菜',category:'素菜',time:15});
      state.weeks={'2026-09-14':Object.fromEntries(Array.from({length:7},(_,d)=>[`${d}-早`,[{...state.recipes[0],name:`第${d+1}天菜`,servings:1}]]))};
      localStorage.setItem('shiguang-v1',JSON.stringify(state));
    }''')
    page.reload(wait_until='networkidle')
    def click(name): page.get_by_role('button', name=name, exact=True).click()
    def nav(name): page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()
    def back(): page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")
    def apply(category, duration):
        click('筛选菜谱'); click(category); click(duration); click('确定')
    nav('菜谱')
    apply('自定义分类', '15 分钟内')
    expect(page.locator('.library-recipe')).to_have_count(1)
    expect(page.locator('.library-recipe')).to_contain_text('测试菜2')
    click('筛选菜谱'); click('素菜'); back()
    expect(page.locator('.library-recipe')).to_contain_text('测试菜2')
    apply('自定义分类', '16～30 分钟')
    expect(page.locator('.library-recipe')).to_have_count(2)
    page.get_by_label('搜索我的菜谱', exact=True).fill('测试菜4')
    expect(page.locator('.library-recipe')).to_have_count(1)
    nav('点单'); expect(page.locator('.recipe-card')).to_have_count(7)
    nav('菜谱'); expect(page.locator('.library-recipe')).to_contain_text('测试菜4')
    page.get_by_label('搜索我的菜谱', exact=True).fill('')
    apply('自定义分类', '未填写'); expect(page.locator('.library-recipe')).to_have_count(2)
    apply('自定义分类', '30 分钟以上'); expect(page.locator('.library-recipe')).to_contain_text('测试菜5')
    page.get_by_label('搜索我的菜谱', exact=True).fill('不存在')
    click('清除搜索与筛选'); expect(page.locator('.library-recipe')).to_have_count(7)
    click('筛选菜谱'); click('素菜'); click('重置'); click('确定')
    expect(page.locator('.library-recipe')).to_have_count(7)
    for width, height, font in [(320,680,14),(320,640,20),(390,844,14),(844,390,14)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('size=>document.documentElement.style.fontSize=size+"px"', font)
        assert page.locator('.topbar').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        assert page.locator('.library-search').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        colors=page.evaluate("[document.querySelector('.topbar'),document.querySelector('.mobile-bottom-nav')].map(e=>getComputedStyle(e).backgroundColor)")
        assert colors[0]==colors[1],colors
    page.set_viewport_size({'width':320,'height':680})
    page.evaluate("document.documentElement.style.fontSize='14px'")
    page.screenshot(animations='disabled', path=str(OUT/'v122-library.png'))
    page.locator('.library-recipe').first.click()
    detail=page.locator('.recipe-detail-dialog')
    expect(detail.locator('.dialog-page-footer')).to_be_in_viewport()
    expect(page.get_by_role('button',name='删除菜谱',exact=True)).not_to_be_visible()
    detail.evaluate('async e=>{await Promise.all(e.getAnimations().map(a=>a.finished))}')
    header=detail.locator('.dialog-page-header').bounding_box()
    detail.locator('.dialog-page-body').evaluate('e=>e.scrollTop=e.scrollHeight')
    assert detail.locator('.dialog-page-header').bounding_box()==header
    page.screenshot(animations='disabled', path=str(OUT/'v122-detail.png'))
    detail.locator('.dialog-page-body').evaluate('e=>e.scrollTop=0')
    click('查看菜谱大图'); expect(page.locator('.image-preview-dialog')).to_be_visible(); back()
    expect(detail).to_be_visible(); back()
    click('导入菜谱'); expect(page.get_by_role('navigation',name='主导航')).to_have_count(0)
    page.screenshot(animations='disabled', path=str(OUT/'v122-import.png'))
    click('手动添加')
    expect(page.locator('.editor-save-bar')).to_be_in_viewport()
    page.get_by_placeholder('给这道菜起个名字').fill('保留手动草稿')
    page.set_viewport_size({'width':320,'height':360})
    expect(page.locator('.editor-save-bar')).to_be_in_viewport()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size({'width':320,'height':680})
    page.screenshot(animations='disabled', path=str(OUT/'v122-editor.png'))
    back(); click('导入菜谱'); click('手动添加')
    expect(page.get_by_placeholder('给这道菜起个名字')).to_have_value('保留手动草稿'); back()
    nav('周菜单'); click('历史')
    expect(page.locator('.history-dates button')).to_have_count(7)
    expect(page.get_by_role('dialog')).to_contain_text('第1天菜')
    page.locator('.history-dates button').last.click()
    expect(page.get_by_role('dialog')).to_contain_text('第7天菜')
    expect(page.get_by_role('button',name='复制菜单',exact=True)).not_to_be_visible()
    page.screenshot(animations='disabled', path=str(OUT/'v122-history.png')); back()
    nav('冰箱'); click('手动添加')
    expect(page.locator('.stock-dialog .dialog-page-footer')).to_be_in_viewport()
    page.screenshot(animations='disabled', path=str(OUT/'v122-stock.png')); back()
    page.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('shiguang-v1'));s.recipes=Array.from({length:25},(_,i)=>({...s.recipes[0],id:i,name:'推荐菜'+i}));s.fridge=[{id:'test',name:'番茄',qty:1,unit:'g',date:'2026-09-23',days:0,category:'蔬菜'}];localStorage.setItem('shiguang-v1',JSON.stringify(s));}""")
    page.reload(wait_until='networkidle');nav('冰箱');click('看看能做什么')
    page.locator('.fridge-recipe-choice').last.scroll_into_view_if_needed()
    scroll=page.locator('.dialog-page-body').evaluate('e=>e.scrollTop')
    assert scroll>0
    page.locator('.fridge-recipe-choice').last.click();back()
    expect(page.locator('.fridge-recipe-choice')).to_have_count(25)
    assert abs(page.locator('.dialog-page-body').evaluate('e=>e.scrollTop')-scroll)<1
    back()
    assert not errors,errors
    print('PASS filters/category/custom/unknown/boundaries/keyword/cancel/reset/page isolation, fixed chrome/actions, draft/back/history/image viewer')
    browser.close()
