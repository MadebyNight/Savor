"""开发者配置启停与凭据隔离；只使用模拟密文、密码和接口。"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.android-tools/device-logs/v1.1.2'
OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];calls=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'))
    page.wait_for_load_state('networkidle')
    bundle=page.evaluate('''async()=>{
      const format='shiguang-developer-ai-v1',iterations=600000;
      const salt=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
      const enc=s=>new TextEncoder().encode(s),b64=b=>btoa(String.fromCharCode(...b));
      const material=await crypto.subtle.importKey('raw',enc('fixture-password'),'PBKDF2',false,['deriveKey']);
      const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt']);
      const profile={url:'https://developer.test/v1/chat/completions',model:'developer-model',key:'fixture-developer-key'};
      const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc(format)},key,enc(JSON.stringify(profile))));
      return {format,iterations,salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)};
    }''')
    page.route('**/developer-ai-profile.json',lambda route:route.fulfill(content_type='application/json',body=json.dumps(bundle)))
    def handle(route):
        expected='fixture-developer-key' if route.request.url.startswith('https://developer.test/') else 'fixture-personal-key'
        assert route.request.headers['authorization']=='Bearer '+expected
        calls.append(route.request.url)
        route.fulfill(content_type='application/json',body=json.dumps({'choices':[{'message':{'content':'OK'}}]}))
    page.route('https://developer.test/**',handle);page.route('https://personal.test/**',handle)
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    click('设置与备份');click('AI 配置');page.locator('.developer-config > summary').click()
    page.get_by_label('接口地址',exact=True).fill('https://personal.test/v1/chat/completions')
    page.get_by_label('模型',exact=True).fill('personal-model')
    page.get_by_label('API Key',exact=True).fill('fixture-personal-key');click('保存 AI 配置')
    expect(page.get_by_label('API Key',exact=True)).to_have_value('')
    before=page.evaluate('JSON.stringify(localStorage)')
    click('启用开发者配置');page.get_by_label('解锁密码').fill('wrong');click('解锁并启用')
    expect(page.get_by_role('alert')).to_contain_text('密码错误')
    expect(page.get_by_label('解锁密码')).to_have_value('')
    assert page.evaluate('JSON.stringify(localStorage)')==before and not calls
    click('取消');expect(page.get_by_role('dialog')).to_have_count(0)
    click('启用开发者配置');page.get_by_label('解锁密码').fill('fixture-password');click('解锁并启用')
    expect(page.get_by_role('button',name='关闭开发者配置')).to_be_visible()
    expect(page.get_by_label('接口地址',exact=True)).to_have_value('https://developer.test/v1/chat/completions')
    expect(page.get_by_label('接口地址',exact=True)).to_be_disabled()
    expect(page.get_by_label('模型',exact=True)).to_have_value('developer-model')
    expect(page.get_by_role('button',name='保存 AI 配置',exact=True)).to_be_disabled()
    assert page.evaluate('JSON.stringify(localStorage)')==before and not calls
    click('测试连接');click('开始测试');expect(page.get_by_role('dialog',name='连接成功',exact=True)).to_be_visible();click('知道了')
    assert len(calls)==1 and calls[0].startswith('https://developer.test/')
    click('返回');click('设置与备份');click('AI 配置');page.locator('.developer-config > summary').click()
    expect(page.get_by_role('button',name='关闭开发者配置')).to_be_visible()
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(OUT/'developer-config.png'),full_page=True)
    click('关闭开发者配置')
    expect(page.get_by_label('接口地址',exact=True)).to_have_value('https://personal.test/v1/chat/completions')
    expect(page.get_by_label('模型',exact=True)).to_have_value('personal-model')
    click('测试连接');click('开始测试');expect(page.get_by_role('dialog',name='连接成功',exact=True)).to_be_visible();click('知道了')
    assert len(calls)==2 and calls[1].startswith('https://personal.test/')
    page.unroute('**/developer-ai-profile.json');page.route('**/developer-ai-profile.json',lambda r:r.fulfill(status=404))
    click('启用开发者配置');page.get_by_label('解锁密码').fill('fixture-password');click('解锁并启用')
    expect(page.get_by_role('alert')).to_contain_text('未包含有效')
    click('取消');assert page.evaluate('JSON.stringify(localStorage)')==before
    assert not errors,errors
    browser.close()
    print('PASS: password/cancel/unlock/missing bundle, configuration isolation, request routing, reopen and mobile layout')
