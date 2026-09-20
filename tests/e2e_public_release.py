"""公开构建：隐藏开发者入口，个人 AI 配置正常。"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];calls=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'))
    page.wait_for_load_state('networkidle')
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    click('设置与备份');click('AI 配置')
    expect(page.get_by_label('接口地址',exact=True)).to_be_enabled()
    assert page.locator('.developer-config').count()==0
    assert page.get_by_text('启用开发者配置',exact=True).count()==0
    page.get_by_label('接口地址',exact=True).fill('https://public-ai.test/v1/chat/completions')
    page.get_by_label('模型',exact=True).fill('personal-model')
    page.get_by_label('API Key',exact=True).fill('fixture-personal-key')
    click('保存 AI 配置');expect(page.get_by_label('API Key',exact=True)).to_have_value('')
    def respond(route):
        assert route.request.headers['authorization']=='Bearer fixture-personal-key'
        calls.append(route.request.url)
        route.fulfill(content_type='application/json',body=json.dumps({'choices':[{'message':{'content':'OK'}}]}))
    page.route('https://public-ai.test/**',respond)
    click('测试连接');click('开始测试')
    expect(page.get_by_role('dialog',name='连接成功',exact=True)).to_be_visible()
    assert len(calls)==1
    click('知道了')
    page.screenshot(path=str(ROOT/'.android-tools/release-v1.1.2/public-ai-settings.png'),full_page=True)
    assert not errors,errors
    browser.close()
    assert not (Path(os.environ.get('E2E_DIST',ROOT/'dist'))/'developer-ai-profile.json').exists()
    print('PASS: public edition hides developer settings, personal AI works, no bundled developer profile')
