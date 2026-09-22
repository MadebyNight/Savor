"""V1.1 真机升级与核心验收。升级备份保留于忽略目录，不读取或输出明文凭据。

python tests/android_upgrade.py prepare   # 备份、提取当前 APK、记录业务基线
python tests/android_upgrade.py verify    # 覆盖安装后验证数据一致并验收，最终恢复基线
"""
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools' / os.environ.get('ANDROID_ACCEPTANCE_DIR', 'v1.1-acceptance')
ADB = ROOT / '.android-tools/sdk/platform-tools/adb.exe'
SERIAL = os.environ.get('ANDROID_SERIAL', 'ea767f86')
PACKAGE = 'com.shiguang.mealplanner'
PORT = '9223'
MODE = sys.argv[1] if len(sys.argv) > 1 else 'verify'
OUT.mkdir(parents=True, exist_ok=True)

def adb(*args, binary=False):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], check=True, capture_output=True, timeout=90)
    return result.stdout if binary else result.stdout.decode('utf-8', errors='replace').strip()

def digest(value):
    return hashlib.sha256(json.dumps(json.loads(value),sort_keys=True,ensure_ascii=False).encode()).hexdigest()

def attach(playwright):
    adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')
    pid = adb('shell','pidof',PACKAGE)
    if not pid:
        raise RuntimeError('App process unavailable')
    adb('forward','tcp:'+PORT,'localabstract:webview_devtools_remote_'+pid)
    for attempt in range(20):
        try:
            browser = playwright.chromium.connect_over_cdp('http://127.0.0.1:'+PORT, timeout=3000, no_defaults=True)
            break
        except Exception:
            if attempt == 19:
                raise
            time.sleep(.5)
    page = browser.contexts[0].pages[0]
    page.set_default_timeout(15000)
    page.wait_for_function("!!document.querySelector('.topbar') && [...document.querySelectorAll('[role=\"status\"]')].some(e=>e.textContent==='已保存')")
    return browser,page

def read(page):
    return page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)')

if MODE == 'prepare':
    if (OUT / 'before.json').exists():
        raise RuntimeError('Upgrade baseline already exists; refusing to overwrite')
    adb('shell','am','force-stop',PACKAGE)
    available = adb('shell','run-as',PACKAGE,'ls').split()
    folders = [name for name in ['databases','files','shared_prefs'] if name in available]
    if not folders:
        raise RuntimeError('No private app data found')
    (OUT / 'upgrade-backup.tar').write_bytes(adb('exec-out','run-as',PACKAGE,'tar','-cf','-',*folders,binary=True))
    apk = adb('shell','pm','path',PACKAGE).splitlines()
    if len(apk) != 1 or not apk[0].startswith('package:/data/app/'):
        raise RuntimeError('Unexpected installed APK path')
    adb('pull',apk[0].removeprefix('package:'),str(OUT / 'installed-before.apk'))
    with sync_playwright() as p:
        browser,page = attach(p)
        original = read(page)
        if not original:
            raise RuntimeError('Original state is missing')
        (OUT / 'before.json').write_text(original,encoding='utf-8')
        (OUT / 'before.sha256').write_text(digest(original),encoding='ascii')
        browser.close()
    adb('forward','--remove','tcp:'+PORT)
    print('PASS: private app backup, installed APK and business baseline saved; no credentials printed')
    sys.exit(0)

if MODE != 'verify':
    raise RuntimeError('Expected prepare or verify')
