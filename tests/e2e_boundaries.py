"""入口边界验收；失败保留截图和日志，全部执行后以非零状态退出。"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/full-e2e-20260920/boundaries'
OUT.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    recipe = {'name':'测试菜谱','ingredients':[{'name':'青椒','qty':2,'unit':'个'}],'steps':['炒熟']}
    cases = [
        ('ai-ingredients-object', {**recipe,'ingredients':{'name':'青椒'}}),
        ('ai-steps-string', {**recipe,'steps':'炒熟后装盘'}),
        ('ai-null-ingredient', {**recipe,'ingredients':[None]}),
        ('ai-number-name', {**recipe,'name':42}),
        ('ai-valid-save', recipe),
    ]
    for name, item in cases:
        context=browser.new_context(viewport={'width':390,'height':844})
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.on('console',lambda m: errors.append(m.text) if m.type=='error' and 'TypeError' in m.text else None)
        try:
            page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'));page.wait_for_load_state('networkidle')
            click=lambda label:page.get_by_role('button',name=label,exact=True).click()
            click('设置与备份')
            page.get_by_label('接口地址',exact=True).fill('https://boundary.test')
            page.get_by_label('API Key',exact=True).fill('mock');click('保存 AI 配置')
            page.route('https://boundary.test/**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':json.dumps({'items':[item]})}}]})))
            page.get_by_role('navigation',name='主导航').get_by_role('button',name='菜谱',exact=True).click();click('导入菜谱');click('粘贴正文识别')
            page.get_by_label('识别原文',exact=True).fill('青椒炒熟后装盘')
            before=page.evaluate('localStorage.getItem("shiguang-v1")')
            click('确认发送并识别');click('同意发送')
            page.wait_for_timeout(700)
            assert not errors, errors
            assert page.locator('.topbar').count(), '主界面消失'
            if page.get_by_role('button',name='确认保存选中条目',exact=True).count():
                click('确认保存选中条目');page.wait_for_timeout(300)
            assert not errors,errors
            if name in ['ai-valid-save','ai-ingredients-object','ai-steps-string']:
                page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(r=>r.name==="测试菜谱")')
                page.reload();page.wait_for_load_state('networkidle')
                assert page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(r=>r.name==="测试菜谱")')
            else:
                expect(page.get_by_role('dialog',name='识别未完成',exact=True)).to_be_visible()
                assert page.evaluate('localStorage.getItem("shiguang-v1")')==before
            results.append({'case':name,'result':'PASS'})
        except Exception as e:
            results.append({'case':name,'result':'FAIL','error':str(e),'pageErrors':errors})
        finally:
            page.screenshot(path=str(OUT/(name+'.png')))
            context.close()
    # 非法备份不能写入业务库后才在页面渲染阶段崩溃。
    for name, patch in [
        ('backup-object-category',{'category':{'label':'素菜'}}),
        ('backup-object-time',{'time':{'minutes':5}}),
        ('backup-duplicate-ids',{}),
    ]:
        context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'));page.wait_for_load_state('networkidle')
            before=page.evaluate('localStorage.getItem("shiguang-v1")')
            state=json.loads(before)
            state['recipes']=[{**recipe,'id':'boundary',**patch}]
            if name=='backup-duplicate-ids':state['recipes'].append({**recipe,'id':'boundary','name':'第二道重复ID菜谱'})
            page.get_by_role('button',name='设置与备份',exact=True).click()
            page.get_by_role('button',name='备份恢复',exact=True).click()
            page.get_by_label('导入备份',exact=True).set_input_files({'name':'boundary.json','mimeType':'application/json','buffer':json.dumps({'format':'shiguang','version':2,'state':state}).encode()})
            page.wait_for_timeout(200)
            if page.get_by_role('button',name='确认恢复',exact=True).count():
                page.get_by_role('button',name='确认恢复',exact=True).click();page.wait_for_timeout(300)
            if page.get_by_role('button',name='返回',exact=True).count():page.get_by_role('button',name='返回',exact=True).click()
            page.get_by_role('navigation',name='主导航').get_by_role('button',name='菜谱',exact=True).click()
            page.wait_for_timeout(300)
            assert not errors,errors
            if name=='backup-object-time':
                page.locator('.library-recipe').first.click();page.wait_for_timeout(300)
                assert not errors,errors
            if name=='backup-duplicate-ids' and page.evaluate('localStorage.getItem("shiguang-v1")')!=before:
                page.locator('.library-recipe').first.click()
                page.get_by_role('button',name='删除菜谱',exact=True).click()
                page.get_by_role('button',name='确认删除',exact=True).click()
                page.wait_for_timeout(300)
                assert page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1")).recipes.some(r=>r.name==="第二道重复ID菜谱")'),'删除第一道菜连带删除了第二道重复 ID 菜谱'
            assert page.evaluate('localStorage.getItem("shiguang-v1")')==before,'非法备份已覆盖本地库，未阻止恢复'
            results.append({'case':name,'result':'PASS'})
        except Exception as e:results.append({'case':name,'result':'FAIL','error':str(e),'pageErrors':errors})
        finally:
            page.screenshot(path=str(OUT/(name+'.png')));context.close()
    context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    old_draft=json.dumps({'kind':'recipes','text':'保留的原文','draft':json.dumps([{**recipe,'ingredients':[None]}])})
    context.add_init_script('localStorage.setItem("pref:ai-draft",'+json.dumps(old_draft)+');')
    try:
        page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'));page.wait_for_load_state('networkidle')
        page.get_by_role('navigation',name='主导航').get_by_role('button',name='菜谱',exact=True).click();page.get_by_role('button',name='导入菜谱',exact=True).click();page.get_by_role('button',name='粘贴正文识别',exact=True).click()
        page.get_by_role('button',name='查看异常草稿说明',exact=True).click()
        expect(page.get_by_role('dialog',name='识别未完成',exact=True)).to_be_visible()
        assert not errors,errors
        assert page.evaluate('localStorage.getItem("pref:ai-draft")')==old_draft
        results.append({'case':'persisted-invalid-draft','result':'PASS'})
    except Exception as e:results.append({'case':'persisted-invalid-draft','result':'FAIL','error':str(e),'pageErrors':errors})
    finally:context.close()
    browser.close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
for result in results: print(json.dumps(result,ensure_ascii=False))
raise SystemExit(any(r['result']=='FAIL' for r in results))
