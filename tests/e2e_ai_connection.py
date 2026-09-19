"""AI 连接测试：未保存配置、凭据回退、失败反馈与手机布局。"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width':390,'height':844})
    errors, calls = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:4173'))
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='设置与备份', exact=True).click()
    def click(name): page.get_by_role('button', name=name, exact=True).click()
    def storage(): return page.evaluate('JSON.stringify(localStorage)')
    response = {'status':200, 'body':{'model':'returned-model','choices':[{'message':{'content':'OK'}}]}}
    def handle(route):
        calls.append({'body':route.request.post_data_json,'headers':route.request.headers})
        route.fulfill(status=response['status'], content_type='application/json', body=json.dumps(response['body']))
    page.route('https://ai.test/**', handle)
    page.get_by_label('接口地址', exact=True).fill('https://ai.test/v1/chat/completions')
    page.get_by_label('模型', exact=True).fill('requested-alias')
    page.get_by_label('API Key', exact=True).fill('mock-key')
    before = storage()
    click('测试连接'); page.get_by_role('dialog').get_by_role('button',name='取消',exact=True).click()
    assert not calls and storage() == before
    def test():
        click('测试连接'); click('开始测试')
        expect(page.locator('.ai-test-result')).to_be_visible()
    test()
    result = page.locator('.ai-test-result')
    expect(result).to_contain_text('连接成功')
    expect(result).to_contain_text('请求模型：requested-alias')
    expect(result).to_contain_text('接口返回模型：returned-model')
    assert calls[-1]['headers']['authorization'] == 'Bearer mock-key'
    assert calls[-1]['body']['messages'] == [{'role':'user','content':'Reply with OK only.'}]
    assert storage() == before
    page.get_by_label('模型', exact=True).fill('new-alias')
    expect(result).to_have_count(0)
    click('保存 AI 配置')
    expect(page.get_by_label('API Key',exact=True)).to_have_value('')
    test()
    assert calls[-1]['headers']['authorization'] == 'Bearer mock-key'
    assert calls[-1]['body']['model'] == 'new-alias'
    for status, message in [(401,'鉴权失败'),(404,'接口或模型不存在'),(429,'请求受限')]:
        response['status'] = status
        test(); expect(result).to_contain_text(message)
    response.update(status=200,body={'choices':[{'message':{'content':'OK'}}]})
    test(); expect(result).to_contain_text('未提供模型名称')
    pending = []
    page.unroute('https://ai.test/**')
    page.route('https://ai.test/**', lambda route: pending.append(route))
    click('测试连接'); click('开始测试')
    expect(page.get_by_role('button',name='正在测试…',exact=True)).to_be_disabled()
    expect(page.get_by_role('button',name='保存 AI 配置',exact=True)).to_be_disabled()
    click('停止等待')
    expect(result).to_contain_text('已停止等待')
    assert len(pending) == 1
    pending[0].fulfill(status=200,content_type='application/json',body=json.dumps(response['body']))
    page.wait_for_load_state('networkidle')
    expect(result).to_contain_text('已停止等待')
    page.unroute('https://ai.test/**'); page.route('https://ai.test/**',handle)
    test(); expect(result).to_contain_text('未提供模型名称')
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    result.scroll_into_view_if_needed()
    page.screenshot(path=str(ROOT / '.android-tools/ai-connection-review.png'))
    assert not errors, errors
    browser.close()
    print('AI connection UI checks passed')
