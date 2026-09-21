"""系统返回的前端协议回归；原生事件/软键盘/手势仍需设备验收。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(
        ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:4173'))
    page.wait_for_load_state('networkidle')

    def click(name):
        page.get_by_role('button', name=name, exact=True).click()

    def nav(name):
        page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()

    def back(handled=True):
        result = page.evaluate("window.dispatchEvent(new Event('shiguang:back', {cancelable:true}))")
        assert result is (not handled), f'返回事件消费状态不符: {result}'

    def no_dialog():
        expect(page.get_by_role('dialog')).to_have_count(0)

    def state():
        return page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')

    # 五个一级页面均不截留返回；设置关闭后回到来源页面。
    for name in ['点单', '冰箱', '菜篮子', '周菜单', '菜谱']:
        nav(name)
        back(False)
    nav('点单')
    click('设置与备份')
    back()
    expect(page.get_by_role('heading', name='点单', exact=True)).to_be_visible()
    back(False)

    # 新建/编辑返回保留草稿，反复打开关闭不残留监听器。
    nav('菜谱')
    click('新建菜谱')
    page.get_by_placeholder('给这道菜起个名字').fill('系统返回草稿')
    for _ in range(3):
        back()
        expect(page.get_by_placeholder('给这道菜起个名字')).not_to_be_visible()
        back(False)
        click('继续草稿')
        expect(page.get_by_placeholder('给这道菜起个名字')).to_have_value('系统返回草稿')
    # 编辑中的导入弹窗 -> 编辑页 -> 菜谱库。
    click('上传')
    back()
    no_dialog()
    expect(page.get_by_placeholder('给这道菜起个名字')).to_have_value('系统返回草稿')
    back()
    back(False)
    # 页面内关闭按钮和系统返回混用不能留下旧层级。
    click('继续草稿')
    click('返回')
    back(False)

    # 菜谱详情上叠加危险确认：返回只取消确认，不删除菜谱。
    nav('点单')
    click('番茄炒鸡蛋')
    click('删除菜谱')
    before = state()
    back()
    expect(page.get_by_role('dialog', name='删除这道菜谱？', exact=True)).not_to_be_visible()
    expect(page.get_by_role('button', name='删除菜谱', exact=True)).to_be_visible()
    assert state() == before
    back()
    no_dialog()
    back(False)

    # 库存弹窗及从弹窗转入设置的返回。
    nav('冰箱')
    page.locator('.topbar').get_by_role('button', name='添加食材', exact=True).click()
    back()
    no_dialog()
    with page.expect_file_chooser(): click('拍照识别')
    back()
    expect(page.get_by_role('heading', name='冰箱', exact=True)).to_be_visible()
    back(False)

    # 周总览中的选菜弹窗 -> 总览 -> 单日；历史弹窗关闭。
    nav('周菜单')
    click('一周总览')
    page.get_by_role('button', name='安排周1早餐', exact=True).click()
    back()
    no_dialog()
    expect(page.get_by_role('button', name='返回单日', exact=True)).to_be_visible()
    back()
    expect(page.get_by_role('button', name='一周总览', exact=True)).to_be_visible()
    back(False)
    click('历史')
    back()
    no_dialog()
    # 两次连续返回也必须按层级消费；卸载总览后不应有幽灵监听器。
    click('一周总览')
    click('历史')
    results = page.evaluate("[0,1,2].map(() => window.dispatchEvent(new Event('shiguang:back', {cancelable:true})))")
    assert results == [False, False, True], results
    click('一周总览')
    nav('冰箱')
    back(False)

    # 识别内确认应取消请求并保留任务，第二次返回才回到菜谱。
    nav('菜谱');click('导入菜谱');click('粘贴正文识别')
    page.get_by_label('识别原文', exact=True).fill('番茄炒鸡蛋')
    click('确认发送并识别')
    back()
    no_dialog()
    expect(page.get_by_label('识别原文', exact=True)).to_have_value('番茄炒鸡蛋')
    back()
    back(False)
    assert not errors, errors
    browser.close()
    print('PASS: root fallback, settings, draft, nested cancel, stock, week overview/picker, repeated close')
