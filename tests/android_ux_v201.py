"""V2.0.1 真机只读界面验收；不调用 AI、同步或修改业务数据。"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ADB = ROOT / '.android-tools/sdk/platform-tools/adb.exe'
SERIAL = os.environ['ANDROID_SERIAL']
PACKAGE = 'com.shiguang.mealplanner'
PORT = '9237'
OUT = ROOT / '.android-tools/device-logs' / os.environ['ANDROID_UX_DIR']
assert OUT.resolve().is_relative_to((ROOT / '.android-tools/device-logs').resolve())
assert not OUT.exists(), 'Use a fresh evidence directory'
OUT.mkdir()


def adb(*args):
    return subprocess.run([str(ADB), '-s', SERIAL, *args], check=True, capture_output=True, timeout=90).stdout


def shot(name):
    (OUT / name).write_bytes(adb('exec-out', 'screencap', '-p'))


def back():
    adb('shell', 'input', 'keyevent', '4')


def state(page):
    return json.loads(page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r => r.value)'))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


adb('forward', 'tcp:' + PORT, 'localabstract:webview_devtools_remote_' + adb('shell', 'pidof', PACKAGE).decode().strip())
browser = None
try:
    with sync_playwright() as playwright:
        for attempt in range(20):
            try:
                browser = playwright.chromium.connect_over_cdp('http://127.0.0.1:' + PORT, no_defaults=True, timeout=3000)
                page = browser.contexts[0].pages[0]
                page.wait_for_selector('.topbar')
                break
            except Exception:
                if attempt == 19:
                    raise
                time.sleep(.5)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        before = state(page)
        expected_hash = os.environ.get('ANDROID_EXPECTED_HASH')
        if expected_hash:
            assert digest(before) == expected_hash, 'Business state differs from prior UI baseline'
        checked = []

        def nav(name):
            page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()

        nav('点单')
        page.get_by_role('button', name='设置与备份').click()
        for name in ('AI 配置', '备份恢复', '坚果云同步', '营养周报提醒'):
            expect(page.get_by_role('navigation', name='设置首页').get_by_role('button', name=name)).to_be_visible()
        shot('settings-home.png')
        page.get_by_role('navigation', name='设置首页').get_by_role('button', name='AI 配置').click()
        expect(page.get_by_role('region', name='AI 配置')).to_be_visible()
        back()
        expect(page.get_by_role('navigation', name='设置首页')).to_be_visible()
        back()
        expect(page.get_by_role('navigation', name='主导航')).to_be_visible()
        checked.append('settings-and-native-back')

        nav('周菜单')
        summary = page.get_by_role('region', name='当日预计营养')
        review = page.get_by_role('button', name='本周菜单营养回顾')
        assert summary.bounding_box()['y'] < review.bounding_box()['y']
        shot('week-day.png')
        page.get_by_role('button', name='安排菜品').click()
        target = page.get_by_role('dialog', name='安排哪一餐')
        expect(target).to_be_visible()
        target.get_by_role('button', name='午餐', exact=True).click()
        expect(page.get_by_role('dialog', name='午餐 · 管理菜品')).to_be_visible()
        back()
        expect(page.get_by_role('dialog', name='午餐 · 管理菜品')).to_have_count(0)
        checked.append('meal-target-and-native-back')

        page.locator('.week-picker > summary').click()
        current_week = page.get_by_role('button', name='当前周', exact=True).get_attribute('value')
        page.get_by_role('button', name='当前周', exact=True).click()
        picker = page.get_by_role('dialog', name='当前周')
        picker.get_by_role('textbox', name='年份').fill('2024')
        picker.get_by_role('textbox', name='年份').press('Tab')
        picker.get_by_role('textbox', name='月份').fill('2')
        picker.get_by_role('textbox', name='月份').press('Tab')
        expect(picker.get_by_role('button', name='2024-02-29')).to_be_visible()
        shot('date-picker.png')
        picker.get_by_role('button', name='2024-02-29').click()
        expect(picker.get_by_role('button', name='2024-02-29')).to_have_attribute('aria-pressed', 'true')
        shot('date-picked.png')
        picker.get_by_role('button', name='取消').click()
        assert page.get_by_role('button', name='当前周', exact=True).get_attribute('value') == current_week
        checked.append('year-month-jump-cancel')

        review.click()
        expect(page.get_by_role('heading', name='菜单营养回顾')).to_be_visible()
        shot('nutrition-review.png')
        back()
        expect(page.get_by_role('heading', name='菜单营养回顾')).to_have_count(0)
        checked.append('nutrition-and-native-back')

        page.get_by_role('button', name='历史', exact=True).click()
        history = page.get_by_role('dialog', name='膳食日历')
        expect(history).to_be_visible()
        assert history.evaluate('element => element.scrollWidth <= element.clientWidth + 1')
        shot('week-history.png')
        plans = {**before.get('archives', {}), **before.get('weeks', {})}
        arranged = [(week, slot) for week, plan in plans.items() for slot, items in plan.items() if items]
        if arranged:
            snapshot_week, snapshot_slot = sorted(arranged)[-1]
            history.get_by_role('button', name='已有菜单周').click()
            page.get_by_role('dialog', name='选择已有菜单周').get_by_role('button', name=f'{snapshot_week} 起').click()
            history.locator('.history-dates button').nth(int(snapshot_slot.split('-')[0])).click()
            snapshot = history.get_by_role('button', name=re.compile('查看.*做法')).first
            snapshot.click()
            detail = page.locator('.meal-snapshot-dialog')
            expect(detail).to_contain_text('所需食材')
            expect(detail).to_contain_text('制作步骤')
            shot('week-snapshot.png')
            back()
            expect(history).to_be_visible()
            checked.append('history-snapshot-and-native-back')
        back()
        expect(history).to_have_count(0)

        nav('菜篮子')
        shot('basket.png')
        nav('冰箱')
        shot('fridge.png')
        nav('菜谱')
        shot('recipes.png')
        search = page.get_by_label('搜索我的菜谱', exact=True)
        search.click()
        time.sleep(.6)
        shot('recipes-keyboard.png')
        back()
        nav('点单')
        checked.append('basket-fridge-recipes-keyboard')

        after = state(page)
        assert before == after, 'Business state changed during read-only UX test'
        assert not errors, errors
        if expected_hash:
            checked.append('prior-ui-business-baseline-preserved')
        (OUT / 'result.json').write_text(json.dumps({
            'version': '2.0.1', 'serial': SERIAL, 'checks': checked,
            'businessHashBefore': digest(before), 'businessHashAfter': digest(after),
            'businessStateUnchanged': True, 'pageErrors': 0,
        }, ensure_ascii=False, indent=2), encoding='utf-8')
        print('PASS: V2.0.1 device UX, native back, keyboard screenshot, unchanged business state')
finally:
    adb('forward', '--remove', 'tcp:' + PORT)
