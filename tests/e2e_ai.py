import os,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.android-tools/e2e';OUT.mkdir(parents=True,exist_ok=True)
os.environ['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT/'.android-tools/playwright');os.environ['TEMP']=os.environ['TMP']=str(OUT)
from playwright.sync_api import sync_playwright,expect
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
 page=browser.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:(errors.append('Unexpected native dialog'),d.dismiss()))
 def reopen():page.get_by_role('button',name='查看待保存草稿',exact=False).click()
 def defer():page.get_by_role('button',name='稍后处理',exact=True).click()
 def send(replace=False):
  page.get_by_role('button',name='确认发送并识别').click()
  page.get_by_role('dialog',name='发送给 AI 识别？').get_by_role('button',name='同意发送').click()
  if replace:page.get_by_role('dialog',name='替换识别草稿？').get_by_role('button',name='替换并识别').click()
 page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'));page.wait_for_load_state('networkidle');page.get_by_role('button',name='设置与备份').click()
 page.get_by_label('接口地址',exact=True).fill('https://mock.invalid/chat/completions');page.get_by_label('API Key',exact=True).fill('mock-key');page.get_by_role('button',name='保存 AI 配置').click()
 mode={'value':'success'};pending=[]
 def response(items):return json.dumps({'choices':[{'message':{'content':json.dumps({'items':items})}}]})
 recipe={'name':'AI测试菜','ingredients':[{'name':'测试米','qty':None,'unit':'g'}],'steps':['煮熟']}
 def handle(route):
  if mode['value']=='late':pending.append(route);return
  if mode['value']=='401':route.fulfill(status=401,body='{}');return
  route.fulfill(status=200,content_type='application/json',body='bad' if mode['value']=='bad' else response([recipe,{'name':'待补充菜','ingredients':[],'steps':[]}]))
 page.route('https://mock.invalid/**',handle)
 page.route('https://article.invalid/ok',lambda route:route.fulfill(status=200,content_type='text/html',body='<html><head><title>公开菜谱</title></head><body><article><h1>公开菜谱</h1><p>'+('番茄洗净切块，鸡蛋打散炒熟，加入番茄翻炒后调味。'*10)+'</p></article></body></html>'))
 page.get_by_label('公开链接',exact=False).fill('https://article.invalid/ok');page.get_by_role('button',name='获取公开正文',exact=True).click();
 expect(page.get_by_label('识别原文',exact=True)).to_have_value(__import__('re').compile('公开菜谱'))
 assert page.get_by_label('草稿名称1',exact=True).count()==0
 prior=page.get_by_label('识别原文',exact=True).input_value()
 page.route('https://article.invalid/login',lambda route:route.fulfill(status=200,content_type='text/html',body='<html><body>登录</body></html>'))
 page.get_by_label('公开链接',exact=False).fill('https://article.invalid/login');page.get_by_role('button',name='获取公开正文',exact=True).click();page.get_by_role('button',name='获取并替换',exact=True).click();expect(page.get_by_text('没有取得可用正文，请粘贴原文或上传截图',exact=True)).to_be_visible();expect(page.get_by_label('识别原文',exact=True)).to_have_value(prior)
 page.get_by_label('公开链接',exact=False).fill('http://article.invalid/no');page.get_by_role('button',name='获取公开正文',exact=True).click();page.get_by_role('button',name='获取并替换',exact=True).click();expect(page.get_by_text('请使用 HTTPS 链接',exact=True)).to_be_visible()
 page.get_by_label('识别原文',exact=True).fill('测试文字菜谱');send();expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('AI测试菜')
 page.get_by_role('button',name='确认保存选中条目').click();expect(page.get_by_text('待补充菜：至少需要一种食材和一个步骤',exact=True)).to_be_visible()
 page.get_by_role('checkbox',name='保存第 2 项').uncheck();page.get_by_label('草稿名称1',exact=True).fill('AI已核对菜');page.get_by_role('button',name='确认保存选中条目').click()
 expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('待补充菜');page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(i=>i.name==="AI已核对菜")')
 page.reload();page.wait_for_load_state('networkidle');page.get_by_role('button',name='设置与备份').click();reopen();expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('待补充菜');defer()
 page.get_by_label('API Key',exact=True).fill('mock-key');page.get_by_role('button',name='保存 AI 配置').click()
 mode['value']='401';send(True);expect(page.get_by_text('识别请求失败（HTTP 401），请检查接口、模型与Key后重试',exact=True)).to_be_visible();page.get_by_role('button',name='返回检查',exact=True).click();reopen();expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('待补充菜');defer()
 mode['value']='bad';send(True);expect(page.get_by_text('接口返回的不是有效 JSON，请核对接口类型或稍后重试',exact=True)).to_be_visible()
 page.get_by_role('button',name='返回检查',exact=True).click();mode['value']='late';send(True);expect(page.get_by_role('button',name='取消等待')).to_be_visible();page.get_by_role('button',name='取消等待').click()
 assert pending;pending[0].fulfill(status=200,content_type='application/json',body=response([{'name':'迟到结果','ingredients':[],'steps':[]}]))
 page.wait_for_load_state('networkidle');reopen();expect(page.get_by_label('草稿名称1',exact=True)).to_have_value('待补充菜')
 page.screenshot(path=str(OUT/'ai-desktop.png'),full_page=True)
 defer();page.set_viewport_size({'width':390,'height':844});page.get_by_role('button',name='返回',exact=True).click();expect(page.get_by_role('heading',name='设置与数据',exact=True)).not_to_be_visible();page.get_by_role('button',name='设置与备份').click();expect(page.get_by_role('heading',name='设置与数据',exact=True).first).to_be_visible();page.screenshot(path=str(OUT/'ai-mobile.png'),full_page=True)
 page.get_by_role('navigation',name='主导航').get_by_role('button',name='冰箱',exact=True).click();expect(page.get_by_role('heading',name='冰箱',exact=True)).to_be_visible();expect(page.locator('.topbar').get_by_role('button',name='添加食材',exact=True)).to_be_visible();page.screenshot(path=str(OUT/'mobile-home.png'),full_page=True)
 assert not errors,errors
 print('PASS: AI mock success, field validation, selective save, reload draft, 401, malformed response, cancellation ignores late response; mobile screenshots')
 browser.close()
