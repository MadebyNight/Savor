"""已备份的测试机上验收计时器，并恢复临时菜谱与同步偏好。"""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ADB = ROOT / '.android-tools/sdk/platform-tools/adb.exe'
SERIAL = os.environ['ANDROID_SERIAL']
PACKAGE = 'com.shiguang.mealplanner'
OUT = (ROOT / '.android-tools/device-logs' / os.environ['ANDROID_TIMER_DIR']).resolve()
assert OUT.is_relative_to((ROOT / '.android-tools/device-logs').resolve())
assert (OUT / 'before.json').is_file() and (OUT / 'private-before.tar').is_file(), '先完成安装前备份'
PORT = '9237'


def adb(*args):
    return subprocess.run([str(ADB), '-s', SERIAL, *args], check=True, capture_output=True, timeout=120).stdout


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def attach(playwright):
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
    pid = adb('shell', 'pidof', PACKAGE).decode().strip()
    adb('forward', 'tcp:' + PORT, 'localabstract:webview_devtools_remote_' + pid)
    for attempt in range(20):
        try:
            browser = playwright.chromium.connect_over_cdp('http://127.0.0.1:' + PORT, no_defaults=True, timeout=3000)
            page = browser.contexts[0].pages[0]
            page.wait_for_selector('.topbar')
            page.set_default_timeout(10000)
            return browser, page
        except Exception:
            if attempt == 19:
                raise
            time.sleep(.5)


def read(page):
    return json.loads(page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r => r.value)'))


def saved(page):
    page.wait_for_function("Array.from(document.querySelectorAll('[role=status]')).some(el => el.textContent.includes('已保存'))")


version = adb('shell', 'dumpsys', 'package', PACKAGE).decode(errors='replace')
assert 'versionCode=8 ' in version and 'versionName=2.0.2' in version
report = {'serial': SERIAL, 'version': '2.0.2', 'checks': [], 'restored': False}
with sync_playwright() as playwright:
    browser, page = attach(playwright)
    saved(page)
    baseline = json.loads((OUT / 'before.json').read_text(encoding='utf-8'))
    original = read(page)
    assert {k: v for k, v in original.items() if k != 'recipeCategories'} == {k: v for k, v in baseline.items() if k != 'recipeCategories'}
    (OUT / 'timer-original.json').write_text(json.dumps(original, ensure_ascii=False), encoding='utf-8')
    original_sync = page.evaluate('Capacitor.Plugins.LocalData.getPreference({key:"dav-auto-sync"}).then(r => r.value)')
    page.evaluate('Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value:"false"})')
    try:
        assert original['recipes'], '测试机没有可复用的菜谱'
        test_state = copy.deepcopy(original)
        recipe = copy.deepcopy(test_state['recipes'][0])
        recipe['id'] = max((item['id'] for item in test_state['recipes'] if isinstance(item.get('id'), int)), default=0) + 1
        recipe['name'] = '真机计时验收临时菜'
        recipe['time'] = 0.05
        test_state['recipes'].append(recipe)
        page.evaluate('value => Capacitor.Plugins.LocalData.saveState({value})', json.dumps(test_state, ensure_ascii=False))
        page.reload()
        saved(page)
        page.get_by_role('navigation', name='主导航').get_by_role('button', name='菜谱').click()
        page.get_by_label('搜索我的菜谱', exact=True).fill(recipe['name'])
        page.locator('.library-recipe').click()
        detail = page.locator('.recipe-detail-dialog')
        timer = detail.locator('.recipe-timer')
        expect(timer.get_by_role('button', name='计时')).to_be_visible()
        timer.get_by_role('button', name='计时').click()
        expect(timer.locator('output')).to_have_text('00:03')
        assert detail.evaluate('el => el.scrollWidth <= el.clientWidth + 1')
        assert timer.get_by_role('button', name='开始计时').bounding_box()['height'] >= 48
        (OUT / 'timer-open.png').write_bytes(adb('exec-out', 'screencap', '-p'))
        timer.get_by_role('button', name='开始计时').click()
        page.wait_for_timeout(1050)
        timer.get_by_role('button', name='暂停').click()
        remaining = timer.locator('output').inner_text()
        timer.get_by_role('button', name='收起').click()
        expect(timer.get_by_role('button', name=remaining)).to_be_visible()
        page.wait_for_timeout(900)
        timer.get_by_role('button', name=remaining).click()
        expect(timer.locator('output')).to_have_text(remaining)
        timer.get_by_role('button', name='继续').click()
        expect(timer.get_by_role('status')).to_have_text('计时结束', timeout=5000)
        expect(timer.locator('output')).to_have_text('00:00')
        timer.get_by_role('button', name='重置').click()
        expect(timer.locator('output')).to_have_text('00:03')
        detail.get_by_label('关闭弹窗').click()
        page.locator('.library-recipe').click()
        timer.get_by_role('button', name='计时').click()
        expect(timer.locator('output')).to_have_text('00:03')
        report['checks'].append('真机底部面板、暂停、收起、继续、结束、重置与重开')
    finally:
        try:
            saved(page)
            page.evaluate('value => Capacitor.Plugins.LocalData.saveState({value})', json.dumps(original, ensure_ascii=False))
            page.reload()
            saved(page)
            assert read(page) == original, '临时菜谱恢复失败'
            browser.close()
            adb('shell', 'am', 'force-stop', PACKAGE)
            browser, page = attach(playwright)
            saved(page)
            assert read(page) == original, '冷启动后数据与原基线不同'
            report['restored'] = True
            report['businessSha256'] = digest(original)
            report['checks'].append('业务数据恢复且冷启动保持')
        finally:
            page.evaluate('value => Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value})', original_sync)
            assert page.evaluate('Capacitor.Plugins.LocalData.getPreference({key:"dav-auto-sync"}).then(r => r.value)') == original_sync
            browser.close()
            adb('forward', '--remove', 'tcp:' + PORT)
            (OUT / 'timer-result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

assert report['restored']
print('PASS: device timer interactions; original business state and sync preference restored')
