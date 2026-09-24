"""设置分组入口和图像入口：草稿、取消、同图重选、失败及小屏布局。"""
import base64, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('E2E_OUT',ROOT/'.android-tools/settings-review'))
OUT.mkdir(parents=True,exist_ok=True)
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=str(ROOT/'.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'))
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(os.environ.get('E2E_URL','http://127.0.0.1:4173'));page.wait_for_load_state('networkidle')
    def click(name):page.get_by_role('button',name=name,exact=True).click()
    def back_to_home():
        desktop_back=page.get_by_role('button',name='返回设置',exact=True)
        if desktop_back.is_visible():desktop_back.click()
        else:click('返回')
    def section(name):
        if not page.get_by_role('navigation',name='设置首页').is_visible():back_to_home()
        page.get_by_role('navigation',name='设置首页').locator('.settings-entry',has_text=name).click()
    click('设置与备份')
    home=page.get_by_role('navigation',name='设置首页')
    expect(home).to_be_visible()
    assert home.locator('.settings-entry').count()==4
    page.screenshot(path=str(OUT/'settings-home-390.png'),full_page=True)
    section('AI 配置');page.screenshot(path=str(OUT/'settings-ai-390.png'),full_page=True)
    back_to_home()
    expect(page.get_by_label('识别原文',exact=True)).to_have_count(0)
    expect(page.get_by_label('接口地址',exact=True)).not_to_be_visible()
    expect(page.get_by_role('button',name='导入备份',exact=True)).not_to_be_visible()
    expect(page.get_by_label('账号',exact=True)).not_to_be_visible()
    def open_image():
        while page.get_by_role('button',name='返回',exact=True).count(): click('返回')
        page.get_by_role('navigation',name='主导航').get_by_role('button',name='菜谱',exact=True).click();click('导入菜谱')
    open_image()
    album=page.get_by_label('从相册选择图片',exact=True)
    camera=page.get_by_label('拍摄图片',exact=True)
    assert album.get_attribute('capture') is None
    expect(camera).to_have_attribute('capture','environment')
    for button,input in [('相册选择',album),('拍摄',camera)]:
        with page.expect_file_chooser() as choice:click(button)
        assert choice.value.element.get_attribute('aria-label')==input.get_attribute('aria-label')
        choice.value.set_files({'name':'receipt.png','mimeType':'image/png','buffer':PNG})
        expect(page.get_by_alt_text('待识别图片',exact=True)).to_be_visible()
        expect(input).to_have_value('') # 同一张图片可再次选择
    preview=page.get_by_alt_text('待识别图片',exact=True).get_attribute('src')
    with page.expect_file_chooser() as choice:click('相册选择')
    choice.value.set_files([])
    expect(page.get_by_alt_text('待识别图片',exact=True)).to_have_attribute('src',preview)
    album.set_input_files({'name':'large.png','mimeType':'image/png','buffer':b'x'*(10*1024*1024+1)})
    expect(page.get_by_text('请选择10MB以内图片',exact=True)).to_be_visible()
    expect(page.get_by_alt_text('待识别图片',exact=True)).to_have_attribute('src',preview)
    # 读取阶段不能发送旧图；磁盘读取失败保留旧图和正文。
    page.evaluate('''() => {window.RealReader=FileReader;window.FileReader=class {readAsDataURL(){window.failedReader=this;}};}''')
    album.set_input_files({'name':'broken.png','mimeType':'image/png','buffer':PNG})
    expect(page.get_by_role('button',name='确认发送并识别',exact=True)).to_be_disabled()
    page.evaluate('() => {window.failedReader.onerror();window.FileReader=window.RealReader;}')
    expect(page.get_by_text('图片读取失败，请重新从相册选择或拍摄',exact=True)).to_be_visible()
    expect(page.get_by_alt_text('待识别图片',exact=True)).to_have_attribute('src',preview)
    click('AI 配置');page.get_by_label('模型',exact=True).fill('unsaved-model')
    section('备份恢复');expect(page.get_by_role('button',name='导入备份',exact=True)).to_be_visible()
    section('坚果云同步');page.get_by_label('账号',exact=True).fill('unsaved-account')
    section('AI 配置');expect(page.get_by_label('模型',exact=True)).to_have_value('unsaved-model')
    section('坚果云同步');expect(page.get_by_label('账号',exact=True)).to_have_value('unsaved-account')
    back_to_home();expect(home).to_be_visible()
    click('返回');expect(page.get_by_alt_text('待识别图片',exact=True)).to_have_attribute('src',preview)
    page.reload();page.wait_for_load_state('networkidle');open_image()
    expect(page.get_by_alt_text('待识别图片',exact=True)).to_have_attribute('src',preview)
    click('AI 配置')
    for width,height in [(320,740),(390,844),(740,360),(1280,900)]:
        page.set_viewport_size({'width':width,'height':height})
        back_to_home()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width,height,'home')
        assert home.locator('.settings-entry:visible').count()==4
        for name in ['AI 配置','备份恢复','坚果云同步','营养周报提醒']:
            section(name)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width,height,name)
            assert page.locator('.settings-page:visible').count()==1
    page.set_viewport_size({'width':390,'height':844});back_to_home();click('返回')
    click('移除图片');page.reload();open_image()
    expect(page.get_by_alt_text('待识别图片',exact=True)).to_have_count(0)
    page.screenshot(path=str(OUT/'settings-recognition.png'),full_page=True)
    assert not errors,errors
    browser.close();print('PASS: settings home and four detail pages, independent recognition, album/camera routing, cancel/reselect/size/read-error, draft persistence, responsive layout')
