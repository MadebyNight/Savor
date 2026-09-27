"""V2.1.x 真机保留数据升级与核心闭环验收；证据只保存在忽略目录。"""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import time
import xml.etree.ElementTree as ET

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ADB = ROOT / '.android-tools/sdk/platform-tools/adb.exe'
AAPT = ROOT / '.android-tools/sdk/build-tools/36.0.0/aapt.exe'
SIGNER = ROOT / '.android-tools/sdk/build-tools/36.0.0/lib/apksigner.jar'
JAVA = next((ROOT / '.android-tools/jdk21').glob('*/bin/java.exe'))
SERIAL = os.environ['ANDROID_SERIAL']
TARGET_VERSION = os.environ.get('ANDROID_TARGET_VERSION', '2.1.0')
PREVIOUS_VERSION, PREVIOUS_CODE, TARGET_CODE = {
    '2.1.0': ('2.0.2', 8, 9),
    '2.1.1': ('2.1.0', 9, 10),
    '2.1.2': ('2.1.1', 10, 11),
    '2.1.3': ('2.1.2', 11, 12),
    '2.1.4': ('2.1.3', 12, 13),
    '2.1.5': ('2.1.4', 13, 14),
    '2.1.6': ('2.1.5', 14, 15),
    '2.1.7': ('2.1.6', 15, 16),
    '2.1.9': ('2.1.8', 17, 18),
    '2.1.10': ('2.1.9', 18, 19),
}[TARGET_VERSION]
PREVIOUS_VERSION = os.environ.get('ANDROID_PREVIOUS_VERSION', PREVIOUS_VERSION)
PREVIOUS_CODE = int(os.environ.get('ANDROID_PREVIOUS_CODE', PREVIOUS_CODE))
HAS_KG = TARGET_CODE >= 10
OUT = (ROOT / '.android-tools/device-logs' / os.environ['ANDROID_ACCEPTANCE_DIR']).resolve()
APK = Path('android/app/build/outputs/apk/debug/app-debug.apk')
PACKAGE = 'com.shiguang.mealplanner'
CERT = '82822576f8ce89e9029d3246e5dee0f988af129389333426ebeae9253a0eae9e'
PORT = '9238'
assert OUT.is_relative_to((ROOT / '.android-tools/device-logs').resolve()) and not OUT.exists(), '请指定全新的验收目录'
assert APK.is_file(), '缺少目标 APK'


def adb(*args):
    return subprocess.run([str(ADB), '-s', SERIAL, *args], check=True, capture_output=True, timeout=120).stdout


def certificate(path):
    output = subprocess.run([str(JAVA), '-jar', str(SIGNER), 'verify', '--verbose', '--print-certs', str(path)], check=True, capture_output=True).stdout.decode()
    return re.search(r'Signer #1 certificate SHA-256 digest: (\w+)', output)[1]


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def archive():
    return adb('exec-out', 'run-as', PACKAGE, 'tar', '-cf', '-', 'databases', 'files', 'shared_prefs')


def private_fingerprints(data):
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        return {item.name: hashlib.sha256(tar.extractfile(item).read()).hexdigest() for item in tar.getmembers()
                if item.isfile() and item.name != 'files/profileInstalled'
                and (item.name.startswith('files/') or item.name == 'shared_prefs/credentials.xml')}


def preferences(data):
    with tarfile.open(fileobj=io.BytesIO(data)) as tar:
        root = ET.fromstring(tar.extractfile('shared_prefs/preferences.xml').read())
        return {entry.attrib['name']: ET.tostring(entry) for entry in root
                if entry.attrib['name'] not in ('dav-auto-sync', 'app-update-checked-day')}


