"""冰箱入口、自动识别草稿保护、采购进度与周菜单工具布局。"""
import base64
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/device-logs'
IMAGE = {'name':'test.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width':320,'height':800})
    errors, requests, pending = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'), wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate("""()=>{
      const state=JSON.parse(localStorage.getItem('shiguang-v1'));
      state.fridge=Array.from({length:40},(_,i)=>({id:`f${i}`,name:`食材${i}`,qty:100,unit:'g',category:'蔬菜',days:i===0?1:0,date:i===0?'2020-01-01':new Date().toLocaleDateString('sv-SE')}));
      const recipe={id:'test',name:'测试菜单',ingredients:[{name:'米',qty:100,unit:'g',category:'其他'}],steps:['煮']};
      state.recipes=[recipe,{...recipe,id:"suggestion",name:"推荐菜品",ingredients:[{name:"食材1",qty:100,unit:"g"}]}];state.confirmedRecipes=[recipe];state.confirmed={test:1};state.purchased={};
      localStorage.setItem('shiguang-v1',JSON.stringify(state));
      localStorage.setItem('pref:ai-draft:stock',JSON.stringify({text:'旧正文不应自动发送',draft:JSON.stringify([{name:'原草稿',qty:1,unit:'个',category:'蔬菜'}])}));
      localStorage.setItem('pref:ai-config',JSON.stringify({url:'https://fridge.test',model:'mock'}));
    }""")
    page.reload(wait_until='networkidle')

    def nav(name):
        page.get_by_role('navigation',name='主导航').get_by_role('button',name=name,exact=True).click()

    def click(name):
        page.get_by_role('button',name=name,exact=True).click()

    def back():
        page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")

    nav('冰箱')
    expect(page.locator('.topbar').get_by_role('button',name='添加食材',exact=True)).to_have_count(0)
    expect(page.locator('.stock-compact-row.expired .stock-status')).to_have_text('过期')
    expect(page.locator('.stock-results .chip-row')).to_have_count(0)
    buttons = page.locator('.stock-add-actions button')
    ys = [button.bounding_box()['y'] for button in buttons.all()]
    assert max(ys)-min(ys)<1
    page.screenshot(path=str(OUT/'fridge-new-actions.png'))
    with page.expect_file_chooser() as chooser:
        click('拍摄')
    assert chooser.value.element.get_attribute('capture') == 'environment'
    chooser.value.set_files([])
    expect(page.get_by_role('heading',name='冰箱',exact=True)).to_be_visible()
    click('看看能做什么')
    expect(page.get_by_role('dialog').get_by_role('button',name='食材0',exact=True)).to_have_count(0)
    page.locator('.fridge-recipe-choice').filter(has_text='推荐菜品').click()
    expect(page.get_by_role('dialog')).to_contain_text('推荐菜品')
    click('关闭弹窗')
    nav('菜篮子')
    bought = page.get_by_role('checkbox',name='已买米（g）',exact=True)
    bought.check()
    expect(page.locator('.shopping-card')).to_contain_text('已买')
    page.wait_for_function('Object.keys(JSON.parse(localStorage.getItem("shiguang-v1")).purchased).length===1')
    page.reload(wait_until='networkidle');nav('菜篮子')
    expect(bought).to_be_checked()
    page.evaluate("()=>{const s=JSON.parse(localStorage.getItem('shiguang-v1'));s.confirmed.test=2;localStorage.setItem('shiguang-v1',JSON.stringify(s));}")
    page.reload(wait_until='networkidle');nav('菜篮子')
    expect(bought).not_to_be_checked()
    expect(page.locator('.shopping-card')).to_contain_text('200')
    card = page.locator('.shopping-card')
    check_box, name_box, qty_box = [card.locator(selector).bounding_box() for selector in ['.shopping-check','h3','strong']]
    assert check_box['x'] + check_box['width'] <= name_box['x']
    assert name_box['x'] + name_box['width'] <= qty_box['x']
    assert abs(name_box['y'] - qty_box['y']) < 3
    page.screenshot(path=str(OUT/'basket-checklist.png'))
    nav('周菜单')
    history = page.get_by_role('button',name='历史',exact=True)
    clear = page.get_by_role('button',name='清空本周',exact=True)
    assert abs(history.bounding_box()['y']-clear.bounding_box()['y'])<1
    expect(page.get_by_text('菜单修改自动保存',exact=False)).to_have_count(0)
    nav('冰箱')
    nav('点单');click('设置与备份')
    page.get_by_label('API Key',exact=True).fill('mock');click('保存 AI 配置');back();nav('冰箱')
    mode={'hold':False,'status':200,'count':1}

    def respond(route):
        requests.append(route.request.post_data_json)
        if mode['hold']:
            pending.append(route)
        else:
            route.fulfill(status=mode['status'],json={'choices':[{'message':{'content':json.dumps({'items':[{'name':'新识别','qty':2,'unit':'个','category':'蔬菜'}]*mode['count']})}}]})

    page.route('https://fridge.test/**',respond)
    with page.expect_file_chooser() as chooser:
        click('相册选择')
    assert chooser.value.element.get_attribute('capture') is None
    chooser.value.set_files(IMAGE)
    expect(page.get_by_role('dialog',name='核对并保存食材',exact=True)).to_be_visible()
    assert len(requests)==1
    assert '旧正文不应自动发送' not in json.dumps(requests[0],ensure_ascii=False)
    expect(page.locator('.stock-review-row').nth(0)).to_contain_text('原草稿')
    expect(page.locator('.stock-review-row').nth(1)).to_contain_text('新识别')
    expect(page.get_by_role('dialog',name='发送给 AI 识别？',exact=True)).to_have_count(0)
    click('稍后处理');click('AI 配置');back()
    expect(page.get_by_role('heading',name='拍照识别食材',exact=True)).to_be_visible()
    assert len(requests)==1
    mode['count']=100
    click('重新识别')
    expect(page.get_by_role('alert')).to_contain_text('超过 100 项')
    assert len(json.loads(page.evaluate("JSON.parse(localStorage.getItem('pref:ai-draft:stock')).draft")))==2
    click('返回检查')
    mode['count']=1
    mode['status']=503
    click('重新识别')
    expect(page.get_by_role('dialog',name='识别未完成',exact=True)).to_be_visible()
    assert len(json.loads(page.evaluate("JSON.parse(localStorage.getItem('pref:ai-draft:stock')).draft")))==2
    click('返回检查')
    mode.update(hold=True,status=200)
    click('重新识别');click('取消等待')
    pending.pop().fulfill(json={'choices':[{'message':{'content':'{"items":[]}'}}]})
    page.wait_for_load_state('networkidle')
    assert len(json.loads(page.evaluate("JSON.parse(localStorage.getItem('pref:ai-draft:stock')).draft")))==2
    assert len(page.evaluate("JSON.parse(localStorage.getItem('shiguang-v1')).fridge"))==40
    assert not errors,errors
    browser.close()
print('PASS fridge: compact labels, three actions, cancel, recipe chooser, purchased restart/reset, week footer, one automatic request, draft append, failure/cancel preservation')
