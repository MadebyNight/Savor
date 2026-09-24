"""菜谱切换草稿保护，以及持久化失败后的保存重试。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width': 360, 'height': 780})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:5173'), wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')

    def nav(name):
        page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()

    def edit(index):
        page.locator('.library-recipe').nth(index).click()
        page.locator('.recipe-detail-dialog .detail-more summary').click()
        page.get_by_role('button', name='编辑菜谱', exact=True).click()

    nav('菜谱')
    assert page.locator('.library-recipe').count() >= 2
    second_name = page.locator('.library-recipe').nth(1).locator('strong').inner_text()
    edit(0)
    name_field = page.get_by_placeholder('给这道菜起个名字')
    name_field.fill('未保存的第一道菜')
    page.get_by_role('button', name='返回', exact=True).click()

    edit(1)
    expect(page.get_by_role('dialog', name='放弃当前草稿？')).to_be_visible()
    page.get_by_role('button', name='取消', exact=True).click()
    page.locator('.recipe-detail-dialog [aria-label="关闭弹窗"]').click()
    edit(0)
    expect(name_field).to_have_value('未保存的第一道菜')

    page.get_by_role('button', name='返回', exact=True).click()
    edit(1)
    page.get_by_role('button', name='放弃并编辑', exact=True).click()
    expect(name_field).to_have_value(second_name)

    page.evaluate('''() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'shiguang-v1') throw new Error('test write failure');
        return window.originalSetItem.call(this, key, value);
      };
    }''')
    name_field.fill(second_name + '修订')
    page.get_by_role('button', name='确认保存到菜品库', exact=True).click()
    expect(page.get_by_text('菜谱保存失败，草稿已保留：test write failure')).to_be_visible()
    expect(name_field).to_have_value(second_name + '修订')
    page.evaluate('() => { Storage.prototype.setItem = window.originalSetItem; }')

    page.get_by_role('button', name='确认保存到菜品库', exact=True).click()
    expect(page.locator('.topbar h1')).to_have_text('点单')
    page.reload(wait_until='networkidle')
    nav('菜谱')
    expect(page.locator('.library-recipe').filter(has_text=second_name + '修订')).to_have_count(1)
    assert not errors, errors
    print('PASS: cancel switch retains draft, confirmed switch replaces draft, failed save retains input, retry persists after restart')
    browser.close()
