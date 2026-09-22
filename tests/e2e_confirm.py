"""业务确认回归：取消无副作用，确认才发送/恢复；禁止系统业务对话框。"""
import json, os, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:(errors.append('Native dialog: '+d.type),d.dismiss()))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'))
    page.wait_for_load_state('networkidle')
    def data():return page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    def dialog(title):return page.get_by_role('dialog',name=title,exact=True)
    def cancel(title):
        before=data(); calls=len(requests)
        expect(dialog(title).get_by_role('button',name='取消',exact=True)).to_be_focused()
        dialog(title).get_by_role('button',name='取消',exact=True).click()
        expect(dialog(title)).not_to_be_visible()
        assert data()==before and len(requests)==calls
    def accept(title,label):dialog(title).get_by_role('button',name=label,exact=True).click()
    def choose_date(label,value):
        import datetime
        trigger=page.get_by_role('button',name=label,exact=True)
        current=(trigger.get_attribute('value') or datetime.date.today().isoformat())[:7]
        delta=(int(value[:4])-int(current[:4]))*12+int(value[5:7])-int(current[5:7])
        trigger.click()
        for _ in range(abs(delta)):click('下个月' if delta>0 else '上个月')
        page.locator('.calendar-grid').get_by_role('button',name=value,exact=True).click()
        click('确认选择');expect(page.locator('.picker-dialog')).to_have_count(0)
    def pref(key,value):page.evaluate('([k,v])=>localStorage.setItem("pref:"+k,JSON.stringify(v))',[key,value])
    def settings():
        page.get_by_role('navigation',name='主导航').get_by_role('button',name='点单',exact=True).click()
        click('设置与备份')

    baseline=data(); snapshot={**baseline['recipes'][0],'servings':1}
    baseline['weeks']={'2026-10-05':{'0-早':[snapshot]},'2026-10-12':{'1-晚':[snapshot]}}
    page.evaluate('v=>localStorage.setItem("shiguang-v1",JSON.stringify(v))',baseline)
    draft={'text':'保留原文','kind':'recipes','draft':json.dumps([snapshot],ensure_ascii=False)}
    pref('ai-draft',draft)
    backup={'format':'shiguang','version':2,'state':{k:baseline[k] for k in ['recipes','fridge','confirmed','confirmedRecipes','weeks','archives']}}
    pref('before-restore',backup)
    version={'id':'test-version','time':'2026-09-19','device':'test','recipes':len(baseline['recipes'])}
    pref('sync-pending',[version])
    page.reload();page.wait_for_load_state('networkidle')

    # 覆盖已有周安排：嵌套应用弹窗，取消保留，确认仅替换目标周。
    page.get_by_role('navigation',name='主导航').get_by_role('button',name='周菜单',exact=True).click()
    click('历史');choose_date('选择存档日期','2026-10-05')
    choose_date('复制到目标周','2026-10-12')
    click('复制菜单');cancel('替换目标周安排？')
    click('复制菜单');accept('替换目标周安排？','确认替换')
    page.wait_for_function('()=>{let w=JSON.parse(localStorage.getItem("shiguang-v1")).weeks;return JSON.stringify(w["2026-10-05"])===JSON.stringify(w["2026-10-12"])}')
    settings()
    page.route('https://confirm.test/**',lambda r:(requests.append(r.request.url),r.fulfill(status=401,body='{}')))
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='AI 配置',exact=True).click()
    page.get_by_label('接口地址',exact=True).fill('https://confirm.test/chat')
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='AI 配置',exact=True).click()
    page.get_by_label('API Key',exact=True).fill('test');click('保存 AI 配置')
    page.get_by_role('navigation',name='主导航').get_by_role('button',name='菜谱',exact=True).click();click('导入菜谱');click('粘贴正文识别')
    click('确认发送并识别');cancel('发送给 AI 识别？')
    click('确认发送并识别');accept('发送给 AI 识别？','同意发送');cancel('替换识别草稿？')
    assert not requests
    page.get_by_label('公开链接',exact=False).fill('https://confirm.test/article')
    click('获取公开正文');cancel('替换输入正文？');assert not requests
    expect(page.get_by_label('识别原文',exact=True)).to_have_value('保留原文')
    page.get_by_role('button',name='查看待保存草稿',exact=False).click()
    expect(page.get_by_label('草稿名称1',exact=True)).to_have_value(snapshot['name'])
    click('稍后处理')
    page.get_by_role('navigation',name='主导航').get_by_role('button',name='冰箱',exact=True).click()
    with page.expect_file_chooser() as chooser: click('拍摄')
    chooser.value.set_files([])
    expect(page.get_by_role('button',name='查看待保存草稿',exact=False)).to_have_count(0)
    page.get_by_role('navigation',name='主导航').get_by_role('button',name='菜谱',exact=True).click();click('导入菜谱');click('粘贴正文识别')
    expect(page.get_by_label('识别原文',exact=True)).to_have_value('保留原文')
    settings()

    file={'name':'test.json','mimeType':'application/json','buffer':json.dumps(backup,ensure_ascii=False).encode()}
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='备份恢复',exact=True).click()
    page.get_by_label('导入备份',exact=True).set_input_files(file);cancel('恢复备份？')
    click('恢复上次导入前数据');cancel('恢复导入前数据？')
    click('恢复上次导入前数据');accept('恢复导入前数据？','确认恢复')
    page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).weeks["2026-10-12"]["1-晚"]?.length===1')

    # 云端版本/待发布副本使用模拟请求；取消不应下载或写入。
    state=backup['state']; encoded=json.dumps(state,ensure_ascii=False,separators=(',',':'))
    packed={'state':state,'hash':hashlib.sha256(encoded.encode()).hexdigest()}
    def dav(route):
        requests.append(route.request.url)
        if route.request.method=='MKCOL':route.fulfill(status=201);return
        body={**version,'versions':[version]} if route.request.url.endswith('current.json') else packed
        route.fulfill(status=200,content_type='application/json',body=json.dumps(body,ensure_ascii=False))
    page.route('https://dav.confirm/**',dav)
    page.get_by_role('navigation',name='设置分页').get_by_role('button',name='坚果云同步',exact=True).click()
    page.get_by_label('WebDAV 根地址',exact=True).fill('https://dav.confirm/')
    page.get_by_label('账号',exact=True).fill('test');page.get_by_label('应用密码',exact=True).fill('test');click('保存同步配置')
    page.get_by_text('待确认发布副本（1）',exact=True).click()
    click('恢复副本');cancel('恢复待发布副本？')
    click('检查并同步');page.get_by_text('最近云端备份',exact=True).click()
    click('恢复此版本');cancel('恢复云端版本？')
    click('恢复此版本');accept('恢复云端版本？','确认恢复')
    expect(page.get_by_text('同步完成',exact=True)).to_be_visible()
    click('恢复副本');accept('恢复待发布副本？','确认恢复')
    page.wait_for_function('!!localStorage.getItem("pref:sync-base")')
    page.wait_for_load_state('networkidle')
    assert not errors,errors
    print('PASS: week overwrite, AI/privacy/draft/text/type, backup rollback, cloud/pending restore; cancel preserves data and sends no request; no native dialogs')
    browser.close()
