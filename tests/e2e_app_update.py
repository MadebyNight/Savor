"""更新源、版本比较和自动检查开关的浏览器回归；原生安装另验。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
API='https://api.github.com/repos/MadebyNight/Savor/releases/latest'
def release(version,asset=True):
    name=f'Savor-v{version}-public.apk'
    return {'tag_name':f'v{version}','draft':False,'prerelease':False,'assets':[{
        'name':name,'browser_download_url':f'https://github.com/MadebyNight/Savor/releases/download/v{version}/{name}',
        'digest':'sha256:'+'a'*64,
    }] if asset else []}

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'),wait_until='networkidle')
    page.get_by_role('button',name='设置与备份').click()
    page.get_by_role('navigation',name='设置首页').get_by_role('button',name='版本更新').click()
    expect(page.get_by_text('当前版本：2.0.2 · 开发者版')).to_be_visible()
    switch=page.get_by_role('checkbox',name='自动更新检查')
    expect(switch).to_be_checked()
    switch.uncheck()
    page.reload(wait_until='networkidle')
    page.get_by_role('button',name='设置与备份').click()
    page.get_by_role('navigation',name='设置首页').get_by_role('button',name='版本更新').click()
    expect(page.get_by_role('checkbox',name='自动更新检查')).not_to_be_checked()
    page.get_by_role('button',name='检查更新').click()
    expect(page.get_by_text('更新仅在 Android 应用内可用')).to_be_visible()
    assert page.evaluate("async()=>{const u=await import('/src/app-update.js');return await u.autoCheckEnabled()}") is False
    assert page.evaluate("async()=>{const u=await import('/src/app-update.js');await u.markCheckedToday();return await u.checkedToday()}") is True
    page.route(API,lambda route:route.fulfill(json=release('2.0.1')))
    assert page.evaluate("async()=>{const u=await import('/src/app-update.js');return await u.latestPublicUpdate()}") is None
    page.unroute(API)
    page.route(API,lambda route:route.fulfill(json=release('2.0.3')))
    update=page.evaluate("async()=>{const u=await import('/src/app-update.js');return await u.latestPublicUpdate()}")
    assert update['version']=='2.0.3' and update['sha256']=='a'*64
    assert page.evaluate("async()=>{const u=await import('/src/app-update.js');return [u.compareVersions('2.0.10','2.0.9'),u.compareVersions('2.0.2','2.0.2')]}")==[1,0]
    page.unroute(API)
    page.route(API,lambda route:route.fulfill(json=release('2.0.3',False)))
    assert page.evaluate("async()=>{try{const u=await import('/src/app-update.js');await u.latestPublicUpdate();return false}catch{return true}}")
    assert not errors,errors
    browser.close()
print('PASS: update settings, daily preference, version and release asset checks')
