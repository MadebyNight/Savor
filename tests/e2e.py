"""Run after npm run dev; browser downloads/output remain in .android-tools."""
import os, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
os.environ['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT/'.android-tools/playwright')
os.environ['TEMP']=os.environ['TMP']=str(ROOT/'.android-tools/e2e')
from playwright.sync_api import sync_playwright, expect
OUT=ROOT/'.android-tools/e2e'; OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
 page=browser.new_page(viewport={'width':1280,'height':900},accept_downloads=True)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda dialog:dialog.accept())
 def nav(name): page.get_by_role('button',name=name,exact=False).first.click()
 def state(): return page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')
 def wait_state(expr): page.wait_for_function('s => '+expr,arg=None)
 page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'));page.wait_for_load_state('networkidle')
 expect(page.get_by_text('已保存',exact=True)).to_be_visible();assert '热量' not in page.locator('body').inner_text()
 nav('上传菜谱');page.get_by_role('button',name='新建菜谱',exact=True).click();page.get_by_placeholder('给这道菜起个名字').fill('E2E番茄菜');page.get_by_label('食材名称',exact=True).fill('测试番茄');page.get_by_label('数量',exact=True).fill('100');page.get_by_label('步骤1',exact=True).fill('洗净并炒熟');nav('确认保存到菜品库')
 page.get_by_role('button',name='E2E番茄菜',exact=True).last.click();nav('编辑菜谱');page.get_by_placeholder('给这道菜起个名字').fill('E2E番茄菜修改');nav('确认保存到菜品库')
 page.get_by_role('button',name='添加E2E番茄菜修改',exact=True).click();page.get_by_role('button',name='添加E2E番茄菜修改',exact=True).click();nav('确认我的菜单');page.get_by_role('button',name='确认并同步',exact=False).click()
 page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).confirmedRecipes.some(r=>r.name==="E2E番茄菜修改")')
 nav('我的冰箱');nav('添加食材');page.get_by_role('dialog').get_by_label('食材名称',exact=True).fill('测试番茄');page.get_by_role('dialog').get_by_label('数量',exact=True).fill('30');nav('确认放入冰箱')
 nav('菜篮子');expect(page.get_by_text('测试番茄',exact=True)).to_be_visible();assert '170' in page.locator('body').inner_text()
 nav('周菜单');page.get_by_role('button',name='E2E番茄菜修改',exact=True).last.click();page.get_by_role('button',name='安排周1早餐',exact=True).click();page.get_by_label('E2E番茄菜修改餐次份数').fill('3')
 nav('膳食日历');page.get_by_role('dialog').get_by_role('button').filter(has_text='2026').first.click();page.get_by_label('复制到目标周').fill('2026-10-05');nav('复制菜单')
 expect(page.get_by_label('E2E番茄菜修改餐次份数')).to_have_value('3')
 nav('点单选菜');page.get_by_role('button',name='E2E番茄菜修改',exact=True).last.click();nav('删除菜谱');nav('周菜单');expect(page.get_by_label('E2E番茄菜修改餐次份数')).to_have_value('3')
 page.reload();page.wait_for_load_state('networkidle');nav('周菜单');page.get_by_label('当前周').fill('2026-10-05');expect(page.get_by_label('E2E番茄菜修改餐次份数')).to_have_value('3')
 nav('设置与备份');expect(page.get_by_text('设置与数据',exact=True)).to_be_visible()
 page.get_by_role('navigation',name='设置分页').get_by_role('button',name='备份恢复',exact=True).click()
 with page.expect_download() as download: nav('导出完整备份')
 file=Path(download.value.path());backup=json.loads(file.read_text('utf-8'));assert backup['state']['weeks']['2026-10-05']['0-早'][0]['servings']==3
 page.get_by_label('导入备份',exact=True).set_input_files(file);expect(page.get_by_text('备份已恢复',exact=True)).to_be_visible()
 assert not errors, errors
 page.screenshot(path=str(OUT/'completed.png'),full_page=True)
 print('PASS: recipe create/edit/delete; purchase servings and stock deduction; week copy/snapshot; reload; backup export/import; settings; no calories')
 browser.close()
