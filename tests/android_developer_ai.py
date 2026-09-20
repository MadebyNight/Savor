"""已授权手机上的开发者配置验收；先开启 android-logcat，不发送真实 AI 请求。"""
import argparse
import getpass
import hashlib
import json
import subprocess
import sys
import time
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.android-tools/device-logs/v1.1.2'
OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial',required=True)
parser.add_argument('--password-stdin',action='store_true')
args=parser.parse_args()
password=sys.stdin.buffer.readline().decode('utf-8-sig').rstrip('\r\n') if args.password_stdin else getpass.getpass('开发者配置密码：')
adb=str(ROOT/'.android-tools/sdk/platform-tools/adb.exe')
def run(*values):
    return subprocess.check_output([adb,'-s',args.serial,*values],text=True,encoding='utf-8').strip()
def attach(p):
    for attempt in range(6):
        pid=run('shell','pidof','com.shiguang.mealplanner')
        port=run('forward','tcp:0','localabstract:webview_devtools_remote_'+pid)
        try:
            browser=p.chromium.connect_over_cdp('http://127.0.0.1:'+port,no_defaults=True,timeout=5000)
            page=browser.contexts[0].pages[0]
            page.set_default_timeout(30000)
            page.wait_for_function('!!document.querySelector(".topbar")')
            return browser,page,port
        except Exception:
            run('forward','--remove','tcp:'+port)
            if attempt==5:raise
            time.sleep(1)
def restart():
    run('shell','am','force-stop','com.shiguang.mealplanner')
    run('shell','am','start','-W','-n','com.shiguang.mealplanner/.MainActivity')
fingerprint='''async()=>{const l=Capacitor.Plugins.LocalData;
const values=[(await l.getPreference({key:'ai-config'})).value,(await l.getSecret({key:'ai'})).value,(await l.loadState()).value];
return Promise.all(values.map(async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v||'')))).map(x=>x.toString(16).padStart(2,'0')).join('')));}'''
with sync_playwright() as p:
    restart();browser,page,port=attach(p)
    assert page.evaluate("async()=>!(await Capacitor.Plugins.LocalData.getSecret({key:'ai-developer'})).value"),'请先关闭开发者配置，再运行本测试'
    before=page.evaluate(fingerprint)
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    click('设置与备份');click('AI 配置');click('启用开发者配置')
    page.get_by_label('解锁密码').fill('invalid-test-password');click('解锁并启用')
    expect(page.get_by_role('alert')).to_contain_text('密码错误');click('取消')
    assert page.evaluate("async()=>!(await Capacitor.Plugins.LocalData.getSecret({key:'ai-developer'})).value")
    click('启用开发者配置');page.get_by_label('解锁密码').fill(password);click('解锁并启用')
    expect(page.get_by_role('button',name='关闭开发者配置')).to_be_visible(timeout=30000)
    assert page.evaluate("async()=>{const v=JSON.parse((await Capacitor.Plugins.LocalData.getSecret({key:'ai-developer'})).value);return !!v.key&&!!v.url&&!!v.model;}")
    page.locator('.developer-config').screenshot(path=str(OUT/'phone-developer-enabled.png'))
    assert page.evaluate(fingerprint)==before
    browser.close();run('forward','--remove','tcp:'+port)
    restart();browser,page,port=attach(p)
    click('设置与备份');click('AI 配置')
    expect(page.get_by_role('button',name='关闭开发者配置')).to_be_visible()
    click('关闭开发者配置');expect(page.get_by_role('button',name='启用开发者配置')).to_be_visible()
    expect(page.get_by_label('接口地址',exact=True)).to_be_enabled()
    assert page.evaluate(fingerprint)==before
    assert page.evaluate("async()=>!(await Capacitor.Plugins.LocalData.getSecret({key:'ai-developer'})).value")
    files=[f.relative_to(ROOT/'dist').as_posix() for f in (ROOT/'dist').rglob('*') if f.is_file() and f.suffix in ('.js','.css','.json','.html')]
    safe=page.evaluate('''async({files,password})=>{const key=(await Capacitor.Plugins.LocalData.getSecret({key:'ai'})).value;
      if(!key)return false;
      for(const file of files){const text=await(await fetch('/'+file)).text();if(text.includes(key)||text.includes(password))return false;}return true;
    }''',{'files':files,'password':password})
    assert safe,'安装包出现明文凭据或密码'
    page.locator('.developer-config').screenshot(path=str(OUT/'phone-developer-disabled.png'))
    browser.close();run('forward','--remove','tcp:'+port)
apk=ROOT/'食光-V1.1.2.apk'
with zipfile.ZipFile(apk) as z:
    files=[f for f in (ROOT/'dist').rglob('*') if f.is_file()]
    for f in files:assert z.read('assets/public/'+f.relative_to(ROOT/'dist').as_posix())==f.read_bytes()
report={'wrong_password_cancel':True,'correct_password_unlock':True,'keystore_restart_persistence':True,'disable_restores_personal':True,'personal_config_key_business_unchanged':True,'apk_no_plaintext_key_or_password':True,'apk_dist_matched_files':len(files),'real_ai_request_sent':False,'final_developer_enabled':False,'sha256':hashlib.sha256(apk.read_bytes()).hexdigest()}
(OUT/'developer-phone-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
