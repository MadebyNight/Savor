"""拍摄与相册识别小票：千克结果在核对草稿中显示为克。"""
import base64
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PIXEL = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    for source in ('相册选择', '拍摄'):
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:5173'), wait_until='networkidle')
        page.evaluate("""async()=>{
          const storage=await import('/src/storage.js');
          await storage.setPreference('ai-config',{url:'https://unit.test/v1/chat/completions',model:'test-model'});
          await storage.setSecret('ai','test-key');
        }""")
        requests = []
        def respond(route):
            requests.append(route.request.post_data_json)
            route.fulfill(status=200, content_type='application/json', body=json.dumps({
                'choices': [{'message': {'content': json.dumps({'items': [
                    {'name': '番茄', 'qty': 0.35, 'unit': None, 'unitExplicit': False, 'category': '蔬菜'}
                ]})}}]
            }))
        page.route('https://unit.test/**', respond)
        page.get_by_role('navigation', name='主导航').get_by_role('button', name='冰箱', exact=True).click()
        assert [label.strip() for label in page.locator('.stock-add-actions button').all_text_contents()] == ['相册选择', '拍摄', '手动添加']
        with page.expect_file_chooser() as chooser:
            page.get_by_role('button', name=source, exact=True).click()
        chooser.value.set_files({'name': 'receipt.png', 'mimeType': 'image/png', 'buffer': PIXEL})
        review = page.get_by_role('dialog', name='核对并保存食材')
        expect(review).to_be_visible()
        expect(review.locator('.stock-review-details > summary')).to_contain_text('350 g')
        expect(review.locator('.stock-review-details > summary')).to_contain_text('编辑')
        review.locator('.stock-review-details > summary').click()
        review.get_by_label('数量', exact=True).fill('360')
        page.wait_for_function('JSON.parse(localStorage.getItem("pref:ai-draft:stock"))?.draft?.includes("360")')
        draft = page.evaluate("JSON.parse(localStorage.getItem('pref:ai-draft:stock')).draft")
        assert [(float(item['qty']), item['unit']) for item in json.loads(draft)] == [(360, 'g')]
        review.get_by_role('button', name='确认入库').click()
        page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).fridge.some(item=>item.name==="番茄"&&item.qty===360&&item.unit==="g")')
        assert len(requests) == 1 and not errors, (source, errors)
        page.close()
    browser.close()

print('PASS: 拍摄与相册小票未标单位的 0.35 均按 350g 展示，手动改为 360g 后入库')
