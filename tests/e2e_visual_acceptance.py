"""V2.1.x 手机前端验收：主次页面、选择器与弹层的窄屏截图。"""
import os
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools/device-logs/frontend-visual-20260927'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('E2E_URL', 'http://127.0.0.1:5173')


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'),
    )
    for width, height in ((320, 640), (360, 800), (390, 844)):
        page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL, wait_until='networkidle')
        page.get_by_role('navigation', name='主导航').wait_for()
        page.wait_for_function('localStorage.getItem("shiguang-v1")')

        def nav(name):
            page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()

        def close_dialog():
            page.get_by_role('button', name='关闭弹窗').last.click()

        def shot(name):
            page.wait_for_function("!document.querySelector('[data-sonner-toast]')", timeout=7000)
            page.wait_for_timeout(350)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, name, '页面横向溢出')
            boxes = page.evaluate('''() => [...document.querySelectorAll('[role="dialog"]')]
                .filter(node => node.getClientRects().length)
                .map(node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })''')
            for box in boxes:
                assert box['x'] >= -1 and box['x'] + box['width'] <= width + 1, (width, name, box)
                assert box['y'] >= -1 and box['y'] + box['height'] <= height + 1, (width, name, box)
            page.screenshot(path=str(OUT / f'{width}-{name}.png'), animations='disabled')

        for name, label in (('点单', 'order'), ('冰箱', 'fridge'), ('菜篮子', 'basket'), ('菜单', 'menu'), ('菜谱', 'recipes')):
            nav(name)
            shot(label)

        nav('冰箱')
        page.get_by_role('button', name='期限筛选').click()
        shot('fridge-filter')
        close_dialog()
        page.get_by_role('button', name='保质期规则').click()
        shot('storage-rules')
        page.get_by_role('button', name='添加食材规则').click()
        shot('storage-rules-item')
        close_dialog()
        shot('storage-rules-discard-confirm')
        page.get_by_role('button', name='放弃修改').click()
        page.get_by_role('button', name='手动添加', exact=True).click()
        shot('stock-add')
        for label, filename in (('食材分类', 'stock-category-picker'), ('保存方式', 'stock-method-picker'),
                                ('入库日期', 'stock-date-picker')):
            page.get_by_role('button', name=label, exact=True).click()
            shot(filename)
            close_dialog()
        page.get_by_text('期限依据', exact=False).click()
        page.get_by_role('button', name='期限来源').click()
        shot('stock-source-picker')
        close_dialog()
        page.get_by_label('食材名称', exact=True).fill('冷藏后需尽快食用的有机鲜牛奶')
        page.get_by_role('button', name='确认放入冰箱').click()
        shot('fridge-populated')
        page.locator('.stock-compact-row').first.click()
        shot('stock-edit')
        page.get_by_role('button', name='删除食材').click()
        shot('stock-delete-confirm')
        close_dialog()
        close_dialog()
        page.get_by_role('button', name='看看能做什么').click()
        shot('fridge-recommend')
        close_dialog()

        nav('菜谱')
        recipe = page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1")).recipes[0]')
        page.get_by_role('button', name='筛选菜谱').click()
        shot('recipe-filters')
        close_dialog()
        page.get_by_role('button', name='导入菜谱', exact=True).click()
        shot('recipe-import')
        page.get_by_role('button', name='手动添加').click()
        shot('recipe-new')
        page.get_by_role('button', name='返回', exact=True).click()
        page.locator('.library-recipe').first.click()
        shot('recipe-detail')
        if page.get_by_role('button', name='查看菜谱大图').count():
            page.get_by_role('button', name='查看菜谱大图').click()
            shot('recipe-photo-preview')
            close_dialog()
        if page.locator('.recipe-timer button').count():
            page.locator('.recipe-timer button').first.click()
            shot('recipe-timer')
        page.locator('.detail-more > summary').click()
        page.get_by_role('button', name='删除菜谱').click()
        shot('recipe-delete-confirm')
        close_dialog()
        page.get_by_role('button', name='编辑菜谱', exact=True).click()
        shot('recipe-edit')
        page.locator('.recipe-nutrition-tools > summary').click()
        shot('recipe-edit-nutrition')
        page.get_by_role('button', name='返回', exact=True).click()

        nav('点单')
        page.get_by_role('button', name='管理分类').click()
        shot('category-manager')
        page.get_by_role('button', name='管理', exact=False).first.click()
        shot('category-edit')
        page.get_by_role('button', name='删除此分类').click()
        shot('category-delete-confirm')
        close_dialog()
        close_dialog()

        nav('菜单')
        page.get_by_role('tab', name='当日菜单').click()
        shot('today')
        page.get_by_role('tab', name='周菜单').click()
        page.locator('.week-picker > summary').click()
        shot('week-picker')
        page.get_by_role('button', name='当前周').click()
        shot('week-date-picker')
        close_dialog()
        page.locator('.week-picker > summary').click()
        page.get_by_role('button', name='安排菜品').click()
        shot('meal-target')
        close_dialog()
        page.locator('.meal-table-row').first.click()
        shot('meal-manager')
        close_dialog()
        page.get_by_role('button', name='一周总览').click()
        shot('week-overview')
        page.get_by_role('button', name='返回单日').click()
        page.get_by_role('button', name='本周菜单营养回顾').click()
        shot('nutrition-review')
        page.get_by_role('button', name='高级计算').click()
        shot('nutrition-advanced')
        close_dialog()
        page.get_by_role('button', name='返回周菜单').click()
        page.get_by_role('button', name='历史', exact=True).click()
        shot('week-history')
        page.get_by_role('button', name='选择存档日期').click()
        shot('history-date-picker')
        close_dialog()
        page.locator('.history-copy > summary').click()
        shot('history-copy')
        page.get_by_role('button', name='复制到目标周').click()
        shot('history-target-picker')
        close_dialog()
        close_dialog()
        page.get_by_role('button', name='清空本周').click()
        shot('week-clear-confirm')
        close_dialog()

        nav('点单')
        page.get_by_role('button', name='设置与备份').click()
        shot('settings-home')
        for label, filename in (('AI 配置', 'settings-ai'), ('备份恢复', 'settings-backup'),
                                ('坚果云同步', 'settings-sync'), ('营养周报提醒', 'settings-reminders'),
                                ('版本更新', 'settings-update')):
            page.get_by_role('navigation', name='设置首页').get_by_role('button', name=label, exact=True).click()
            shot(filename)
            if label == 'AI 配置':
                page.get_by_role('button', name='测试连接').click()
                shot('ai-test-confirm')
                page.get_by_role('button', name='开始测试').click()
                page.get_by_role('dialog', name='连接测试未完成').wait_for()
                shot('ai-test-result')
                page.get_by_role('button', name='知道了').click()
            if label == '备份恢复':
                state = page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')
                page.get_by_label('备份文件').set_input_files({
                    'name': 'visual-check.json', 'mimeType': 'application/json',
                    'buffer': json.dumps(state, ensure_ascii=False).encode('utf-8'),
                })
                page.get_by_role('dialog', name='恢复备份？').wait_for()
                shot('backup-restore-confirm')
                close_dialog()
            if label == '坚果云同步':
                page.route('https://dav.jianguoyun.com/**', lambda route: route.fulfill(
                    status={'OPTIONS': 204, 'MKCOL': 201}.get(route.request.method, 404),
                    headers={'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, MKCOL, OPTIONS',
                             'access-control-allow-headers': 'Authorization, Content-Type'},
                    body='' if route.request.method != 'GET' else '{}'))
                page.get_by_label('账号', exact=True).fill('visual@example.invalid')
                page.get_by_label('应用密码', exact=True).fill('visual-only')
                page.get_by_role('button', name='保存同步配置').click()
                page.get_by_role('button', name='检查并同步').click()
                page.get_by_role('dialog', name='请确认同步方向').wait_for()
                shot('sync-direction')
                page.get_by_role('button', name='暂不处理').click()
            if label == '营养周报提醒':
                page.get_by_role('button', name='每周几').click()
                shot('reminder-weekday-picker')
                close_dialog()
                page.get_by_role('button', name='提醒时间').click()
                shot('reminder-time-picker')
                close_dialog()
            back_to_settings = page.get_by_role('button', name='返回设置', exact=True)
            (back_to_settings if back_to_settings.is_visible() else page.get_by_role('button', name='返回', exact=True)).click()
        page.get_by_role('button', name='返回', exact=True).click()

        page.get_by_role('button', name='添加' + recipe['name'], exact=True).click()
        page.get_by_role('button', name='确认选菜', exact=False).click()
        shot('order-confirm')
        page.get_by_role('dialog', name='我的点单清单').get_by_role('button', name='确认并同步', exact=False).click()
        nav('菜篮子')
        shot('basket-populated')
        page.locator('.basket-name').first.click()
        shot('purchase-edit')
        assert page.get_by_role('region', name='排单来源').is_visible()
        if page.get_by_role('button', name='购买量单位').count():
            page.get_by_role('button', name='购买量单位').click()
            shot('purchase-unit-picker')
            close_dialog()
        close_dialog()
        page.get_by_role('button', name='导出').click()
        shot('basket-export')
        close_dialog()
        page.locator('.shopping-check input[type="checkbox"]').first.check()
        page.locator('.basket-stock-action').click()
        shot('basket-stock-confirm')
        close_dialog()
        nav('菜单')
        page.get_by_role('button', name='待分配 1 道').click()
        shot('today-pending')
        assert page.locator('.today-pending-panel select').count() == 0
        page.locator('.today-pending-row').first.get_by_role('button', name='选择餐次').click()
        shot('today-meal-choices')
        page.get_by_role('group', name='为' + recipe['name'] + '选择餐次').get_by_role('button', name='午餐').click()
        shot('today-arranged')
        page.locator('.today-dish-name').first.click()
        shot('recipe-snapshot')
        close_dialog()
        page.get_by_role('button', name='调整' + recipe['name']).click()
        shot('today-adjust')
        assert page.get_by_role('group', name='调整' + recipe['name'] + '餐次').get_by_role('button', name='午餐').get_attribute('aria-pressed') == 'true'
        close_dialog()
        page.get_by_role('tab', name='周菜单').click()
        page.locator('.meal-table-row').nth(1).click()
        shot('meal-manager-populated')
        page.get_by_role('button', name='查看' + recipe['name'] + '做法').click()
        shot('meal-recipe-snapshot')
        close_dialog()
        close_dialog()
        page.get_by_role('button', name='本周菜单营养回顾').click()
        shot('nutrition-review-populated')
        page.get_by_role('button', name='高级计算').click()
        shot('nutrition-advanced-populated')
        page.get_by_role('button', name='重新计算本地营养').click()
        shot('nutrition-recalculate-confirm')
        close_dialog()
        close_dialog()
        page.get_by_role('button', name='生成下周建议').click()
        shot('nutrition-advice-confirm')
        close_dialog()
        page.get_by_role('button', name='返回周菜单').click()
        page.get_by_role('button', name='历史', exact=True).click()
        shot('week-history-populated')
        close_dialog()

        # 用本地草稿进入两类核对页；不发送图片、文字或密钥到外部服务。
        page.evaluate('''() => {
            localStorage.setItem('pref:ai-draft:recipe-import', JSON.stringify({kind:'recipes', text:'番茄鸡蛋汤', draft:JSON.stringify([{name:'番茄鸡蛋汤',category:'汤品',time:12,weight:300,ingredients:[{name:'番茄',qty:150,unit:'g'}],steps:['煮沸后加入番茄']}])}));
            localStorage.setItem('pref:ai-draft:stock', JSON.stringify({kind:'stock', text:'番茄 100 克', draft:JSON.stringify([{name:'番茄',category:'蔬菜',qty:100,unit:'g'}])}));
        }''')
        page.reload(wait_until='networkidle')
        nav('菜谱')
        page.get_by_role('button', name='导入菜谱', exact=True).click()
        page.get_by_role('button', name='查看待保存草稿', exact=False).click()
        shot('recipe-recognition-review')
        close_dialog()
        page.get_by_role('button', name='返回', exact=True).click()
        nav('冰箱')
        page.locator('input[aria-label="冰箱相册图片"]').set_input_files(str(ROOT / 'public/brand/icon-1024.png'))
        page.get_by_role('dialog', name='识别未完成').wait_for()
        shot('stock-recognition-error')
        page.get_by_role('button', name='返回检查').click()
        shot('stock-recognition-import')
        page.get_by_role('button', name='查看待保存草稿', exact=False).click()
        shot('stock-recognition-review')
        close_dialog()

        assert not errors, (width, errors)
        page.close()
        print(f'PASS: {width}px 主次页面与弹层无横向溢出或脚本异常', flush=True)
    browser.close()
