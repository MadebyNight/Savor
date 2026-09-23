"""隔离测试规则维护、录入优先级、持久化与旧库存保护。"""
from pathlib import Path
import os,json,base64
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4175'),wait_until='networkidle')
    page.wait_for_function('localStorage.getItem("shiguang-v1")')
    page.evaluate('''()=>{const s=JSON.parse(localStorage.getItem('shiguang-v1'));s.fridge=[{name:'旧鸡蛋',category:'肉类',qty:2,unit:'个',days:19}];localStorage.setItem('shiguang-v1',JSON.stringify(s));}''')
    page.reload(wait_until='networkidle')
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    def nav(name):page.get_by_role('navigation',name='主导航').get_by_role('button',name=name,exact=True).click()
    def state():return page.evaluate('JSON.parse(localStorage.getItem("shiguang-v1"))')
    nav('冰箱');baseline=state()['fridge'];click('保质期规则')
    page.get_by_label('蔬菜默认天数',exact=True).fill('4')
    click('添加食材规则');page.get_by_label('规则1食材名称',exact=True).fill('鸡蛋');page.get_by_label('规则1天数',exact=True).fill('21')
    click('添加食材规则');page.get_by_label('规则2食材名称',exact=True).fill(' 鸡蛋 ');page.get_by_label('规则2天数',exact=True).fill('2')
    click('保存规则');expect(page.get_by_role('alert')).to_contain_text('重复')
    click('删除规则2')
    page.get_by_label('规则1天数',exact=True).fill('0');click('保存规则');expect(page.get_by_role('alert')).to_contain_text('正整数')
    page.get_by_label('规则1天数',exact=True).fill('21')
    page.evaluate('''()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='shiguang-v1')throw new Error('test write failure');return window.originalSetItem.call(this,k,v)}}''')
    click('保存规则');expect(page.get_by_role('alert')).to_contain_text('test write failure');assert state()['storageRules']['items']==[]
    page.evaluate('()=>{Storage.prototype.setItem=window.originalSetItem;}')
    for width,font in [(320,20),(390,14)]:
        page.set_viewport_size({'width':width,'height':844});page.evaluate('n=>document.documentElement.style.fontSize=n+"px"',font)
        assert page.locator('.storage-rules').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        assert page.locator('.storage-rule-row').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    click('保存规则');expect(page.get_by_role('dialog')).to_have_count(0)
    page.reload(wait_until='networkidle');nav('冰箱');click('保质期规则')
    expect(page.get_by_label('规则1天数',exact=True)).to_have_value('21')
    page.screenshot(path=str(ROOT/'.android-tools/device-logs/storage-rules-settings.png'),animations='disabled')
    page.get_by_label('规则1天数',exact=True).fill('22');click('关闭弹窗');click('放弃修改')
    assert state()['fridge']==baseline
    click('手动添加');expect(page.get_by_label('保存天数',exact=True)).to_have_value('4')
    page.get_by_label('食材名称',exact=True).fill('鸡蛋');expect(page.get_by_label('保存天数',exact=True)).to_have_value('21')
    page.get_by_label('食材名称',exact=True).fill('鸡蛋羹');expect(page.get_by_label('保存天数',exact=True)).to_have_value('4')
    page.get_by_role('button',name='食材分类',exact=True).click();page.get_by_role('dialog',name='选择食材分类',exact=True).get_by_role('button',name='肉类',exact=True).click();expect(page.get_by_label('保存天数',exact=True)).to_have_value('1')
    page.get_by_label('保存天数',exact=True).fill('8');page.get_by_label('食材名称',exact=True).fill('鸡蛋');expect(page.get_by_label('保存天数',exact=True)).to_have_value('8')
    click('确认放入冰箱');page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).fridge.length===2')
    assert state()['fridge'][0]==baseline[0];assert state()['fridge'][1]['days']==8
    click('保质期规则');page.get_by_label('规则1天数',exact=True).fill('25');click('保存规则')
    assert state()['fridge'][1]['days']==8
    # 模拟识别服务；相机与相册共用该识别入口，不发送真实图片。
    nav('点单');click('设置与备份');page.get_by_role('navigation',name='设置分页').get_by_role('button',name='AI 配置',exact=True).click()
    page.get_by_label('接口地址',exact=True).fill('https://rules.test');page.get_by_label('API Key',exact=True).fill('mock');click('保存 AI 配置');click('返回');nav('冰箱')
    page.route('https://rules.test/**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':json.dumps({'items':[{'name':'鸡蛋','category':'肉类','qty':2,'unit':'个','days':99},{'name':'白菜','category':'蔬菜','qty':1,'unit':'个'}]})}}]})))
    png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lzAAAAAASUVORK5CYII=')
    page.get_by_label('冰箱相册图片',exact=True).set_input_files({'name':'mock.png','mimeType':'image/png','buffer':png})
    expect(page.get_by_role('dialog',name='核对并保存食材',exact=True)).to_be_visible()
    rows=page.locator('.stock-review-details');rows.nth(0).locator(':scope > summary').click();expect(rows.nth(0).get_by_label('保存天数',exact=True)).to_have_value('25')
    rows.nth(1).locator(':scope > summary').click();expect(rows.nth(1).get_by_label('保存天数',exact=True)).to_have_value('4')
    click('确认保存选中条目');page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).fridge.length===4')
    assert [s['days'] for s in state()['fridge']]==[19,8,25,4]
    click('返回');page.get_by_label('冰箱拍摄图片',exact=True).set_input_files({'name':'camera.png','mimeType':'image/png','buffer':png})
    expect(page.get_by_role('dialog',name='核对并保存食材',exact=True)).to_be_visible();click('确认保存选中条目')
    page.wait_for_function('JSON.parse(localStorage.getItem("shiguang-v1")).fridge.length===6')
    assert [s['days'] for s in state()['fridge'][-2:]]==[25,4]
    click('返回');click('保质期规则');click('删除规则1');click('保存规则');click('手动添加')
    page.get_by_label('食材名称',exact=True).fill('鸡蛋');expect(page.get_by_label('保存天数',exact=True)).to_have_value('4')
    assert not errors,errors
    browser.close();print('PASS: rules CRUD, validation, failed save, restart, old stock, exact match, manual priority, image recognition, mobile layout')
