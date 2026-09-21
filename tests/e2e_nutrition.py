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
 click('本周菜单营养回顾');expect(page.get_by_role('region',name='本周预计营养')).to_contain_text('部分估算')
 page.evaluate("async()=>{const {setSecret}=await import('/src/storage.js');await setSecret('ai','test-only');}")
 requests=[]
 def respond(route):
  requests.append(route.request.post_data_json)
  route.fulfill(json={'choices':[{'message':{'content':'{"reportText":"测试周报：部分估算，下周可补齐食材。"}'},'finish_reason':'stop'}]})
 page.route('**/chat/completions',respond)
 click('生成 AI 周报');click('取消');assert not requests
 click('生成 AI 周报');click('同意生成');expect(page.get_by_text('测试周报：部分估算，下周可补齐食材。',exact=True)).to_be_visible();assert len(requests)==1
 assert 'weekEnd' in requests[0]['messages'][1]['content']
 click('关闭弹窗');page.reload(wait_until='domcontentloaded');page.get_by_role('navigation',name='主导航').get_by_role('button',name='周菜单',exact=True).click();click('本周菜单营养回顾')
 expect(page.get_by_text('测试周报：部分估算，下周可补齐食材。',exact=True)).to_be_visible()
 page.get_by_text('逐道补充营养与可食克重',exact=True).click();page.get_by_text('番茄测试 · 6-夜宵 · 2份',exact=True).click();page.get_by_label('番茄可食克重',exact=True).fill('200');expect(page.get_by_role('heading',name='已保存周报 · 已过时')).to_be_visible()
 assert not errors,errors
 page.screenshot(path=str(ROOT/'.android-tools/v1.2.1/nutrition-review.png'));b.close()
print('PASS nutrition: partial, consent, Sunday night, report, restart, stale snapshot')
