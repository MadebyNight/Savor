"""应用内选择器：日期边界、取消、返回层级和窄屏回归。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page = browser.new_page(viewport={'width': 320, 'height': 640})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('E2E_URL', 'http://127.0.0.1:5173'), wait_until='networkidle')
    page.get_by_role('navigation', name='主导航').get_by_role('button', name='冰箱', exact=True).click()
    page.get_by_role('button', name='手动添加', exact=True).click()
    page.locator('.stock-dialog').evaluate('async e => {await Promise.all(e.getAnimations().map(a => a.finished))}')
    # 焦点轮廓留在边框内；整行和两列字段保持共同外边界。
    for width in [320, 390]:
        page.set_viewport_size({'width': width, 'height': 800})
        fields = page.locator('.stock-fields > label > input, .stock-fields > label > .picker-trigger')
        boxes = [field.bounding_box() for field in fields.all()]
        left, right = boxes[0]['x'], boxes[0]['x'] + boxes[0]['width']
        for index in [1, 3, 5]:
            assert abs(boxes[index]['x'] - left) < 1, boxes
            assert abs(boxes[index+1]['x'] + boxes[index+1]['width'] - right) < 1, boxes
            assert abs(boxes[index]['y'] - boxes[index+1]['y']) < 1, boxes
            assert abs(boxes[index]['height'] - boxes[index+1]['height']) < 1, boxes
        for field in fields.all():
            before = field.bounding_box()
            page.keyboard.press('Tab')
            field.focus()
            assert field.bounding_box() == before
            assert field.evaluate('e => parseFloat(getComputedStyle(e).outlineOffset)') == -2
        fields.first.focus()
        page.locator('.stock-dialog').evaluate('async e => {await Promise.all(e.getAnimations().map(a => a.finished))}')
        page.screenshot(path=str(ROOT / f'.android-tools/device-logs/stock-borders-{width}.png'))
    page.set_viewport_size({'width': 320, 'height': 640})
    date = page.get_by_role('button', name='入库日期', exact=True)
    original = date.get_attribute('value')
    date.click()
    picker = page.locator('.picker-dialog[data-open]')
    page.get_by_role('button', name='下个月', exact=True).click()
    next_date = page.locator('.calendar-grid button').first.get_attribute('aria-label')
    page.get_by_role('button', name=next_date, exact=True).click()
    page.get_by_role('button', name='取消', exact=True).click()
    expect(picker).to_have_count(0)
    expect(date).to_have_attribute('value', original)
    date.click()
    page.get_by_role('button', name='下个月', exact=True).click()
    page.get_by_role('button', name=next_date, exact=True).click()
    page.get_by_role('button', name='确认选择', exact=True).click()
    expect(date).to_have_attribute('value', next_date)
    expect(page.locator('.picker-dialog')).to_have_count(0)
    date.click()
    page.get_by_role('button', name='上个月', exact=True).click()
    page.get_by_role('button', name=original, exact=True).click()
    assert page.evaluate("window.dispatchEvent(new Event('shiguang:back',{cancelable:true}))") is False
    expect(page.locator('.picker-dialog')).to_have_count(0)
    expect(date).to_have_attribute('value', next_date)
    expect(page.get_by_role('button', name='确认放入冰箱', exact=True)).to_be_visible()
    page.get_by_role('button', name='食材分类', exact=True).click()
    expect(page.locator('.picker-options button')).not_to_have_count(0)
    assert picker.evaluate('e => e.scrollWidth <= e.clientWidth + 1')
    picker.evaluate('async e => {await Promise.all(e.getAnimations().map(a => a.finished))}')
    page.screenshot(path=str(ROOT / '.android-tools/device-logs/pickers-options.png'))
    page.keyboard.press('Escape')
    expect(page.locator('.picker-dialog')).to_have_count(0)
    date.click()
    assert picker.evaluate('e => e.scrollWidth <= e.clientWidth + 1')
    picker.evaluate('async e => {await Promise.all(e.getAnimations().map(a => a.finished))}')
    rect = picker.bounding_box()
    assert rect['x'] >= 15 and rect['y'] >= 23 and rect['y'] + rect['height'] <= 617, rect
    page.screenshot(path=str(ROOT / '.android-tools/device-logs/pickers-calendar.png'))
    expect(page.locator('select, input[type=date], input[type=time], datalist')).to_have_count(0)
    assert not errors, errors
    browser.close()
print('PASS pickers: month boundaries, commit, cancel, back, Escape, categories, narrow layout, no native controls')
