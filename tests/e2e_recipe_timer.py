"""菜谱详情临时计时器：暂停、继续、结束、重置和关闭后重开。"""
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools' / 'recipe-timer'
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'),
    )
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:5173'), wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.wait_for_function("Array.from(document.querySelectorAll('[role=status]')).some(el => el.textContent.includes('已保存'))")
    page.evaluate('''() => {
      const state = JSON.parse(localStorage.getItem('shiguang-v1'));
      state.recipes[0].time = 0.05;
      state.recipes[1].time = 0;
      localStorage.setItem('shiguang-v1', JSON.stringify(state));
    }''')
    assert page.evaluate("JSON.parse(localStorage.getItem('shiguang-v1')).recipes[0].time") == 0.05
    page.reload(wait_until='networkidle')
    assert page.evaluate("JSON.parse(localStorage.getItem('shiguang-v1')).recipes[0].time") == 0.05
    page.get_by_role('navigation', name='主导航').get_by_role('button', name='菜谱').click()
    page.locator('.library-recipe').first.click()
    detail = page.locator('.recipe-detail-dialog')
    timer = detail.locator('.recipe-timer')
    expect(timer.get_by_role('button', name='计时')).to_be_visible()
    timer.get_by_role('button', name='计时').click()
    expect(timer).to_contain_text('00:03')
    timer.get_by_role('button', name='开始计时').click()
    page.wait_for_timeout(1050)
    timer.get_by_role('button', name='暂停').click()
    paused = timer.locator('output').inner_text()
    timer.get_by_role('button', name='收起').click()
    expect(timer.get_by_role('button', name=paused)).to_be_visible()
    page.wait_for_timeout(1200)
    timer.get_by_role('button', name=paused).click()
    expect(timer.locator('output')).to_have_text(paused)
    timer.get_by_role('button', name='继续').click()
    expect(timer.get_by_role('status')).to_have_text('计时结束', timeout=5000)
    expect(timer.locator('output')).to_have_text('00:00')
    timer.get_by_role('button', name='重置').click()
    expect(timer.locator('output')).to_have_text('00:03')
    timer.get_by_role('button', name='开始计时').click()
    detail.get_by_label('关闭弹窗').click()
    page.locator('.library-recipe').first.click()
    timer.get_by_role('button', name='计时').click()
    expect(detail.locator('.recipe-timer output')).to_have_text('00:03')
    page.screenshot(path=str(OUT / 'recipe-timer-390.png'))
    page.set_viewport_size({'width': 320, 'height': 640})
    assert detail.evaluate('el => el.scrollWidth <= el.clientWidth + 1')
    assert detail.locator('.dialog-page-body').evaluate('el => el.clientHeight > 150')
    assert timer.get_by_role('button', name='开始计时').bounding_box()['height'] >= 44
    page.screenshot(path=str(OUT / 'recipe-timer-320.png'))
    detail.get_by_role('button', name='查看菜谱大图').click()
    preview = page.locator('.image-preview-dialog')
    expect(preview).to_be_visible()
    preview.get_by_label('关闭弹窗').click()
    expect(detail).to_be_visible()
    detail.locator('.dialog-page-footer > button').click()
    expect(page.get_by_text('已加入点单清单')).to_be_visible()
    detail.get_by_label('关闭弹窗').click()
    page.locator('.library-recipe').nth(1).click()
    expect(detail.locator('.recipe-timer')).to_have_count(0)
    assert not errors, errors
    browser.close()

print('PASS recipe timer: pause, resume, finish, reset, reopen, no duration, small screen')
