"""经用户授权后，只点击真实账户的检查入口；不上传、不恢复、不读取凭据。"""
import hashlib
import json
import os
import re
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/webdav-acceptance'
ADB = ROOT / '.android-tools/sdk/platform-tools/adb.exe'
SERIAL = os.environ.get('ANDROID_SERIAL', 'ea767f86')
PACKAGE = 'com.shiguang.mealplanner'

def adb(*args):
    return subprocess.run([str(ADB), '-s', SERIAL, *args], check=True, capture_output=True, encoding='utf-8', errors='replace', timeout=30).stdout.strip()

def digest(value):
    return hashlib.sha256(json.dumps(json.loads(value),sort_keys=True,ensure_ascii=False).encode()).hexdigest()

adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')
pid = adb('shell','pidof',PACKAGE)
adb('forward','tcp:9223','localabstract:webview_devtools_remote_'+pid)
try:
    with sync_playwright() as p:
        for attempt in range(15):
            try:
                browser = p.chromium.connect_over_cdp('http://127.0.0.1:9223',no_defaults=True,timeout=3000)
                break
            except Exception:
                if attempt == 14: raise
                time.sleep(.5)
        try:
            page = browser.contexts[0].pages[0]
            page.wait_for_function("[...document.querySelectorAll('[role=status]')].some(e=>e.textContent==='已保存')")
            read = lambda: page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)')
            before = read()
            assert digest(before) == digest((OUT/'before.json').read_text(encoding='utf-8')), 'Business state changed since backup; stopped without syncing'
            page.get_by_role('navigation',name='主导航').get_by_role('button',name='点单',exact=True).click()
            page.get_by_role('button',name='设置与备份',exact=True).click()
            page.get_by_role('navigation',name='设置分页').get_by_role('button',name='坚果云同步',exact=True).click()
            page.get_by_role('button',name='检查并同步',exact=True).click()
            page.wait_for_function("""() => document.querySelector('.sync-dialog') ||
                [...document.querySelectorAll('[data-sonner-toast]')].some(e=>/失败|一致|先保存/.test(e.textContent))""",timeout=150000)
            notice = page.locator('.sync-dialog [data-slot=dialog-title]')
            message = notice.inner_text() if notice.count() else '\n'.join(page.locator('[data-sonner-toast]').all_text_contents())
            message = re.sub(r'https?://\S+','[URL]',message)
            message = re.sub(r'[\w.+-]+@[\w.-]+','[ACCOUNT]',message)
            report = {'result':message,'business_unchanged':digest(read())==digest(before),'uploaded':False,'restored':False}
            assert report['business_unchanged'], 'Business data changed during inspect'
            logs = adb('logcat','-d','--pid='+pid,'-s','ShiguangNetwork:I','*:S')
            report['network'] = re.findall(r'method=[A-Z]+ stage=\w+ (?:status=\d+|error=\w+)',logs)
            (OUT/'sync-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(report,ensure_ascii=False))
        finally:
            browser.close()
finally:
    adb('forward','--remove','tcp:9223')
