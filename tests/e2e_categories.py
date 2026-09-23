"""自定义分类、独立滚动、删除确认、持久化及点单按钮对齐。使用隔离浏览器。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.android-tools/device-logs'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':320,'height':680})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4175'),wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''()=>{
      const s=JSON.parse(localStorage.getItem('shiguang-v1'));
      s.recipeCategories=['荤菜',...Array.from({length:24},(_,i)=>'自定义'+i),'未分类'];
      s.recipes=s.recipes.map(r=>({...r,category:'荤菜'}));
      s.qty={[s.recipes[0].id]:1};s.confirmed={};s.confirmedRecipes=[];
      localStorage.setItem('shiguang-v1',JSON.stringify(s));
    }''')
    page.reload(wait_until='networkidle')
    side=page.locator('.categories')
    expect(side.locator('small')).to_have_count(0)
    side.locator('[data-category="荤菜"]').click()
    expect(page.locator('.recipe-section .section-tools h2')).to_contain_text('荤菜')
    expect(page.locator('.recipe-section .section-tools h2 span')).to_have_text(f'{page.locator(".recipe-card").count()} 道菜')
    manage=side.get_by_role('button',name='管理分类',exact=True)
    assert side.evaluate('e=>e.scrollHeight>e.clientHeight')
    assert manage.evaluate('e=>e.getBoundingClientRect().top>e.parentElement.getBoundingClientRect().bottom')
    right=page.locator('.recipe-section').evaluate('e=>e.scrollTop')
    manage.scroll_into_view_if_needed()
    assert page.locator('.recipe-section').evaluate('e=>e.scrollTop')==right
    manage.click()
    expect(page.get_by_role('button',name='添加分类',exact=True)).to_be_disabled()
    page.get_by_label('新增分类名称',exact=True).fill('夜宵')
    page.get_by_role('button',name='添加分类',exact=True).click()
    page.get_by_label('新增分类名称',exact=True).fill('夜宵')
    page.get_by_role('button',name='添加分类',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('同名')
    page.get_by_role('button',name='关闭弹窗',exact=True).click()
    expect(side.locator('[data-category="夜宵"]')).to_be_in_viewport()
    page.reload(wait_until='networkidle')
    expect(side.locator('[data-category="夜宵"]')).to_have_count(1)
    manage.click()
    page.get_by_role('button',name='管理荤菜',exact=True).click()
    expect(page.get_by_label('新增分类名称',exact=True)).to_have_value('')
    expect(page.get_by_label('菜谱转入分类',exact=True)).to_have_count(0)
    expect(page.locator('.category-management-row').first.locator('.category-inline-editor')).to_be_visible()
    page.get_by_label('修改荤菜分类名称',exact=True).fill('未保存')
    page.get_by_role('button',name='取消编辑',exact=True).click()
    expect(page.get_by_role('button',name='管理荤菜',exact=True)).to_be_visible()
    page.get_by_role('button',name='管理荤菜',exact=True).click()
    page.get_by_label('修改荤菜分类名称',exact=True).fill('夜宵')
    page.get_by_role('button',name='保存名称',exact=True).click()
    expect(page.locator('.category-inline-editor [role="alert"]')).to_contain_text('同名')
    page.get_by_label('修改荤菜分类名称',exact=True).fill('家常菜')
    page.get_by_role('button',name='保存名称',exact=True).click()
    page.get_by_role('button',name='管理家常菜',exact=True).click()
    page.get_by_role('button',name='删除此分类',exact=True).click()
    page.get_by_role('button',name='取消',exact=True).click()
    expect(page.get_by_label('修改家常菜分类名称',exact=True)).to_have_value('家常菜')
    page.get_by_role('button',name='删除此分类',exact=True).click()
    expect(page.get_by_role('dialog',name='删除分类？',exact=True)).to_contain_text('归入「未分类」')
    page.get_by_role('button',name='确认删除分类',exact=True).click()
    page.get_by_role('button',name='关闭弹窗',exact=True).click()
    page.reload(wait_until='networkidle')
    assert page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.every(r=>r.category==="未分类")')
    expect(side.locator('[data-category="荤菜"]')).to_have_count(0)
    expect(side.locator('[data-category="家常菜"]')).to_have_count(0)
    for width,height,font in [(320,680,14),(320,640,20),(390,844,14),(844,390,14)]:
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('size=>document.documentElement.style.fontSize=size+"px"',font)
        assert page.locator('.selection-bar').evaluate('''e=>{const a=e.getBoundingClientRect(),b=e.querySelector('.primary').getBoundingClientRect();return Math.abs(a.right-b.right)<1&&Math.abs(a.top-b.top)<1&&Math.abs(a.bottom-b.bottom)<1&&e.scrollWidth<=e.clientWidth+1}'''),(width,font)
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path=str(OUT/'categories-order.png'),animations='disabled')
    manage.click()
    page.get_by_role('button',name='管理自定义0',exact=True).click()
    for width,font in [(320,20),(390,14)]:
        page.set_viewport_size({'width':width,'height':844})
        page.evaluate('size=>document.documentElement.style.fontSize=size+"px"',font)
        assert page.locator('.category-inline-editor').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        assert page.locator('.category-add-field').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        assert page.locator('.category-edit-actions').bounding_box()['y']>=page.locator('.category-inline-editor input').bounding_box()['y']+page.locator('.category-inline-editor input').bounding_box()['height']
    page.screenshot(path=str(OUT/'categories-manager.png'),animations='disabled')
    assert not errors,errors
    browser.close()
    print('PASS: categories CRUD, duplicate/cancel/transfer, persistence, independent scroll, button alignment')
