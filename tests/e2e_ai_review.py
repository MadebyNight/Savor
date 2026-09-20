"""独立识别核对窗口：关闭保留、选择保存、重启恢复、错误及手机布局。"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.android-tools/ai-review'
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:(errors.append('native dialog'),d.dismiss()))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'))
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    def data():return page.evaluate('localStorage.getItem("shiguang-v1")')
    def reopen():page.get_by_role('button',name='查看待保存草稿',exact=False).click()
    def back():page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")
    click('设置与备份')
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='AI 配置',exact=True).click()
    page.get_by_label('接口地址',exact=True).fill('https://review.test')
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='AI 配置',exact=True).click()
    page.get_by_label('API Key',exact=True).fill('mock');click('保存 AI 配置')
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='识别',exact=True).click()
    recipe={'name':'青椒酿肉','category':'荤菜','ingredients':[{'name':'青椒','qty':5,'unit':'个'}],'steps':['备好食材。','煎熟后装盘。']}
    response={'items':[recipe,{**recipe,'name':'第二道菜'}],'status':200};pending=[]
    def handle(route):
        assert route.request.url=='https://review.test/v1/chat/completions'
        if response.get('hold'):pending.append(route);return
        route.fulfill(status=response['status'],content_type='application/json',body=json.dumps({'choices':[{'message':{'content':json.dumps({'items':response['items']})}}]}))
    page.route('https://review.test/**',handle)
    def send(replace=False):
        click('确认发送并识别');click('同意发送')
        if replace:click('替换并识别')
    page.get_by_label('识别原文',exact=True).fill('测试菜谱')
    before=data();send()
    dialog=page.get_by_role('dialog',name='核对并保存菜谱',exact=True)
    expect(dialog).to_be_visible();assert data()==before
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        assert dialog.evaluate('e=>e.scrollWidth<=e.clientWidth+1'), 'Recipe review overflows'
    expect(page.locator('.settings-panel [aria-label="识别草稿编辑"]')).to_have_count(0)
    expect(page.locator('[data-sonner-toast]')).to_have_count(0,timeout=10000)
    page.screenshot(path=str(OUT/'recipe-review.png'))
    page.get_by_label('草稿名称1',exact=True).fill('已核对青椒酿肉')
    back();expect(dialog).not_to_be_visible();assert data()==before
    expect(page.locator('.settings-panel')).to_be_visible()
    reopen();expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('已核对青椒酿肉')
    click('稍后处理');page.reload();click('设置与备份');reopen()
    expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('已核对青椒酿肉')
    page.get_by_role('checkbox',name='保存第 2 项').uncheck();click('确认保存选中条目')
    page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(r=>r.name==="已核对青椒酿肉")')
    expect(dialog).to_be_visible();expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('第二道菜')
    click('确认保存选中条目');expect(dialog).not_to_be_visible()
    expect(page.get_by_role('button',name='查看待保存草稿',exact=False)).to_have_count(0)
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='AI 配置',exact=True).click()
    page.get_by_label('API Key',exact=True).fill('mock');click('保存 AI 配置')
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='识别',exact=True).click()
    response['status']=401;send()
    expect(page.get_by_role('dialog',name='识别未完成',exact=True)).to_be_visible();click('返回检查')
    response.update(status=200,items=[]);send()
    expect(page.get_by_role('dialog',name='未识别到可保存内容',exact=True)).to_be_visible();click('返回补充')
    page.get_by_label('识别类型',exact=True).select_option('stock')
    response['items']=[{'name':'牛奶','qty':2,'unit':'盒','days':3}];send()
    stock=page.get_by_role('dialog',name='核对并保存食材',exact=True);expect(stock).to_be_visible()
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        box=stock.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width
        assert stock.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    click('稍后处理');response['hold']=True;send(True);click('取消等待')
    assert pending;pending[0].fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':'{"items":[]}'}}]}))
    page.wait_for_load_state('networkidle');expect(stock).not_to_be_visible();reopen()
    expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('牛奶')
    assert not errors,errors
    browser.close();print('PASS: AI review modal, explicit/partial save, draft persistence, back, errors, stock, small screen, late response')
