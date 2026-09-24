"""Authorized in-place APK upgrade; backs up private data and verifies expected category migration.

Requires ANDROID_RELEASE_APK and a fresh ANDROID_RELEASE_DIR; never uninstalls or clears data.
Only hashes and validation results are printed. Private backups stay under .android-tools.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time
import zipfile
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ADB=ROOT/'.android-tools/sdk/platform-tools/adb.exe'
SERIAL=os.environ.get('ANDROID_SERIAL','ea767f86')
PACKAGE='com.shiguang.mealplanner'
# Keep a workspace-relative APK path for adb install on Windows: its Unicode absolute path failed on an earlier device run.
APK=Path(os.environ['ANDROID_RELEASE_APK'])
assert APK.is_file(), 'Release APK not found; run this script from the workspace root for relative paths'
OUT=(ROOT/'.android-tools/device-logs'/os.environ['ANDROID_RELEASE_DIR']).resolve()
assert OUT.is_relative_to((ROOT/'.android-tools/device-logs').resolve())
assert not OUT.exists(), 'Use a fresh release evidence directory'
OUT.mkdir()
SIGNER=ROOT/'.android-tools/sdk/build-tools/36.0.0/lib/apksigner.jar'
AAPT=ROOT/'.android-tools/sdk/build-tools/36.0.0/aapt.exe'
JAVA=next((ROOT/'.android-tools/jdk21').glob('*/bin/java.exe'))
PORT='9236'
EXPECTED='82822576f8ce89e9029d3246e5dee0f988af129389333426ebeae9253a0eae9e'
VERSION_NAME='2.0.1'
VERSION_CODE=7
def adb(*args):
    return subprocess.run([str(ADB),'-s',SERIAL,*args],check=True,capture_output=True,timeout=120).stdout
def certificate(path):
    output=subprocess.run([str(JAVA),'-jar',str(SIGNER),'verify','--verbose','--print-certs',str(path)],check=True,capture_output=True).stdout.decode()
    return re.search(r'Signer #1 certificate SHA-256 digest: (\w+)',output)[1]
def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
def archive():
    return adb('exec-out','run-as',PACKAGE,'tar','-cf','-','databases','files','shared_prefs')
def fingerprints(data):
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        return {m.name:hashlib.sha256(tar.extractfile(m).read()).hexdigest() for m in tar.getmembers()
            if m.isfile() and m.name!='files/profileInstalled' and (m.name.startswith('files/') or m.name=='shared_prefs/credentials.xml')}
def preferences(data):
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        root=ET.fromstring(tar.extractfile('shared_prefs/preferences.xml').read())
        return {e.attrib['name']:ET.tostring(e) for e in root if e.attrib['name']!='dav-auto-sync'}
def attach(p):
    pid=adb('shell','pidof',PACKAGE).decode().strip()
    adb('forward','tcp:'+PORT,'localabstract:webview_devtools_remote_'+pid)
    for attempt in range(20):
        try:
            browser=p.chromium.connect_over_cdp('http://127.0.0.1:'+PORT,no_defaults=True,timeout=3000)
            page=browser.contexts[0].pages[0]
            page.wait_for_selector('.topbar')
            return browser,page
        except Exception:
            if attempt==19: raise
            time.sleep(.5)
def state(page):
    return json.loads(page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)'))

assert certificate(APK)==EXPECTED,'New APK certificate mismatch'
badging=subprocess.run([str(AAPT),'dump','badging',str(APK)],check=True,capture_output=True).stdout.decode(errors='replace')
assert re.search(rf"^package: name='{re.escape(PACKAGE)}' versionCode='{VERSION_CODE}' versionName='{re.escape(VERSION_NAME)}'",badging,re.M),'New APK package or version mismatch'
with zipfile.ZipFile(APK) as apk:
    files=[f for f in (ROOT/'dist').rglob('*') if f.is_file()]
    assert all(apk.read('assets/public/'+f.relative_to(ROOT/'dist').as_posix())==f.read_bytes() for f in files)
installed=adb('shell','pm','path',PACKAGE).decode().strip().removeprefix('package:')
(OUT/'installed-before.apk').write_bytes(adb('exec-out','cat',installed))
assert certificate(OUT/'installed-before.apk')==EXPECTED,'Installed APK certificate mismatch'
print('PASS: old/new certificates and APK frontend resources verified',flush=True)
report={'apkSha256':hashlib.sha256(APK.read_bytes()).hexdigest(),'certificateSha256':EXPECTED,'resourceFiles':len(files)}
with sync_playwright() as p:
    browser,page=attach(p)
    original_sync=page.evaluate('Capacitor.Plugins.LocalData.getPreference({key:"dav-auto-sync"}).then(r=>r.value)')
    (OUT/'auto-sync-before.json').write_text(json.dumps(original_sync),encoding='utf-8')
    original=state(page)
    (OUT/'before.json').write_text(json.dumps(original,ensure_ascii=False),encoding='utf-8')
    page.evaluate('Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value:"false"})')
    try:
        browser.close()
        adb('shell','am','force-stop',PACKAGE)
        private_before=archive()
        (OUT/'private-before.tar').write_bytes(private_before)
        before_files=fingerprints(private_before)
        print('PASS: private data, old APK, business baseline backed up; startup sync temporarily disabled',flush=True)
        output=adb('install','-r',str(APK)).decode()
        assert 'Success' in output,'In-place install failed'
        adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')
        browser,page=attach(p)
        page.wait_for_function('async()=>Array.isArray(JSON.parse((await Capacitor.Plugins.LocalData.loadState()).value).recipeCategories)')
        after=state(page)
        before_core={k:v for k,v in original.items() if k!='recipeCategories'}
        after_core={k:v for k,v in after.items() if k!='recipeCategories'}
        assert before_core==after_core,'Unexpected business data changes; backups retained'
        expected_categories=json.loads(subprocess.run(['node','--input-type=module','-e',
            "import {categoryNames} from './src/categories.js';let s='';for await(const c of process.stdin)s+=c;const v=JSON.parse(s);process.stdout.write(JSON.stringify(categoryNames(v.recipeCategories,v.recipes)));"],
            input=json.dumps(original).encode(),capture_output=True,check=True,cwd=ROOT).stdout)
        assert after['recipeCategories']==expected_categories,'Unexpected category migration'
        page.get_by_role('navigation',name='主导航').get_by_role('button',name='点单',exact=True).click()
        if page.locator('.selection-bar').count():
            assert page.locator('.selection-bar').evaluate('e=>{const a=e.getBoundingClientRect(),b=e.querySelector(".primary").getBoundingClientRect();return Math.abs(a.right-b.right)<1&&Math.abs(a.top-b.top)<1&&Math.abs(a.bottom-b.bottom)<1}')
        (OUT/'order.png').write_bytes(adb('exec-out','screencap','-p'))
        page.get_by_role('button',name='管理分类',exact=True).click()
        page.wait_for_timeout(500)
        (OUT/'category-manager.png').write_bytes(adb('exec-out','screencap','-p'))
        page.get_by_role('button',name='关闭弹窗',exact=True).click()
        page.get_by_role('navigation',name='主导航').get_by_role('button',name='菜篮子',exact=True).click()
        page.wait_for_timeout(400)
        (OUT/'basket.png').write_bytes(adb('exec-out','screencap','-p'))
        page.get_by_role('navigation',name='主导航').get_by_role('button',name='点单',exact=True).click()
        # Check another cold start with synchronization still disabled.
        browser.close();adb('shell','am','force-stop',PACKAGE)
        adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')
        browser,page=attach(p)
        assert state(page)==after,'State changed across second launch'
        private_after=archive()
        after_files=fingerprints(private_after)
        assert before_files==after_files,'Private images/files or encrypted credentials changed'
        assert preferences(private_before)==preferences(private_after),'User preferences changed'
        version=adb('shell','dumpsys','package',PACKAGE).decode()
        assert f'versionCode={VERSION_CODE} ' in version and f'versionName={VERSION_NAME}' in version
        report.update(businessHashBefore=digest(before_core),businessHashAfter=digest(after_core),
            onlyExpectedCategoryMigration=True,privateFilesAndEncryptedCredentialsUnchanged=True,
            userPreferencesUnchanged=True,coldStartPreserved=True,version=VERSION_NAME,versionCode=VERSION_CODE,
            allowedRuntimeFileChange='files/profileInstalled')
        print('PASS: in-place upgrade, original business data/images/encrypted credentials, expected category migration, cold start, UI alignment',flush=True)
    finally:
        try:
            page.evaluate('value=>Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value})',original_sync)
        except Exception:
            browser,page=attach(p)
            page.evaluate('value=>Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value})',original_sync)
        assert page.evaluate('Capacitor.Plugins.LocalData.getPreference({key:"dav-auto-sync"}).then(r=>r.value)')==original_sync
        report['startupSyncRestored']=True
        browser.close()
        adb('forward','--remove','tcp:'+PORT)
        (OUT/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PASS: startup sync restored; evidence saved under ignored device logs')
