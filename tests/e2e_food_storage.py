import os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
 page=b.new_page(viewport={'width':360,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'),wait_until='domcontentloaded')
 def click(name):page.get_by_role('button',name=name,exact=True).click()
 def fridge():page.get_by_role('navigation',name='主导航').get_by_role('button',name='冰箱',exact=True).click()
 fridge();page.get_by_role('button',name='手动添加',exact=True).click()
 page.get_by_label('食材名称',exact=True).fill('鸡胸肉');page.get_by_label('保存方式',exact=True).click();page.locator('.picker-options').get_by_role('button',name='冷藏（≤4°C）',exact=True).click()
 expect(page.get_by_label('保存天数',exact=True)).to_have_value('1')
 page.get_by_label('保存天数',exact=True).fill('5')
 page.get_by_label('保存方式',exact=True).click();page.locator('.picker-options').get_by_role('button',name='冷冻（≤−18°C）',exact=True).click();click('取消')
 expect(page.get_by_label('保存方式',exact=True)).to_have_attribute('value','chilled');expect(page.get_by_label('保存天数',exact=True)).to_have_value('5')
 page.get_by_label('保存方式',exact=True).click();page.locator('.picker-options').get_by_role('button',name='冷冻（≤−18°C）',exact=True).click();click('确认重新估算')
 expect(page.get_by_label('保存天数',exact=True)).to_have_value('0')
 click('确认放入冰箱');expect(page.locator('.stock-compact-row')).to_contain_text('保存期待补充')
 page.reload(wait_until='domcontentloaded');fridge();page.locator('.stock-compact-row').click()
 expect(page.get_by_label('保存方式',exact=True)).to_have_attribute('value','frozen')
 page.get_by_label('保存天数',exact=True).fill('10');click('保存食材修改')
 page.get_by_label('期限筛选',exact=True).click();page.locator('.picker-options').get_by_role('button',name='保存期待补充',exact=True).click();expect(page.locator('.stock-compact-row')).to_have_count(0)
 page.get_by_label('期限筛选',exact=True).click();page.locator('.picker-options').get_by_role('button',name='正常期限',exact=True).click();expect(page.locator('.stock-compact-row')).to_have_count(1)
 assert not errors,errors
 b.close()
print('PASS storage: reference, manual precedence, cancel/recalculate, unknown, restart, filter')
