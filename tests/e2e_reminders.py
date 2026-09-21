import os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
 page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('E2E_URL','http://127.0.0.1:5173'),wait_until='domcontentloaded');page.wait_for_function('localStorage.getItem("shiguang-v1")')
 target=page.evaluate("""async()=>{const {reminderTimes}=await import('/src/reminders.js');const settings={inApp:true,system:false,weekday:7,time:'20:00'};localStorage.setItem('pref:weekly-reminders',JSON.stringify({settings,enabledSince:0}));window.dispatchEvent(new Event('shiguang:reminders'));return reminderTimes(settings).week;}""")
 expect(page.locator('.reminder-banner')).to_contain_text(target)
 page.get_by_role('button',name='查看营养回顾',exact=True).click();expect(page.get_by_role('dialog')).to_contain_text(target);expect(page.locator('.reminder-banner')).to_have_count(0)
 page.get_by_role('button',name='关闭弹窗',exact=True).click();page.reload(wait_until='domcontentloaded');page.get_by_role('navigation',name='主导航').wait_for();expect(page.locator('.reminder-banner')).to_have_count(0)
 page.get_by_role('button',name='设置与备份',exact=True).click();page.get_by_role('button',name='营养周报提醒',exact=True).click();expect(page.get_by_label('系统通知',exact=True)).to_be_disabled()
 page.get_by_label('应用内提醒',exact=True).uncheck();page.get_by_label('每周几',exact=True).select_option('3');page.get_by_label('提醒时间',exact=True).fill('19:25');page.get_by_role('button',name='保存提醒设置',exact=True).click();expect(page.get_by_text('提醒设置已保存',exact=True)).to_be_visible()
 settings=page.evaluate("JSON.parse(localStorage.getItem('pref:weekly-reminders')).settings");assert settings=={'inApp':False,'system':False,'weekday':3,'time':'19:25'},settings
 assert not errors,errors;b.close()
print('PASS reminders: due banner, original target, review dedup, restart, shared settings, no channel fallback')
