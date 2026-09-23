"""连接真机验收当前 APK 的回顾及选择器；不写入业务测试数据。"""
import os
import hashlib
import json
import subprocess
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ADB = ROOT / '.android-tools/sdk/platform-tools/adb.exe'
OUT = ROOT / '.android-tools/device-logs' / os.environ.get('DEVICE_REVIEW_DIR','review-acceptance-20260922')
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
    parsed=json.loads(value)
    if not parsed.get('purchased'): parsed.pop('purchased',None)
    return hashlib.sha256(json.dumps(parsed, sort_keys=True).encode()).hexdigest()


def shot(name):
    page.evaluate('async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))}')
    (OUT / (name + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))


report = {'device': SERIAL, 'fontScale': adb('shell', 'settings', 'get', 'system', 'font_scale').decode().strip(), 'checks': []}
with sync_playwright() as p:
    browser, page = connect(p)
    baseline = state(page)
    if (OUT / 'business-before.sha256').exists():
        assert digest(baseline) == (OUT / 'business-before.sha256').read_text(encoding='utf-8')
    else:
        (OUT / 'business-before.sha256').write_text(digest(baseline), encoding='utf-8')
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

        nav('点单')
        order=page.evaluate("""()=>{const box=document.querySelector('.recipe-section').getBoundingClientRect();const cards=[...document.querySelectorAll('.recipe-card')];return {visible:cards.filter(e=>{const r=e.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom}).length,total:cards.length,heights:cards.slice(0,5).map(e=>e.getBoundingClientRect().height)}}""")
        assert order['visible']>=min(4,order['total']),order
        assert page.locator('.recipe-section').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        for button in page.locator('.recipe-card .counter button').all():
            box=button.bounding_box();assert box['width']>=47.9 and box['height']>=47.9,box
        report['order']=order
        shot('order-density')
        report['checks'].append('点单首屏密度、48px 加减区、卡片无横向溢出')
        heights=[]
        for name in ['点单','菜谱','菜篮子','周菜单','冰箱']:
            nav(name)
            heights.append([page.locator('.topbar').bounding_box()['height'],page.locator('.mobile-bottom-nav').bounding_box()['height']])
            assert page.locator('.topbar').evaluate('e=>e.scrollWidth<=e.clientWidth+1'),name
        assert all(abs(top-heights[0][0])<1 and abs(bottom-heights[0][1])<1 for top,bottom in heights),heights
        report['navigationHeights']=heights
        report['checks'].append('五个主页面顶栏和底部导航高度统一')
        nav('点单')

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
        history,clear=[page.get_by_role('button',name=name,exact=True).bounding_box() for name in ['历史','清空本周']]
        assert abs(history['y']-clear['y'])<1
        report['checks'].append('历史和清空本周同一行')
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
        dialog.locator('.dialog-page-body').evaluate('e=>e.scrollTop=0')
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
        nav('菜篮子')
        if page.locator('.shopping-card').count():
            card=page.locator('.shopping-card').first
            expect(card.get_by_role('checkbox')).to_be_visible()
            report['basketRowHeight']=card.bounding_box()['height']
            assert card.bounding_box()['height']<=70
            shot('basket-checkbox')
        nav('冰箱')
        expect(page.locator('.stock-add-actions button')).to_have_count(3)
        ys=page.locator('.stock-add-actions button').evaluate_all('els=>els.map(e=>e.getBoundingClientRect().y)')
        assert max(ys)-min(ys)<1
        expect(page.get_by_role('button',name='拍照识别',exact=True)).to_have_count(0)
        search_box=page.locator('.fridge-search-row').bounding_box()
        cats_box=page.locator('.stock-categories').bounding_box()
        actions_box=page.locator('.stock-add-actions').bounding_box()
        filter_box=page.get_by_label('期限筛选',exact=True).bounding_box()
        assert cats_box['y']>=search_box['y']+search_box['height']-1
        assert actions_box['y']>=cats_box['y']+cats_box['height']-1
        assert actions_box['height']<=50
        assert filter_box['y']>=search_box['y'] and filter_box['y']+filter_box['height']<=search_box['y']+search_box['height']+1
        if page.locator('.stock-compact-row').count():
            report['firstStockY']=page.locator('.stock-compact-row').first.bounding_box()['y']
            assert report['firstStockY']<=215
        shot('fridge-three-actions')
        report['checks'].append('冰箱三项入口同一行、采购勾选入口')
        stock = page.locator('.stock-compact-row')
        if stock.count():
            stock.first.click()
        else:
            page.get_by_role('button', name='手动添加', exact=True).click()
        fields = page.locator('.stock-fields > label > input, .stock-fields > label > .picker-trigger')
        page.locator('.stock-dialog').evaluate('async e=>{await Promise.all(e.getAnimations().map(a=>a.finished))}')
        boxes = [field.bounding_box() for field in fields.all()]
        for index in [1, 3, 5]:
            assert abs(boxes[index]['x']-boxes[0]['x']) < 1
            assert abs(boxes[index+1]['x']+boxes[index+1]['width']-boxes[0]['x']-boxes[0]['width']) < 1
        shot('stock-alignment')
        fields.first.click()
        page.wait_for_timeout(700)
        keyboard = adb('shell','dumpsys','input_method').decode(errors='replace')
        assert 'mInputShown=true' in keyboard or 'isInputViewShown=true' in keyboard, '软键盘未弹出'
        expect(page.locator('.stock-dialog .dialog-page-footer')).to_be_in_viewport()
        shot('stock-keyboard')
        back()
        expect(page.locator('.stock-dialog')).to_be_visible()
        report['checks'].append('真实软键盘下保存栏可见，返回先收起键盘')
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
        nav('菜谱')
        report['libraryVisible']=page.locator('.library-recipe').evaluate_all("es=>es.filter(e=>e.getBoundingClientRect().bottom<=document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top).length")
        assert report['libraryVisible']>=min(7,page.locator('.library-recipe').count())
        assert page.locator('.library-tools .search').bounding_box()['height']<=45
        expect(page.get_by_role('button',name='新建菜谱',exact=True)).to_have_count(0)
        shot('recipe-library')
        all_count=page.locator('.library-recipe').count()
        click('筛选菜谱')
        click('15 分钟内')
        shot('recipe-filter')
        click('确定')
        expected=sum(1 for recipe in json.loads(baseline)['recipes'] if isinstance(recipe.get('time'),(int,float)) and 0<recipe['time']<=15)
        expect(page.locator('.library-recipe')).to_have_count(expected)
        click('筛选菜谱');click('30 分钟以上');back()
        expect(page.locator('.library-recipe')).to_have_count(expected)
        click('筛选菜谱');click('重置');click('确定')
        expect(page.locator('.library-recipe')).to_have_count(all_count)
        if all_count:
            page.locator('.library-recipe').first.click()
            expect(page.locator('.recipe-detail-dialog .dialog-page-footer')).to_be_in_viewport()
            shot('recipe-detail')
            if page.get_by_role('button',name='查看菜谱大图',exact=True).count():
                click('查看菜谱大图');back()
                expect(page.locator('.recipe-detail-dialog')).to_be_visible()
            back()
        report['checks'].append('菜谱时长筛选、取消与重置、详情固定操作、大图返回')
        click('导入菜谱')
        click('手动添加')
        expect(page.get_by_placeholder('给这道菜起个名字')).to_be_visible()
        expect(page.locator('.editor-save-bar')).to_be_in_viewport()
        shot('recipe-editor')
        back()
        click('导入菜谱')
        expect(page.get_by_label('识别原文',exact=True)).to_be_visible()
        expect(page.locator('.recognition-panel textarea')).to_have_count(1)
        expect(page.get_by_role('button',name='图文识别',exact=True)).to_have_count(0)
        assert page.locator('.recognition-panel').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        before_image=page.locator('.recognition-image img').get_attribute('src') if page.locator('.recognition-image img').count() else None
        before_text=page.get_by_label('识别原文',exact=True).input_value()
        shot('recipe-import')
        for label in ['拍摄','相册选择']:
            click(label)
            time.sleep(1)
            focus=adb('shell','dumpsys','window').decode(errors='replace')
            focused=next(line for line in focus.splitlines() if 'mCurrentFocus=' in line)
            assert PACKAGE not in focused, '未打开系统图片入口'
            for _ in range(5):
                adb('shell','input','keyevent','4')
                time.sleep(.5)
                focus=adb('shell','dumpsys','window').decode(errors='replace')
                focused=next(line for line in focus.splitlines() if 'mCurrentFocus=' in line)
                if PACKAGE in focused: break
            expect(page.locator('.recognition-panel')).to_be_visible()
            expect(page.get_by_label('识别原文',exact=True)).to_have_value(before_text)
            after_image=page.locator('.recognition-image img').get_attribute('src') if page.locator('.recognition-image img').count() else None
            assert after_image==before_image
        report['checks'].append('导入菜谱直接显示相册/拍摄/单输入框，系统入口打开取消保留原草稿')
        back()
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
