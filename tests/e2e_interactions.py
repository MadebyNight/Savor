"""V1.1.2 生产样式回归：触摸、焦点、复选框、提示、弹窗与减少动画。"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("E2E_OUT", ROOT / ".android-tools/device-logs/v1.1.2"))
OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=str(ROOT / ".android-tools/playwright/chromium-1223/chrome-win64/chrome.exe"))
    page = browser.new_page(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(os.environ.get("E2E_URL", "http://127.0.0.1:4173"))
    page.wait_for_load_state("networkidle")
    def click(name): page.get_by_role("button", name=name, exact=True).click()
    def style(locator, prop): return locator.evaluate("(e,k)=>getComputedStyle(e)[k]", prop)
    def finish(): page.evaluate("document.getAnimations().forEach(a=>{if(a.effect.getTiming().iterations!==Infinity)a.finish()})")
    page.get_by_role("navigation",name="主导航").get_by_role("button",name="菜谱",exact=True).click();click("导入菜谱")
    album = page.get_by_role("button", name="相册选择", exact=True)
    assert style(album,"outlineStyle") == "none"
    cdp = page.context.new_cdp_session(page)
    # CDP 原始 touchStart 在无头 Chromium 不建立 :active；用浏览器伪状态接口验证生产 CSS。
    cdp.send("DOM.enable"); cdp.send("CSS.enable")
    doc = cdp.send("DOM.getDocument")
    node = cdp.send("DOM.querySelector", {"nodeId":doc["root"]["nodeId"],"selector":".image-source-actions button"})["nodeId"]
    normal = style(album,"filter")
    cdp.send("CSS.forcePseudoState", {"nodeId":node,"forcedPseudoClasses":["active"]})
    page.wait_for_timeout(160)
    assert style(album,"filter") != normal
    cdp.send("CSS.forcePseudoState", {"nodeId":node,"forcedPseudoClasses":[]})
    page.wait_for_timeout(160)
    assert style(album,"filter") == normal
    click("AI 配置");click("坚果云同步")
    checkbox = page.locator('.settings-panel input[type="checkbox"]')
    checkbox.check()
    assert checkbox.bounding_box()["width"] == 20
    assert checkbox.bounding_box()["height"] == 20
    assert style(checkbox,"accentColor") == "rgb(117, 130, 102)"
    assert checkbox.locator("xpath=ancestor::label").bounding_box()["height"] >= 48
    page.screenshot(path=str(OUT / "sync-checkbox.png"))
    click("返回")
    expect(page.get_by_role("button",name="确认发送并识别",exact=True)).to_be_disabled()
    page.get_by_label("识别原文",exact=True).fill("http://article.test/recipe")
    click("获取正文")
    toast = page.locator('[data-sonner-toast][data-type="error"]').last
    expect(toast).to_be_visible()
    assert style(toast,"backgroundColor") == "rgb(255, 246, 243)"
    assert style(toast,"color") == "rgb(155, 53, 41)"
    click("保存草稿")
    toast = page.locator('[data-sonner-toast][data-type="success"]').last
    expect(toast).to_be_visible()
    assert style(toast,"backgroundColor") == "rgb(242, 245, 236)"
    click("AI 配置")
    page.get_by_label("接口地址",exact=True).fill("https://ai.test/v1/chat/completions")
    page.get_by_label("API Key",exact=True).fill("mock-key")
    pending=[]
    page.route("https://ai.test/**",lambda r: pending.append(r))
    click("测试连接")
    popup=page.get_by_role("dialog")
    expect(popup).to_be_visible()
    # 暂停生产动画在中间帧，检查不是只有类名而实际位移被覆盖。
    popup.evaluate("e=>e.getAnimations().forEach(a=>{a.pause();a.currentTime=60})")
    assert style(popup,"animationName") == "sheet-enter"
    assert style(popup,"translate") not in ("none","0px","0px 0px")
    finish()
    close=popup.get_by_role("button",name="关闭弹窗",exact=True)
    box=close.bounding_box();assert box["width"]>=48 and box["height"]>=48
    page.keyboard.press("Tab");close.focus()
    assert style(close,"outlineColor") == "rgb(181, 155, 84)"
    assert style(close,"outlineWidth") == "2px"
    assert style(close,"boxShadow") == "none"
    page.screenshot(path=str(OUT / "dialog-focus.png"))
    click("开始测试")
    busy=page.get_by_role("button",name="正在测试…",exact=True)
    expect(busy).to_be_disabled()
    assert float(style(busy,"opacity")) < 1
    click("停止等待")
    for route in pending: route.fulfill(status=200, content_type="application/json", body='{"choices":[{"message":{"content":"OK"}}]}')
    page.wait_for_load_state("networkidle")
    result=page.get_by_role("dialog")
    expect(result).to_contain_text("已停止等待")
    result.evaluate("e=>e.getAnimations().forEach(a=>{a.pause();a.currentTime=60})")
    assert style(result,"animationName") == "dialog-enter"
    assert style(result,"scale") not in ("none","1")
    finish()
    for width,height in [(320,740),(390,844),(740,336)]:
        page.set_viewport_size({"width":width,"height":height})
        box=result.bounding_box()
        assert box["x"]>=-1 and box["y"]>=-1 and box["x"]+box["width"]<=width+1 and box["y"]+box["height"]<=height+1
    click("知道了")
    page.emulate_media(reduced_motion="reduce")
    click("测试连接")
    expect(page.get_by_role("dialog")).to_be_visible()
    assert float(style(page.get_by_role("dialog"),"animationDuration").removesuffix("s")) < .001
    assert not errors, errors
    browser.close()
    print("PASS: touch feedback, checkbox, focus, toast colors, loading, dialog motion/bounds, reduced motion")