def attach(playwright):
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
    pid = adb('shell', 'pidof', PACKAGE).decode().strip()
    assert pid, '应用进程未启动'
    adb('forward', 'tcp:' + PORT, 'localabstract:webview_devtools_remote_' + pid)
    for attempt in range(20):
        try:
            browser = playwright.chromium.connect_over_cdp('http://127.0.0.1:' + PORT, no_defaults=True, timeout=3000)
            page = browser.contexts[0].pages[0]
            page.set_default_timeout(12000)
            page.wait_for_function("!!document.querySelector('.topbar') && [...document.querySelectorAll('[role=status]')].some(e=>e.textContent==='已保存')")
            return browser, page
        except Exception:
            if attempt == 19:
                raise
            time.sleep(.5)


def state(page):
    return json.loads(page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)'))


def saved(page):
    page.wait_for_function("[...document.querySelectorAll('[role=status]')].some(e=>e.textContent==='已保存')")


def nav(page, name):
    page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()


assert certificate(APK) == CERT, '新 APK 签名不一致'
badging = subprocess.run([str(AAPT), 'dump', 'badging', str(APK)], check=True, capture_output=True).stdout.decode(errors='replace')
assert re.search(rf"^package: name='com\.shiguang\.mealplanner' versionCode='{TARGET_CODE}' versionName='{re.escape(TARGET_VERSION)}'", badging, re.M), '新 APK 包名或版本不正确'
installed = adb('shell', 'pm', 'path', PACKAGE).decode().strip().removeprefix('package:')
assert installed.startswith('/data/app/'), '已安装 APK 路径异常'
old_apk = adb('exec-out', 'cat', installed)
OUT.mkdir(parents=True)
(OUT / 'installed-before.apk').write_bytes(old_apk)
assert certificate(OUT / 'installed-before.apk') == CERT, '手机已安装版本的签名不一致'
old_version = adb('shell', 'dumpsys', 'package', PACKAGE).decode(errors='replace')
assert f'versionCode={PREVIOUS_CODE} ' in old_version and f'versionName={PREVIOUS_VERSION}' in old_version, '手机版本不是预期的升级基线'
print('PASS: 新旧 APK 签名、包名及版本核对', flush=True)

