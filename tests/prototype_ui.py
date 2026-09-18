"""独立原型验证；截图为评审交付物，不读写正式应用数据。"""
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.android-tools' / 'prototype-preview'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('PROTOTYPE_URL', (ROOT / 'prototypes' / 'mobile.html').as_uri())
CHROME = ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(CHROME))
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.wait_for_load_state('networkidle')

    def nav(name):
        page.get_by_role('navigation', name='主导航').get_by_role('button', name=name, exact=True).click()

    def capture(name):
        page.locator('#message').evaluate('(el) => el.hidden = true')
        page.screenshot(path=str(OUT / name))

    def no_horizontal_overflow():
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), '页面横向溢出'
        assert page.locator('#content').evaluate('(el) => el.scrollWidth <= el.clientWidth'), '内容横向溢出'
        assert page.locator('.list-pane, .full-pane').evaluate('(el) => el.scrollWidth <= el.clientWidth'), '列表横向溢出'

    expect(page.get_by_role('heading', name='点单', exact=True)).to_be_visible()
    assert page.locator('.recipe-row').count() == 10
    assert page.locator('img').evaluate_all('(els) => els.every(el => el.complete && el.naturalWidth > 0)')
    assert page.locator('.recipe-row').first.bounding_box()['y'] < 180
    capture('01-点单-首屏.png')
    page.get_by_role('complementary', name='分类').get_by_role('button', name='素菜').click()
    assert page.locator('.recipe-row').count() == 3
    page.get_by_role('complementary', name='分类').get_by_role('button', name='全部').click()
    page.get_by_label('搜索菜名或食材').fill('鸡胸肉')
    assert page.locator('.recipe-row').count() == 1
    page.get_by_label('搜索菜名或食材').fill('不会存在的菜')
    expect(page.get_by_text('还没找到这道菜')).to_be_visible()
    page.get_by_label('搜索菜名或食材').fill('')

    page.get_by_role('button', name='查看番茄炒鸡蛋', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).not_to_be_visible()

    for name in ['番茄炒鸡蛋', '番茄炒鸡蛋', '西兰花炒鸡胸肉', '紫菜蛋花汤', '牛奶燕麦碗']:
        page.get_by_role('button', name='添加' + name, exact=True).click()
    expect(page.get_by_text('已选 4 道 · 5 份')).to_be_visible()
    page.locator('.list-pane').evaluate('(el) => el.scrollTop = 0')
    capture('02-点单-已选.png')
    page.get_by_role('button', name='确认选菜', exact=False).click()
    nav('菜篮子')
    assert page.locator('.purchase-row').count() == 5
    expect(page.locator('.purchase-row').filter(has=page.get_by_role('heading', name='番茄', exact=True))).to_contain_text('400')
    capture('04-菜篮子.png')
    nav('冰箱')
    capture('03-冰箱.png')
    page.get_by_role('button', name='添加', exact=True).click()
    page.get_by_label('食材名称', exact=True).fill('胡萝卜')
    page.get_by_role('button', name='放入冰箱', exact=True).click()
    expect(page.get_by_role('heading', name='胡萝卜', exact=True)).to_be_visible()

    nav('周菜单')
    capture('05-周菜单.png')
    page.get_by_role('button', name='9月15日 周二', exact=True).click()
    assert page.locator('.meal-item').count() == 0
    page.get_by_role('button', name='添加菜品', exact=True).first.click()
    page.get_by_role('dialog').get_by_role('button', name='牛奶燕麦碗', exact=True).click()
    expect(page.get_by_role('heading', name='牛奶燕麦碗', exact=True)).to_be_visible()
    page.get_by_role('button', name='移除牛奶燕麦碗', exact=True).click()
    assert page.locator('.meal-item').count() == 0

    nav('菜谱')
    capture('06-菜谱.png')
    page.get_by_role('button', name='新建', exact=True).click()
    page.get_by_label('菜名', exact=True).fill('清炒土豆丝')
    page.get_by_label('主要食材', exact=True).fill('土豆')
    page.get_by_label('制作步骤', exact=True).fill('切丝后炒熟调味。')
    page.get_by_role('button', name='保存演示菜谱', exact=True).click()
    expect(page.get_by_role('heading', name='清炒土豆丝', exact=True)).to_be_visible()

    # 清空选菜后仍可确认，旧采购不能残留。
    nav('点单')
    for name in ['番茄炒鸡蛋', '番茄炒鸡蛋', '西兰花炒鸡胸肉', '紫菜蛋花汤', '牛奶燕麦碗']:
        page.get_by_role('button', name='减少' + name, exact=True).click()
    page.get_by_role('button', name='确认清空', exact=False).click()
    nav('菜篮子')
    expect(page.get_by_text('先选几道喜欢的菜', exact=True)).to_be_visible()

    # 所有页面在常用宽度、横屏下均不出现水平溢出。
    for width, height in [(360,800), (390,844), (430,932), (844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        for name in ['点单','冰箱','菜篮子','周菜单','菜谱']:
            nav(name)
            no_horizontal_overflow()
        nav('点单')
        capture(f'检查-{width}x{height}.png')

    page.set_viewport_size({'width':390,'height':844})
    page.emulate_media(reduced_motion='reduce')
    # 模拟系统字体放大 30%，不通过固定 px 的根字号掩盖问题。
    page.evaluate('''() => {
      const sizes = [...document.querySelectorAll('#app *')].map(el => [el,parseFloat(getComputedStyle(el).fontSize)]);
      sizes.forEach(([el,size]) => el.style.fontSize = `${size * 1.3}px`);
    }''')
    no_horizontal_overflow()
    capture('检查-字体放大.png')
    page.reload()
    page.wait_for_load_state('networkidle')
    assert page.locator('.recipe-row').count() == 10, '刷新必须重置演示菜谱'
    assert not page.locator('.selection-bar').count(), '刷新必须重置选菜'
    page.set_viewport_size({'width':1280,'height':960})
    capture('00-桌面预览.png')
    assert not errors, errors
    print(json.dumps({'result':'PASS','checks':['五页切换','分类与搜索','详情弹层与Esc','份数确认与库存抵扣','清空确认','按日安排与移除','库存和菜谱演示录入','360/390/430及横屏无水平溢出','点单字体放大30%','本地图片加载','刷新重置','无JS异常'],'screenshots':str(OUT)}, ensure_ascii=False))
    browser.close()
