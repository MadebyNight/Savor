"""V1.2.1 独立识别入口、授权、草稿隔离及恢复；仅使用模拟服务。"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/v1.2.1'
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width':390,'height':844})
    errors, requests, pending = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'), wait_until='domcontentloaded')
    def click(name): page.get_by_role('button',name=name,exact=True).click()
    def nav(name): page.get_by_role('navigation',name='主导航').get_by_role('button',name=name,exact=True).click()
    def back(): page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")
    def open_text():
        nav('菜谱');click('导入菜谱')
    open_text()
    expect(page.get_by_label('识别原文',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='相册选择',exact=True)).to_be_visible()
    page.get_by_label('识别原文',exact=True).fill('独立正文草稿')
    click('AI 配置')
    expect(page.get_by_role('button',name='识别',exact=True)).to_have_count(0)
    page.get_by_label('接口地址',exact=True).fill('https://recognition.test')
    page.get_by_label('API Key',exact=True).fill('mock')
    click('保存 AI 配置');back()
    expect(page.get_by_label('识别原文',exact=True)).to_have_value('独立正文草稿')
    recipe={'name':'模拟菜谱','ingredients':[{'name':'米','qty':100,'unit':'g'}],'steps':['煮熟']}
    response={'status':200,'items':[recipe,{**recipe,'name':'第二道'}]}
    def handle(route):
        requests.append(True)
        if response.get('hold'): pending.append(route);return
        route.fulfill(status=response['status'],content_type='application/json',body=json.dumps({'choices':[{'message':{'content':json.dumps({'items':response['items']})}}]}))
    page.route('https://recognition.test/**',handle)
    click('确认发送并识别');click('取消');assert not requests
    click('确认发送并识别');click('同意发送')
    expect(page.get_by_role('dialog',name='核对并保存菜谱',exact=True)).to_be_visible()
    page.get_by_role('checkbox',name='保存第 2 项').uncheck();click('确认保存选中条目')
    expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('第二道')
    click('稍后处理');back();click('导入菜谱')
    expect(page.get_by_role('button',name='相册选择',exact=True)).to_be_visible()
    expect(page.get_by_label('识别原文',exact=True)).to_have_value('独立正文草稿')
    expect(page.get_by_role('button',name='查看待保存草稿',exact=False)).to_be_visible()
    nav('冰箱')
    with page.expect_file_chooser() as chooser: click('拍摄')
    assert chooser.value.element.get_attribute('capture')=='environment'
    expect(page.get_by_role('heading',name='冰箱',exact=True)).to_be_visible()
    assert len(requests)==1
    page.reload(wait_until='domcontentloaded');open_text()
    expect(page.get_by_label('识别原文',exact=True)).to_have_value('独立正文草稿')
    page.get_by_role('button',name='查看待保存草稿',exact=False).click()
    expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('第二道');click('稍后处理')
    click('AI 配置');page.get_by_label('API Key',exact=True).fill('mock');click('保存 AI 配置');back()
    response['status']=401
    click('确认发送并识别');click('同意发送');click('替换并识别')
    expect(page.get_by_role('dialog',name='识别未完成',exact=True)).to_be_visible();click('返回检查')
    response.update(status=200,hold=True)
    click('确认发送并识别');click('同意发送');click('替换并识别');click('取消等待')
    assert pending
    pending[0].fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':'{"items":[]}'}}]}))
    page.get_by_role('button',name='查看待保存草稿',exact=False).click()
    expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('第二道')
    for width in [320,360,390]:
        page.set_viewport_size({'width':width,'height':800})
        assert page.get_by_role('dialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    page.screenshot(path=str(OUT/'recognition-review.png'))
    assert not errors,errors
    browser.close()
print('PASS: independent entries, camera activation/cancel, task drafts, settings return, consent, partial save, reload, errors, late response')