report = {'serial': SERIAL, 'versionBefore': PREVIOUS_VERSION, 'versionAfter': TARGET_VERSION, 'apkSha256': hashlib.sha256(APK.read_bytes()).hexdigest(), 'checks': []}
original_sync = None
after = None
test_started = False
with sync_playwright() as playwright:
    browser, page = attach(playwright)
    try:
        original = state(page)
        assert original.get('recipes'), '没有可用于验收的菜谱'
        original_sync = page.evaluate('Capacitor.Plugins.LocalData.getPreference({key:"dav-auto-sync"}).then(r=>r.value)')
        (OUT / 'before.json').write_text(json.dumps(original, ensure_ascii=False), encoding='utf-8')
        browser.close()
        adb('shell', 'am', 'force-stop', PACKAGE)
        private_before = archive()
        (OUT / 'private-before.tar').write_bytes(private_before)
        print('PASS: 旧 APK、业务状态及完整私有数据已备份', flush=True)

        browser, page = attach(playwright)
        page.evaluate('Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value:"false"})')
        browser.close()
        adb('shell', 'am', 'force-stop', PACKAGE)
        assert b'Success' in adb('install', '-r', str(APK)), '覆盖安装失败'
        browser, page = attach(playwright)
        after = state(page)
        assert all(after.get(key) == value for key, value in original.items()), '旧版业务字段在升级后发生非预期变化'
        if TARGET_VERSION == '2.1.0':
            assert after.get('pendingOrders') == [] and after.get('purchaseDrafts') == {}, '新增字段的初始值不正确'
        assert private_fingerprints(private_before) == private_fingerprints(archive()), '图片或加密凭据发生变化'
        assert preferences(private_before) == preferences(archive()), '用户偏好发生变化'
        version = adb('shell', 'dumpsys', 'package', PACKAGE).decode(errors='replace')
        assert f'versionCode={TARGET_CODE} ' in version and f'versionName={TARGET_VERSION}' in version
        report['checks'].append('覆盖升级后原业务字段、图片、加密凭据及设置保留')
        (OUT / 'upgraded-home.png').write_bytes(adb('exec-out', 'screencap', '-p'))
        print('PASS: 保留数据覆盖升级及新增字段迁移', flush=True)

        test = copy.deepcopy(after)
        recipe = copy.deepcopy(test['recipes'][0])
        recipe['id'] = max((item['id'] for item in test['recipes'] if isinstance(item.get('id'), int)), default=0) + 1
        recipe['name'] = 'V21真机验收临时菜'
        recipe['ingredients'] = [{'name': 'V21验收食材', 'qty': 200, 'unit': 'g', 'category': '蔬菜'}]
        recipe['steps'] = ['完成验收。']
        recipe['time'] = 2
        test.update(recipes=[*test['recipes'], recipe], fridge=[], qty={}, confirmed={}, confirmedRecipes=[], purchased={}, weeks={}, pendingOrders=[], purchaseDrafts={})
        page.evaluate('value=>Capacitor.Plugins.LocalData.saveState({value})', json.dumps(test, ensure_ascii=False))
        test_started = True
        page.reload(); saved(page)
        if HAS_KG:
            nav(page, '冰箱')
            page.get_by_role('button', name='手动添加', exact=True).click()
            stock = page.get_by_role('dialog', name='添加新鲜食材')
            stock.get_by_label('食材名称', exact=True).fill('V21验收食材')
            stock.get_by_label('数量', exact=True).fill('0.1')
            stock.get_by_label('单位', exact=True).fill('kg')
            stock.get_by_role('button', name='确认放入冰箱').click()
            page.wait_for_function('async()=>JSON.parse((await Capacitor.Plugins.LocalData.loadState()).value).fridge.some(x=>x.name==="V21验收食材"&&x.qty===0.1&&x.unit==="kg")')
        nav(page, '点单')
        page.get_by_role('button', name='添加' + recipe['name'], exact=True).click()
        page.get_by_role('button', name='确认选菜', exact=False).click()
        page.get_by_role('dialog', name='我的点单清单').get_by_role('button', name='确认并同步', exact=False).click()
        page.wait_for_function('async()=>JSON.parse((await Capacitor.Plugins.LocalData.loadState()).value).pendingOrders.length===1')
        nav(page, '菜单')
        expect(page.get_by_role('tab', name='当日菜单')).to_have_attribute('aria-selected', 'true')
        page.get_by_role('button', name='待分配 1 道').click()
        assert page.locator('.today-pending-panel select').count() == 0, '待分配区域仍含原生餐次选择器'
        page.locator('.today-pending-row').first.get_by_role('button', name='选择餐次').click()
        expect(page.get_by_role('group', name='为' + recipe['name'] + '选择餐次').get_by_role('button')).to_have_count(5)
        (OUT / 'pending-meal-choices.png').write_bytes(adb('exec-out', 'screencap', '-p'))
        page.get_by_role('group', name='为' + recipe['name'] + '选择餐次').get_by_role('button', name='午餐').click()
        page.wait_for_function('async()=>JSON.parse((await Capacitor.Plugins.LocalData.loadState()).value).pendingOrders.length===0')
        expect(page.get_by_role('region', name='午餐')).to_contain_text(recipe['name'])
        assert not page.get_by_role('region', name='夜宵').count()
        page.get_by_role('region', name='午餐').locator('.today-dish-name').click()
        snapshot = page.locator('.meal-snapshot-dialog')
        expect(snapshot).to_contain_text('制作步骤')
        timer = snapshot.locator('.recipe-timer')
        expect(timer.locator('.recipe-timer-panel')).to_be_visible()
        timer.locator('.recipe-timer-time').click()
        timer.get_by_role('spinbutton', name='分钟').fill('1')
        timer.get_by_role('spinbutton', name='秒').fill('30')
        timer.get_by_role('button', name='确定').click()
        expect(timer.locator('output')).to_have_text('01:30')
        snapshot.get_by_label('关闭弹窗').click()
        nav(page, '菜篮子')
        card = page.locator('.shopping-card').filter(has=page.get_by_role('heading', name='V21验收食材'))
        expect(card).to_contain_text('100' if HAS_KG else '200')
        card.get_by_role('button', name='编辑V21验收食材购买量与来源').click()
        edit = page.get_by_role('dialog', name='修改V21验收食材购买量')
        expect(edit.get_by_role('region', name='排单来源')).to_contain_text(recipe['name'])
        expect(edit.get_by_role('region', name='需求核算')).to_be_visible()
        if HAS_KG:
            edit.get_by_role('button', name='购买量单位').click()
            page.get_by_role('dialog', name='选择购买量单位').get_by_role('button', name='千克（kg）').click()
            edit.get_by_role('spinbutton').fill('0.26')
        else:
            edit.get_by_role('spinbutton').fill('260')
        edit.get_by_role('button', name='保存购买量').click()
        card.get_by_role('checkbox').check()
        assert page.locator('.basket-stock-action').evaluate('button => getComputedStyle(button).backgroundColor') == 'rgb(249, 204, 79)'
        page.locator('.basket-stock-action').click()
        page.get_by_role('dialog', name='核对已买食材并入库').get_by_role('button', name='确认入库 · 1 项').click()
        page.wait_for_function('async()=>JSON.parse((await Capacitor.Plugins.LocalData.loadState()).value).fridge.some(x=>x.name==="V21验收食材"&&x.qty===260&&x.unit==="g")')
        assert not any(value.get('checked') for value in state(page)['purchaseDrafts'].values())
        report['checks'].append('点单、当日分配、菜谱快照及计时编辑、购买量修改和入库' + ('；0.1kg 库存抵扣 100g、0.26kg 采购入库 260g' if HAS_KG else ''))
        (OUT / 'workflow-basket.png').write_bytes(adb('exec-out', 'screencap', '-p'))
        browser.close()
        adb('shell', 'am', 'force-stop', PACKAGE)
        browser, page = attach(playwright)
        assert any(item['name'] == 'V21验收食材' and item['qty'] == 260 and item['unit'] == 'g' for item in state(page)['fridge'])
        report['checks'].append('强制停止后重启仍保留测试排单与库存')
        print('PASS: 真机闭环与冷启动', flush=True)
    finally:
        try:
            if after is not None and test_started:
                page.evaluate('value=>Capacitor.Plugins.LocalData.saveState({value})', json.dumps(after, ensure_ascii=False))
                page.reload(); saved(page)
                assert state(page) == after, '测试业务数据恢复失败'
                browser.close()
                adb('shell', 'am', 'force-stop', PACKAGE)
                browser, page = attach(playwright)
                assert state(page) == after, '冷启动后原业务数据未保留'
                report['checks'].append('原业务数据恢复并经冷启动核对')
            if original_sync is not None:
                if page.is_closed():
                    browser, page = attach(playwright)
                page.evaluate('value=>Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value})', original_sync)
                assert page.evaluate('Capacitor.Plugins.LocalData.getPreference({key:"dav-auto-sync"}).then(r=>r.value)') == original_sync
            if after is not None:
                assert private_fingerprints(private_before) == private_fingerprints(archive()), '恢复后图片或加密凭据发生变化'
                report['businessHashBefore'] = digest(original)
                report['businessHashAfter'] = digest({key: state(page).get(key) for key in original})
                assert report['businessHashBefore'] == report['businessHashAfter'], '升级后旧业务数据摘要不一致'
                report['checks'].append('原业务摘要、图片及加密凭据最终一致')
        finally:
            (OUT / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()
            adb('forward', '--remove', 'tcp:' + PORT)

print('PASS: 真机验收完成，原业务数据与同步偏好已恢复')
