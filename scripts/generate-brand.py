"""从品牌 SVG 生成 Android 图标与启动图；使用现有 Pillow、Playwright。"""
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / 'android/app/src/main/res'
source = ET.parse(ROOT / 'public/brand/mark.svg').getroot()
NS = '{http://www.w3.org/2000/svg}'
background = source.find(f'{NS}rect').get('fill')
foreground = deepcopy(source)
foreground.remove(foreground.find(f'{NS}rect'))
foreground.find(f'{NS}g').set('transform', 'translate(12.5 12.5) scale(.75)')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=str(ROOT / '.android-tools/playwright/chromium-1223/chrome-win64/chrome.exe'), headless=True)
    page = browser.new_page(viewport={'width':1024,'height':1024}, device_scale_factor=1)
    def render(root):
        # Serialize with a default SVG namespace for browser HTML parsing.
        ET.register_namespace('', NS[1:-1])
        svg = ET.tostring(root, encoding='unicode')
        page.set_content('<style>html,body{margin:0;background:transparent}svg{display:block;width:1024px;height:1024px}</style>' + svg)
        return Image.open(BytesIO(page.screenshot(omit_background=True))).convert('RGBA')
    icon, front = render(source), render(foreground)
    browser.close()

icon.save(ROOT / 'public/brand/icon-1024.png')
for density, size, fgsize in [('mdpi',48,108),('hdpi',72,162),('xhdpi',96,216),('xxhdpi',144,324),('xxxhdpi',192,432)]:
    target = RES / ('mipmap-' + density)
    icon.resize((size,size),Image.Resampling.LANCZOS).save(target / 'ic_launcher.png')
    # Round launchers apply their own mask on modern Android; legacy gets an opaque circle.
    from PIL import ImageDraw
    round_icon = Image.new('RGBA',(1024,1024))
    ImageDraw.Draw(round_icon).ellipse((0,0,1024,1024),fill=background)
    round_icon.alpha_composite(front.resize((1365,1365),Image.Resampling.LANCZOS),(-171,-171))
    round_icon.resize((size,size),Image.Resampling.LANCZOS).save(target / 'ic_launcher_round.png')
    front.resize((fgsize,fgsize),Image.Resampling.LANCZOS).save(target / 'ic_launcher_foreground.png')

for path in RES.glob('drawable*/splash.png'):
    with Image.open(path) as original: size = original.size
    canvas = Image.new('RGB',size,'#FAF9F6')
    edge = max(48,round(min(size)*.18))
    stamp = icon.resize((edge,edge),Image.Resampling.LANCZOS)
    canvas.paste(stamp,((size[0]-edge)//2,(size[1]-edge)//2),stamp)
    canvas.save(path)

(RES / 'values/ic_launcher_background.xml').write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">'+background+'</color></resources>\n',encoding='utf8')
(RES / 'drawable/ic_launcher_background.xml').write_text('<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="'+background+'"/></shape>\n',encoding='utf8')

def vector(monochrome=False):
    paths=[]
    for item in source.find(f'{NS}g'):
        d=item.get('d')
        if item.tag==f'{NS}circle':
            x,y,r=(float(item.get(k)) for k in ('cx','cy','r'))
            d=f'M{x-r},{y} A{r},{r} 0,1 0 {x+r},{y} A{r},{r} 0,1 0 {x-r},{y} Z'
        fill=item.get('fill','#00000000')
        attrs=f'android:pathData="{d}" android:fillColor="{("#FFFFFF" if monochrome and fill!="#00000000" else fill)}"'
        if item.get('stroke'):
            color='#FFFFFF' if monochrome else item.get('stroke')
            attrs+=f' android:strokeColor="{color}" android:strokeWidth="{item.get("stroke-width")}" android:strokeLineCap="round"'
        paths.append('<path '+attrs+'/>')
    return '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="100" android:viewportHeight="100"><group android:translateX="12.5" android:translateY="12.5" android:scaleX=".75" android:scaleY=".75">'+''.join(paths)+'</group></vector>\n'
(RES / 'drawable-v24/ic_launcher_foreground.xml').write_text(vector(),encoding='utf8')
(RES / 'drawable/ic_launcher_monochrome.xml').write_text(vector(True),encoding='utf8')
adaptive=RES / 'mipmap-anydpi-v33'
adaptive.mkdir(exist_ok=True)
for name in ['ic_launcher.xml','ic_launcher_round.xml']:
    (adaptive/name).write_text('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/><monochrome android:drawable="@drawable/ic_launcher_monochrome"/></adaptive-icon>\n',encoding='utf8')
print('Generated launcher icons, adaptive foregrounds and splash images from public/brand/mark.svg')
