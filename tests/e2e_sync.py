"""Two isolated browser devices against a deterministic WebDAV server mock."""
import os,json
from pathlib import Path
from urllib.parse import unquote
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'.android-tools/e2e';OUT.mkdir(parents=True,exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(OUT)
from playwright.sync_api import sync_playwright,expect
files={};revisions={};requests=[]
def dav(route):
 request=route.request;path=unquote(request.url).split('/食光/')[-1];method=request.method;headers=request.headers
 requests.append((method,path))
 def respond(status,body=''):route.fulfill(status=status,body=body,headers={'content-type':'application/json','access-control-allow-origin':'*','access-control-expose-headers':'etag','etag':'"'+str(revisions.get(path,0))+'"'})
 if method=='MKCOL':respond(201);return
 if method=='GET':respond(200,files[path]) if path in files else respond(404);return
 if method=='DELETE':files.pop(path,None);respond(204);return
 if method=='PUT':
  if headers.get('if-none-match')=='*' and path in files:respond(412);return
  if 'if-match' in headers and headers['if-match']!='"'+str(revisions.get(path,0))+'"':respond(412);return
  files[path]=request.post_data;revisions[path]=revisions.get(path,0)+1;respond(201);return
 respond(405)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
 errors=[]
 def device():
  context=browser.new_context(viewport={'width':1280,'height':900});context.route('https://dav.test/**',dav)
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto('http://127.0.0.1:5173');page.wait_for_load_state('networkidle')
  page.get_by_role('button',name='设置与备份',exact=True).click()
  page.get_by_label('WebDAV 根地址',exact=True).fill('https://dav.test/dav/');page.get_by_label('账号',exact=True).fill('user');page.get_by_label('应用密码',exact=True).fill('test-password');page.get_by_role('button',name='保存同步配置',exact=True).click();return page
 def inspect(page):page.get_by_role('button',name='检查并同步',exact=True).click()
 def data(page):return page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')
 def add(page,name):
  page.get_by_role('button',name='设置与备份',exact=True).click();page.get_by_role('button',name='上传菜谱',exact=False).first.click()
  page.get_by_role('button',name='新建菜谱',exact=True).click()
  page.get_by_placeholder('给这道菜起个名字').fill(name);page.get_by_label('食材名称',exact=True).fill('米');page.get_by_label('数量',exact=True).fill('100');page.get_by_label('步骤1',exact=True).fill('煮熟');page.get_by_role('button',name='确认保存到菜品库',exact=True).click()
  page.wait_for_function('name=>JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(r=>r.name===name)',arg=name);page.get_by_role('button',name='设置与备份',exact=True).click()
 def upload(page):
  old=page.evaluate('JSON.parse(localStorage.getItem("pref:sync-base"))?.id || null')
  inspect(page);page.get_by_role('button',name='保留本地并上传',exact=True).click()
  try:page.wait_for_function('old=>{const base=JSON.parse(localStorage.getItem("pref:sync-base"));return base && base.id!==old}',arg=old,timeout=10000)
  except Exception:
   print(page.locator('body').inner_text());print('BASE',page.evaluate('localStorage.getItem("pref:sync-base")'));print('REMOTE',files.get('current.json'));print('REQUESTS',requests);raise
 a=device();add(a,'设备A初始菜');upload(a)
 b=device();inspect(b);expect(b.get_by_text('本地与云端需要选择版本',exact=True)).to_be_visible();b.get_by_role('button',name='采用云端版本',exact=True).click();b.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(r=>r.name==="设备A初始菜")')
 assert b.evaluate('JSON.parse(localStorage.getItem("pref:before-restore")).state.recipes.every(r=>r.name!=="设备A初始菜")')
 add(a,'A离线修改');add(b,'B离线修改');upload(a);inspect(b);expect(b.get_by_text('本地与云端需要选择版本',exact=True)).to_be_visible()
 b.screenshot(path=str(OUT/'sync-conflict.png'),full_page=True)
 b.get_by_role('button',name='采用云端版本',exact=True).click();b.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(r=>r.name==="A离线修改")')
 assert all(r['name']!='B离线修改' for r in data(b)['recipes'])
 assert b.evaluate('JSON.parse(localStorage.getItem("pref:before-restore")).state.recipes.some(r=>r.name==="B离线修改")')
 add(a,'云端第三次修改');upload(a);manifest=json.loads(files['current.json']);files['versions/'+manifest['id']+'.json']='{"state":{},"hash":"broken"}'
 before=data(b);inspect(b);b.get_by_role('button',name='采用云端版本',exact=True).click();expect(b.get_by_text('云端数据校验失败，当前数据保留',exact=True)).to_be_visible();assert data(b)==before
 b.screenshot(path=str(OUT/'sync-corrupt-preserved.png'),full_page=True)
 assert not errors,errors
 print('PASS: two isolated devices; first upload; second download; both changed conflict; local pre-restore backup; corrupt remote preserves local; '+str(len(requests))+' WebDAV requests')
 browser.close()
