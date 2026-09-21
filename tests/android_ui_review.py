"""连接真机验收当前 APK 的回顾及选择器；不写入业务测试数据。"""
import hashlib
import json
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ADB = ROOT / '.android-tools/sdk/platform-tools/adb.exe'
OUT = ROOT / '.android-tools/device-logs/review-acceptance-20260922'
OUT.mkdir(exist_ok=True)
SERIAL = 'ea767f86'
PACKAGE = 'com.shiguang.mealplanner'


def adb(*args):
    return subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, check=True, timeout=120).stdout


def connect(p):
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')
    pid = adb('shell', 'pidof', PACKAGE).decode().strip()
    adb('forward', 'tcp:9224', 'localabstract:webview_devtools_remote_' + pid)
    for attempt in range(20):
        try:
            browser = p.chromium.connect_over_cdp('http://127.0.0.1:9224', no_defaults=True, timeout=3000)
            page = browser.contexts[0].pages[0]
            page.set_default_timeout(15000)
            page.wait_for_selector('.topbar')
            return browser, page
        except Exception:
            if attempt == 19:
                raise
            time.sleep(.5)


def state(page):
    return page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)')


def digest(value):
    return hashlib.sha256(json.dumps(json.loads(value), sort_keys=True).encode()).hexdigest()


def shot(name):
    (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))


report = {'device': SERIAL, 'fontScale': adb('shell', 'settings', 'get', 'system', 'font_scale').decode().strip(), 'checks': []}
with sync_playwright() as p:
    browser, page = connect(p)
    baseline = state(page)
    if (OUT / 'business-before.json').exists():
        assert digest(baseline) == digest((OUT / 'business-before.json').read_text(encoding='utf-8'))
    else:
        (OUT / 'business-before.json').write_text(baseline, encoding='utf-8')
    auto_sync = page.evaluate('Capacitor.Plugins.LocalData.getPreference({key:"dav-auto-sync"}).then(r=>r.value)')
    if (OUT / 'auto-sync-before.json').exists():
        auto_sync = json.loads((OUT / 'auto-sync-before.json').read_text(encoding='utf-8'))
    else:
        (OUT / 'auto-sync-before.json').write_text(json.dumps(auto_sync), encoding='utf-8')
    page.evaluate('Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value:"false"})')
    browser.close()
    try:
        result = adb('install', '-r', str(ROOT / 'android/app/build/outputs/apk/debug/app-debug.apk')).decode()
        assert 'Success' in result
        time.sleep(2)
        browser, page = connect(p)
        assert digest(state(page)) == digest(baseline)
        report['checks'].append('覆盖安装保留业务数据')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def click(name):
            page.get_by_role('button', name=name, exact=True).click()

        def back():
            adb('shell', 'input', 'keyevent', '4')
            page.wait_for_timeout(400)

        def nav(name):
            page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()

        click('设置与备份')
        tabs = page.get_by_role('navigation', name='设置分页')
        boxes = [button.bounding_box() for button in tabs.get_by_role('button').all()]
        assert max(box['y'] for box in boxes) - min(box['y'] for box in boxes) < 1
        # 通过实际屏幕滑动使最后一项进入视野。
        bounds = tabs.bounding_box()
        # 使用 WebView 的触摸事件，坐标保留 WebView 原生视口。
        cdp = browser.contexts[0].new_cdp_session(page)
        y = bounds['y'] + bounds['height'] / 2
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': bounds['x']+bounds['width']-15, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': bounds['x']+20, 'y': y}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        click('营养周报提醒')
        expect(tabs.get_by_role('button', name='营养周报提醒')).to_have_attribute('aria-current', 'page')
        shot('settings-single-row')
        report['checks'].append('设置导航单行、触摸滑动、提醒页切换')
        back()
        nav('周菜单')
        page.locator('.nutrition-review-entry').scroll_into_view_if_needed()
        shot('review-entry')
        click('本周菜单营养回顾')
        dialog = page.locator('.nutrition-dialog').first
        dialog.evaluate('async e=>{await Promise.all(e.getAnimations().map(a=>a.finished))}')
        expect(page.locator('.review-dates button')).to_have_count(7)
        dates = page.locator('.review-dates button').evaluate_all('els=>els.map(e=>e.getAttribute("aria-label"))')
        for date in dates:
            click(date)
            expect(page.locator('.review-day-content')).to_contain_text(date)
        assert dialog.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        expect(page.get_by_text('参考数据与估算限制', exact=True)).to_have_count(0)
        dialog.evaluate('e=>e.scrollTop=0')
        shot('nutrition-review')
        report['checks'].append('目标周七天切换、回顾分层、系统字体无横向溢出')
        click('高级计算')
        expect(page.locator('.nutrition-advanced')).to_be_visible()
        shot('advanced-calculation')
        back()
        expect(page.locator('.nutrition-advanced')).to_have_count(0)
        expect(page.get_by_role('button', name=dates[-1], exact=True)).to_have_attribute('aria-pressed', 'true')
        report['checks'].append('Android 返回键只关闭高级计算，保留日期')
        back()
        expect(page.locator('.nutrition-dialog')).to_have_count(0)
        nav('冰箱')
        stock = page.locator('.stock-compact-row')
        if stock.count():
            stock.first.click()
        else:
            page.locator('.topbar').get_by_role('button', name='添加食材', exact=True).click()
        fields = page.locator('.stock-fields > label > input, .stock-fields > label > .picker-trigger')
        page.locator('.stock-dialog').evaluate('async e=>{await Promise.all(e.getAnimations().map(a=>a.finished))}')
        boxes = [field.bounding_box() for field in fields.all()]
        for index in [1, 3, 5]:
            assert abs(boxes[index]['x']-boxes[0]['x']) < 1
            assert abs(boxes[index+1]['x']+boxes[index+1]['width']-boxes[0]['x']-boxes[0]['width']) < 1
        shot('stock-alignment')
        click('食材分类')
        expect(page.locator('.picker-dialog')).to_be_visible()
        shot('stock-category')
        back()
        expect(page.locator('.picker-dialog')).to_have_count(0)
        click('入库日期')
        expect(page.locator('.calendar-grid')).to_be_visible()
        shot('stock-date')
        back()
        expect(page.locator('.picker-dialog')).to_have_count(0)
        back()
        expect(page.locator('.stock-dialog')).to_have_count(0)
        assert digest(state(page)) == digest(baseline), '业务数据变化'
        assert not errors, 'WebView 页面异常'
        report['checks'].append('食材边界对齐、自定义分类和日期、原生返回、业务数据未改动')
        report['passed'] = True
    except Exception as error:
        report['failure'] = str(error)
        raise
    finally:
        # 恢复启动同步偏好；不再次冷启动触发外部同步。
        try:
            if page.is_closed():
                browser, page = connect(p)
            page.evaluate('value=>Capacitor.Plugins.LocalData.setPreference({key:"dav-auto-sync",value})', auto_sync)
            report['autoSyncRestored'] = True
        finally:
            (OUT / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()
            adb('forward', '--remove', 'tcp:9224')
print(json.dumps(report, ensure_ascii=False))
