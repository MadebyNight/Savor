"""五餐十道菜首屏、快照重启和库存编辑的正式界面回归。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.android-tools/v1.2.1'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':360,'height':800})
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'),wait_until='domcontentloaded')
    page.get_by_role('navigation',name='主导航').wait_for()
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''async()=>{
      const MEALS=[['早'],['中'],['下午茶'],['晚'],['夜宵']];
      const monday=value=>{const d=new Date(value+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return d.toLocaleDateString('sv-SE');};
      const state=JSON.parse(localStorage.getItem('shiguang-v1'));
      const week=monday(new Date().toLocaleDateString('sv-SE'));
      const names=['燕麦粥','水煮蛋','番茄炒鸡蛋','清蒸鱼','炒青菜','酸奶','米饭','香菇鸡肉','冬瓜汤','牛奶'];let n=0;
      state.weeks={[week]:Object.fromEntries(MEALS.map(([key],i)=>['0-'+key,Array.from({length:[2,3,1,3,1][i]},()=>({id:'test-'+n,name:names[n++],ingredients:[],steps:[],servings:1}))]))};
      localStorage.setItem('shiguang-v1',JSON.stringify(state));
    }''')
    page.reload(wait_until='domcontentloaded')
    def nav(name):page.get_by_role('navigation',name='主导航').get_by_role('button',name=name,exact=True).click()
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    nav('周菜单');page.locator('.week-dates button').first.click()
    expect(page.locator('.week-summary')).to_contain_text('10 道菜')
    assert page.locator('.week-heading').bounding_box()['y'] < page.locator('.week-dates').bounding_box()['y'] < page.locator('.week-summary').bounding_box()['y']
    click('安排菜品');page.get_by_label('安排餐次',exact=True).click();page.locator('.picker-options').get_by_role('button',name='夜宵',exact=True).click()
    expect(page.locator('.picker-dialog')).to_have_count(0)
    expect(page.get_by_role('dialog')).to_contain_text('夜宵 · 管理菜品');click('关闭弹窗')
    page.locator('.week-picker > summary').click()
    previous=page.get_by_label('当前周',exact=True).get_attribute('value')
    click('下一周');assert page.get_by_label('当前周',exact=True).get_attribute('value')!=previous
    click('上一周');expect(page.get_by_label('当前周',exact=True)).to_have_attribute('value',previous)
    page.locator('.week-picker > summary').click()
    for width,height in [(360,800),(390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        expect(page.locator('.meal-table-row')).to_have_count(5)
        expect(page.locator('.meal-table-dishes>span')).to_have_count(10)
        bottom=page.locator('.mobile-bottom-nav').bounding_box()['y']
        for box in page.locator('.meal-table-dishes>span').all():
            rect=box.bounding_box();assert rect['y']>=0 and rect['y']+rect['height']<bottom,(width,rect,bottom)
        page.screenshot(path=str(OUT/f'five-meals-{width}.png'))
    expect(page.get_by_role('region',name='当日预计营养')).to_contain_text('未估算')
    click('安排周1下午茶餐');page.get_by_label('酸奶餐次份数').fill('2');click('关闭弹窗')
    expect(page.locator('.meal-table-dishes').filter(has_text='酸奶')).to_contain_text('×2')
    click('一周总览');expect(page.locator('.meal-table-row')).to_have_count(35)
    click('返回单日');page.reload(wait_until='domcontentloaded');nav('周菜单');page.locator('.week-dates button').first.click()
    expect(page.locator('.meal-table-dishes').filter(has_text='酸奶')).to_contain_text('×2')
    nav('冰箱');page.get_by_role('button',name='手动添加',exact=True).click()
    page.get_by_label('食材名称',exact=True).fill('手动未知期限食材')
    page.get_by_label('数量',exact=True).fill('0.5')
    page.get_by_label('保存天数',exact=True).fill('0')
    for width,height in [(360,800),(320,640),(740,360)]:
        page.set_viewport_size({'width':width,'height':height})
        dialog=page.get_by_role('dialog');assert dialog.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        page.get_by_role('button',name='确认放入冰箱').scroll_into_view_if_needed()
    click('确认放入冰箱')
    expect(page.locator('.stock-compact-row')).to_contain_text('保存期待补充')
    page.locator('.stock-compact-row').click();page.get_by_label('数量',exact=True).fill('1.5');click('保存食材修改')
    expect(page.locator('.stock-compact-row')).to_contain_text('1.5')
    page.set_viewport_size({'width':320,'height':640})
    page.locator('.stock-compact-row').click()
    page.evaluate("document.documentElement.style.fontSize='20px'")
    assert page.get_by_role('dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    assert not errors,errors
    browser.close()
print('PASS: ten dishes visible, five meals, overview, restart, unknown stock, edit, narrow/keyboard/enlarged layout')
