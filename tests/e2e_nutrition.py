import os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
 page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'),wait_until='domcontentloaded');page.wait_for_function('localStorage.getItem("shiguang-v1")')
 page.evaluate("""async()=>{
 const {calculateNutrition}=await import('/src/nutrition.js'),{monday}=await import('/src/domain.js');
 const state=JSON.parse(localStorage.getItem('shiguang-v1')),week=monday(new Date().toLocaleDateString('sv-SE'));
 const recipe={id:1,name:'番茄测试',ingredients:[{name:'番茄',qty:100,unit:'g',category:'蔬菜'},{name:'未知食材',qty:1,unit:'个'}],steps:['煮']};
 recipe.nutrition=calculateNutrition(recipe);state.weeks={[week]:{'6-夜宵':[{...recipe,servings:2}]}};
 localStorage.setItem('shiguang-v1',JSON.stringify(state));const {setSecret}=await import('/src/storage.js');await setSecret('ai','test-only');
 }""")
 page.reload(wait_until='domcontentloaded');page.get_by_role('navigation',name='主导航').get_by_role('button',name='周菜单',exact=True).click()
 def click(name):page.get_by_role('button',name=name,exact=True).click()
 click('本周菜单营养回顾');page.locator('.review-dates button').last.click();expect(page.locator('.review-day-content')).to_contain_text('部分估算')
 page.evaluate("async()=>{const {setSecret}=await import('/src/storage.js');await setSecret('ai','test-only');}")
 requests=[]
 def respond(route):
  requests.append(route.request.post_data_json)
  route.fulfill(json={'choices':[{'message':{'content':'{"reportText":"测试周报：部分估算，下周可补齐食材。"}'},'finish_reason':'stop'}]})
 page.route('**/chat/completions',respond)
 click('生成下周建议');click('取消');assert not requests
 click('生成下周建议');click('同意生成');expect(page.get_by_text('测试周报：部分估算，下周可补齐食材。',exact=True)).to_be_visible();assert len(requests)==1
 assert 'weekEnd' in requests[0]['messages'][1]['content']
 assert '未知数据不能当零' in requests[0]['messages'][0]['content']
 assert '不要罗列全部营养指标' in requests[0]['messages'][0]['content']
 click('关闭弹窗');page.reload(wait_until='domcontentloaded');page.get_by_role('navigation',name='主导航').get_by_role('button',name='周菜单',exact=True).click();click('本周菜单营养回顾')
 expect(page.get_by_text('测试周报：部分估算，下周可补齐食材。',exact=True)).to_be_visible()
 click('高级计算');page.get_by_text('番茄测试 · 6-夜宵 · 2份',exact=True).click();page.get_by_label('番茄可食克重',exact=True).fill('200');click('返回营养回顾');expect(page.locator('.nutrition-advanced')).to_have_count(0);expect(page.get_by_text('菜单已改变，以下建议待更新',exact=True)).to_be_visible()
 click('更新下周建议');click('同意生成');expect(page.get_by_role('alert')).to_contain_text('请先在设置保存 AI Key')
 expect(page.get_by_text('测试周报：部分估算，下周可补齐食材。',exact=True)).to_be_visible()
 click('高级计算');page.get_by_text('番茄测试 · 6-夜宵 · 2份',exact=True).click()
 # Supplement has a separate consent boundary, preserves local values and ignores late replies.
 page.evaluate("async()=>{const {setSecret}=await import('/src/storage.js');await setSecret('ai','test-only');}")
 page.unroute('**/chat/completions');pending=[]
 page.route('**/chat/completions',lambda route:pending.append(route))
 click('AI 补充缺失项');click('取消');assert not pending
 before=page.evaluate("JSON.parse(localStorage.getItem('shiguang-v1')).weeks")
 click('AI 补充缺失项');click('同意估算');page.get_by_role('button',name='取消估算',exact=True).wait_for();click('取消估算')
 pending.pop().fulfill(json={'choices':[{'message':{'content':'{"items":[{"index":1,"values":{"energyKcal":100}}]}'},'finish_reason':'stop'}]})
 page.wait_for_timeout(150);assert page.evaluate("JSON.parse(localStorage.getItem('shiguang-v1')).weeks")==before
 click('AI 补充缺失项');click('同意估算');page.get_by_role('button',name='取消估算',exact=True).wait_for()
 pending.pop().fulfill(json={'choices':[{'message':{'content':'{"items":[{"index":1,"values":{"energyKcal":-1}}]}'},'finish_reason':'stop'}]})
 expect(page.locator('.recipe-nutrition').get_by_role('alert')).to_contain_text('非法营养数值');assert page.evaluate("JSON.parse(localStorage.getItem('shiguang-v1')).weeks")==before
 click('AI 补充缺失项');click('同意估算');page.get_by_role('button',name='取消估算',exact=True).wait_for()
 route=pending.pop();payload=route.request.post_data_json;assert len(__import__('json').loads(payload['messages'][1]['content'])['items'])==1
 route.fulfill(json={'choices':[{'message':{'content':'{"items":[{"index":1,"values":{"energyKcal":100,"proteinG":0}}]}'},'finish_reason':'stop'}]})
 expect(page.get_by_role('region',name='本周计算详情')).to_contain_text('AI 补充估算')
 click('返回营养回顾');expect(page.locator('.nutrition-advanced')).to_have_count(0)
 # A cancelled or failed replacement never removes the saved report.
 click('更新下周建议');click('同意生成');page.get_by_role('button',name='取消生成',exact=True).wait_for();click('取消生成')
 pending.pop().fulfill(json={'choices':[{'message':{'content':'{"reportText":"不应写入的迟到报告"}'},'finish_reason':'stop'}]})
 expect(page.get_by_text('不应写入的迟到报告',exact=True)).to_have_count(0)
 click('更新下周建议');click('同意生成');page.get_by_role('button',name='取消生成',exact=True).wait_for();pending.pop().fulfill(status=503,body='unavailable')
 expect(page.get_by_text('测试周报：部分估算，下周可补齐食材。',exact=True)).to_be_visible()
 assert not errors,errors
 page.screenshot(path=str(ROOT/'.android-tools/v1.2.1/nutrition-review.png'));b.close()
print('PASS nutrition: partial, consent, Sunday night, report, restart, stale snapshot, no key, cancelled late response, invalid numbers, mixed source, failure preserves report')