original = (OUT / 'before.json').read_text(encoding='utf-8')
report = {'device':SERIAL,'checks':[],'restored':False}
with sync_playwright() as p:
    browser,page = attach(p)
    # 必须先核对升级数据，再允许测试写入。
    if digest(read(page)) != digest(original):
        browser.close()
        raise RuntimeError('Upgrade state differs; no test mutation performed')
    report['checks'].append('升级后业务数据与本轮安装前基线一致')
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:(errors.append('Unexpected native dialog: '+d.type),d.dismiss()))
    def nav(name):
        page.get_by_role('navigation',name='主导航').get_by_role('button',name=name,exact=True).click()
    def click(name):
        page.get_by_role('button',name=name,exact=True).click()
    def wait_state(expression):
        page.wait_for_function('async () => { const s=JSON.parse((await Capacitor.Plugins.LocalData.loadState()).value); return '+expression+'; }')
    def screenshot(name):
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.screenshot(path=str(OUT / name))
    try:
        screenshot('01-installed-home.png')
        # 仅在测试副本中清空选菜和草稿，结束时恢复全部原始业务状态。
        test_state=json.loads(original)
        test_state['qty']={}
        test_state['recipeDraft']={'id':0,'name':'','category':'素菜','time':15,'weight':300,'ingredients':[{'name':'','qty':100,'unit':'g','category':'蔬菜'}],'steps':['']}
        page.evaluate('value => Capacitor.Plugins.LocalData.saveState({value})',json.dumps(test_state,ensure_ascii=False))
        page.reload();page.wait_for_function("!!document.querySelector('.topbar') && [...document.querySelectorAll('[role=\"status\"]')].some(e=>e.textContent==='已保存')")
        nav('菜谱');click('新建菜谱')
        page.get_by_placeholder('给这道菜起个名字').fill('V1.1验收临时菜')
        page.get_by_label('食材名称',exact=True).fill('V1.1验收食材')
        page.get_by_label('数量',exact=True).fill('100')
        page.get_by_label('步骤1',exact=True).fill('洗净煮熟。')
        click('确认保存到菜品库')
        wait_state('s.recipes.some(r=>r.name==="V1.1验收临时菜")')
        report['checks'].append('真机 UI 新建菜谱写入 SQLite')
        page.get_by_label('搜索菜品',exact=True).fill('V1.1验收食材')
        expect(page.locator('.recipe-card')).to_have_count(1)
        click('添加V1.1验收临时菜');click('添加V1.1验收临时菜')
        page.get_by_role('button',name='确认我的菜单',exact=False).click()
        page.get_by_role('dialog').get_by_role('button',name='确认并同步',exact=False).click()
        wait_state('s.confirmedRecipes.some(r=>r.name==="V1.1验收临时菜" && s.confirmed[r.id]===2)')
        report['checks'].append('搜索食材、选菜两份、确认采购快照')
        nav('冰箱');page.get_by_role('button',name='手动添加',exact=True).click()
        page.get_by_role('dialog').get_by_label('食材名称',exact=True).fill('V1.1验收食材')
        page.get_by_role('dialog').get_by_label('数量',exact=True).fill('30')
        page.wait_for_function("""() => {
            const r=document.querySelector('.app-dialog').getBoundingClientRect();
            return r.left>=-1 && r.top>=-1 && r.right<=innerWidth+1 && r.bottom<=innerHeight+1;
        }""")
        page.screenshot(path=str(OUT/'02-fridge-dialog.png'))
        click('确认放入冰箱')
        report['checks'].append('键盘弹出时冰箱弹窗在视口内，滚动后可点击确认')
        wait_state('s.fridge.some(i=>i.name==="V1.1验收食材" && i.qty===30)')
        nav('菜篮子')
        expect(page.locator('.stock-card').filter(has=page.get_by_role('heading',name='V1.1验收食材',exact=True))).to_contain_text('170')
        screenshot('02-purchase.png')
        report['checks'].append('冰箱入库 30g，200g 采购需求抵扣为 170g')
        nav('周菜单');page.locator('.week-dates button').first.click()
        click('安排周1早餐')
        page.get_by_role('dialog').get_by_role('button',name='V1.1验收临时菜',exact=True).click()
        page.get_by_label('V1.1验收临时菜餐次份数',exact=True).fill('3')
        wait_state('Object.values(s.weeks).some(w=>w["0-早"]?.some(r=>r.name==="V1.1验收临时菜" && r.servings===3))')
        click('一周总览');expect(page.get_by_label('V1.1验收临时菜餐次份数',exact=True)).to_have_value('3');click('返回单日')
        screenshot('03-week.png')
        report['checks'].append('按日排餐、三份餐次、一周总览')
        browser.close();adb('shell','am','force-stop',PACKAGE)
        browser,page=attach(p)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:(errors.append('Unexpected native dialog: '+d.type),d.dismiss()))
        wait_state('s.fridge.some(i=>i.name==="V1.1验收食材") && Object.values(s.weeks).some(w=>w["0-早"]?.some(r=>r.name==="V1.1验收临时菜" && r.servings===3))')
        report['checks'].append('force-stop 后重启，库存与周菜单仍在')
        nav('菜谱');page.get_by_label('搜索我的菜谱',exact=True).fill('V1.1验收临时菜')
        page.locator('.library-recipe').click();click('编辑菜谱')
        expect(page.get_by_placeholder('给这道菜起个名字')).to_have_value('V1.1验收临时菜')
        page.get_by_placeholder('给这道菜起个名字').fill('V1.1验收修改菜')
        click('确认保存到菜品库')
        wait_state('s.recipes.some(r=>r.name==="V1.1验收修改菜")')
        # 只删除临时菜谱，使用应用内确认，取消不得修改业务数据。
        page.get_by_role('button',name='V1.1验收修改菜',exact=True).click()
        click('删除菜谱')
        confirmation=page.get_by_role('dialog',name='删除这道菜谱？',exact=True)
        confirmation.get_by_role('button',name='取消',exact=True).click()
        wait_state('s.recipes.some(r=>r.name==="V1.1验收修改菜")')
        click('删除菜谱')
        expect(confirmation).to_be_visible()
        expect(confirmation.get_by_role('button',name='取消',exact=True)).to_be_focused()
        page.screenshot(path=str(OUT/'05-delete-confirm.png'))
        confirmation.get_by_role('button',name='确认删除',exact=True).click()
        wait_state('!s.recipes.some(r=>r.name==="V1.1验收修改菜")')
        nav('周菜单');page.locator('.week-dates button').first.click()
        expect(page.get_by_label('V1.1验收临时菜餐次份数',exact=True)).to_have_value('3')
        report['checks'].append('菜谱编辑/删除不破坏已有餐次快照')
        nav('点单')
        page.get_by_role('button',name='设置与备份').click()
        expect(page.get_by_label('接口地址',exact=True)).to_be_visible()
        click('返回')
        assert not errors,errors
    except Exception as error:
        report['error']=str(error)
        page.screenshot(path=str(OUT/'failure.png'))
        raise
    finally:
        # React 自动保存先完成，之后写回原始业务快照并重载，避免测试数据残留。
        try:
            page.wait_for_function("[...document.querySelectorAll('[role=\"status\"]')].some(e=>e.textContent==='已保存')")
            page.evaluate('value => Capacitor.Plugins.LocalData.saveState({value})',original)
            page.reload()
            page.wait_for_function("!!document.querySelector('.topbar') && [...document.querySelectorAll('[role=\"status\"]')].some(e=>e.textContent==='已保存')")
            report['restored']=digest(read(page))==digest(original)
            if not report['restored']:
                raise RuntimeError('Original business state restoration failed')
            screenshot('04-restored-home.png')
        finally:
            (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            browser.close()
            adb('forward','--remove','tcp:'+PORT)
print(json.dumps(report,ensure_ascii=False))
