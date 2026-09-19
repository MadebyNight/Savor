"""启动同步与居中确认框：Vite 开发入口仅注入测试凭据，不接触真实网盘。"""
import hashlib, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('E2E_URL', 'http://127.0.0.1:5173')
CONFIG = {'url': 'https://sync.test/dav/', 'username': 'test'}
SCOPE = json.dumps(['https://sync.test/dav', 'test'], separators=(',', ':'))
def state(name):
    return {'recipes': [{'id': 'r', 'name': name, 'ingredients': [], 'steps': []}],
            'fridge': [], 'confirmed': {}, 'confirmedRecipes': [], 'weeks': {}, 'archives': {}}
def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    errors = []
    def scenario(local, remote=None, base=None, enabled=True, fail=False, delay=False):
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        prefs = {'dav-config': CONFIG, 'dav-auto-sync': enabled}
        if base is not None: prefs['sync-base'] = base
        page.add_init_script('localStorage.setItem("shiguang-v1",JSON.stringify('+json.dumps(local)+'));' +
            ''.join('localStorage.setItem('+json.dumps('pref:'+k)+',JSON.stringify('+json.dumps(v)+'));' for k,v in prefs.items()))
        # 凭据只放入当前页面模块的内存，与生产浏览器存储策略一致。
        page.route('**/src/main.jsx', lambda r: r.fulfill(content_type='text/javascript', body=
            'import {setSecret} from "/src/storage.js"; await setSecret("dav","test-only"); await import("/src/main.jsx?sync-test=1");'))
        calls, held, files = [], [], {}
        if remote:
            version = {'id': 'cloud', 'time': '2026-09-20', 'device': 'other', 'recipes': 1}
            files['current.json'] = json.dumps({**version, 'versions': [version]})
            files['versions/cloud.json'] = json.dumps({'state': remote, 'hash': digest(remote)})
        def respond(route, status, body=''):
            route.fulfill(status=status, content_type='application/json', body=body,
                          headers={'etag':'"1"','access-control-expose-headers':'etag'})
        def dav(route):
            req=route.request; key=req.url.split('/%E9%A3%9F%E5%85%89/')[-1]
            calls.append((req.method,key))
            if fail: respond(route,503); return
            if req.method=='MKCOL': respond(route,201); return
            if req.method=='GET':
                if delay and key.startswith('versions/'): held.append(route); return
                respond(route,200,files[key]) if key in files else respond(route,404)
                return
            if req.method=='PUT': files[key]=req.post_data; respond(route,201); return
            respond(route,204)
        page.route('https://sync.test/**',dav)
        page.goto(URL,wait_until='domcontentloaded')
        return page,calls,held,files,context
    def read(page): return page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')
    def baseline(local,id='old',scope=SCOPE): return {'id':id,'hash':digest(local),'scope':scope}
    def writes(calls): return [x for x in calls if x[0]=='PUT']
    def wait_recipe(page,name): page.wait_for_function('n=>JSON.parse(localStorage.getItem("shiguang-v1")).recipes[0].name===n',arg=name)

    old,cloud,edited=state('原版'),state('云端新版'),state('本地修改')
    page,calls,_,_,ctx=scenario(old,cloud)
    dialog=page.get_by_role('dialog',name='本地与云端需要选择版本',exact=True)
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role('button',name='下载到本机',exact=True)).to_be_visible()
    expect(dialog.get_by_role('button',name='暂不处理',exact=True)).to_be_focused()
    for width,height in [(390,844),(320,568),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(150)
        box=dialog.bounding_box()
        assert abs(box['x']+box['width']/2-width/2)<3 and abs(box['y']+box['height']/2-height/2)<3,box
        assert box['height']<=height and box['width']<=width,(width,height,box)
    before=read(page); count=len(calls)
    page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")
    expect(dialog).not_to_be_visible(); assert read(page)==before and len(calls)==count
    ctx.close()

    page,calls,_,_,ctx=scenario(old,None)
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.get_by_text('云端还没有食光备份，请先上传本机数据。',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='下载到本机',exact=True)).to_have_count(0)
    page.get_by_role('button',name='暂不处理',exact=True).click(); assert not writes(calls)
    ctx.close()

    page,calls,_,_,ctx=scenario(old,cloud,baseline(old))
    wait_recipe(page,'云端新版'); expect(page.get_by_role('dialog')).to_have_count(0)
    assert page.evaluate('JSON.parse(localStorage.getItem("pref:before-restore")).state.recipes[0].name')=='原版'
    assert not writes(calls); ctx.close()

    page,calls,_,files,ctx=scenario(edited,old,baseline(old,'cloud'))
    page.wait_for_function('JSON.parse(localStorage.getItem("pref:sync-base"))?.id!=="cloud"')
    assert writes(calls) and read(page)['recipes'][0]['name']=='本地修改'
    expect(page.get_by_role('dialog')).to_have_count(0); ctx.close()

    for base in [baseline(old),baseline(old,scope='another-account')]:
        page,calls,_,_,ctx=scenario(edited,cloud,base)
        expect(page.get_by_role('dialog')).to_be_visible(); assert not writes(calls)
        page.get_by_role('button',name='暂不处理',exact=True).click()
        assert read(page)['recipes'][0]['name']=='本地修改'; ctx.close()

    page,calls,_,_,ctx=scenario(old,cloud,baseline(old),enabled=False)
    page.get_by_role('button',name='设置与备份',exact=True).click()
    expect(page.get_by_role('checkbox',name='启动应用时自动同步')).not_to_be_checked()
    assert not calls; ctx.close()

    page,calls,_,_,ctx=scenario(old,cloud,baseline(old),fail=True)
    expect(page.get_by_text('启动同步未完成：网盘请求失败（HTTP 503），本地数据保留',exact=True)).to_be_visible()
    assert read(page)['recipes'][0]['name']=='原版'; ctx.close()

    # 同一会话打开/关闭设置不重复启动检查。
    page,calls,_,_,ctx=scenario(old,old,baseline(old,'cloud'))
    page.get_by_role('button',name='设置与备份',exact=True).click()
    expect(page.get_by_role('button',name='检查并同步',exact=True)).to_be_enabled()
    page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")
    page.get_by_role('button',name='设置与备份',exact=True).click()
    expect(page.get_by_role('button',name='检查并同步',exact=True)).to_be_enabled()
    assert len(calls)==2,calls
    ctx.close()

    # 手动检查即使建议上传也提供下载，下载进行中返回键不能关闭弹窗。
    page,calls,held,files,ctx=scenario(edited,old,baseline(old,'cloud'),enabled=False,delay=True)
    page.get_by_role('button',name='设置与备份',exact=True).click()
    page.get_by_role('button',name='检查并同步',exact=True).click()
    dialog=page.get_by_role('dialog',name='请确认同步方向',exact=True)
    expect(dialog.get_by_role('button',name='下载到本机',exact=True)).to_be_visible()
    page.screenshot(path=str(ROOT/'.android-tools/sync-dialog-review.png'))
    dialog.get_by_role('button',name='下载到本机',exact=True).click()
    expect(dialog.get_by_role('button',name='上传到云端',exact=True)).to_be_disabled()
    page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))")
    expect(dialog).to_be_visible()
    expect(dialog.get_by_role('button',name='暂不处理',exact=True)).to_be_disabled()
    assert held
    held[0].fulfill(status=200,content_type='application/json',body=files['versions/cloud.json'])
    wait_recipe(page,'原版'); expect(dialog).not_to_be_visible()
    ctx.close()

    page,calls,held,files,ctx=scenario(old,cloud,baseline(old),delay=True)
    page.wait_for_timeout(500)
    page.get_by_role('navigation',name='主导航').get_by_role('button',name='冰箱',exact=True).click()
    # 在下载挂起时使用真实 UI 新增库存。
    page.get_by_role('button',name='添加食材',exact=True).first.click()
    page.get_by_label('食材名称',exact=True).fill('下载中新增')
    page.get_by_role('button',name='确认放入冰箱',exact=True).click()
    page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).fridge.length===1')
    assert held
    held[0].fulfill(status=200,content_type='application/json',body=files['versions/cloud.json'])
    expect(page.get_by_text('下载期间本地数据已改变，已保留本地修改，请重新检查',exact=True)).to_be_visible()
    assert read(page)['fridge'][0]['name']=='下载中新增' and read(page)['recipes'][0]['name']=='原版'
    ctx.close()
    assert not errors,errors
    browser.close()
    print('PASS: centered dialog, cancel/back, first connect, auto download/upload, conflicts/account switch, disabled/offline, concurrent local edit preserved')
