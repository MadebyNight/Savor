"""在已连接手机内加密当前 AI 配置，仅将密文导出到忽略文件。"""
import argparse
import getpass
import json
import subprocess
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True)
parser.add_argument('--password-stdin', action='store_true')
parser.add_argument('--replace', action='store_true')
args = parser.parse_args()
out = ROOT / 'public/developer-ai-profile.json'
if out.exists() and not args.replace:
    raise SystemExit('密文已存在；确认更新共享配置后使用 --replace。')
password = sys.stdin.buffer.readline().decode('utf-8-sig').rstrip('\r\n') if args.password_stdin else getpass.getpass('解锁密码：')
if not password:
    raise SystemExit('密码不能为空。')
adb = str(ROOT / '.android-tools/sdk/platform-tools/adb.exe')
def run(*values):
    return subprocess.check_output([adb, '-s', args.serial, *values], text=True, encoding='utf-8').strip()
pid = run('shell', 'pidof', 'com.shiguang.mealplanner')
if not pid:
    raise SystemExit('请先打开手机中的食光。')
port = run('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid)
try:
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp('http://127.0.0.1:' + port, no_defaults=True)
        page = browser.contexts[0].pages[0]
        # 明文只存在于设备内的当前 JS 调用；不要返回、打印或截取桥接消息。
        bundle = page.evaluate('''async password => {
          const local=Capacitor.Plugins.LocalData;
          const config=JSON.parse((await local.getPreference({key:'ai-config'})).value || 'null');
          const secret=(await local.getSecret({key:'ai'})).value;
          if(!config?.url || !config?.model || !secret)throw new Error('当前个人 AI 配置不完整');
          const url=new URL(config.url);
          if(url.protocol!=='https:' || url.username || url.password)throw new Error('AI 接口地址无效');
          const format='shiguang-developer-ai-v1',iterations=600000;
          const salt=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
          const encode=s=>new TextEncoder().encode(s);
          const material=await crypto.subtle.importKey('raw',encode(password),'PBKDF2',false,['deriveKey']);
          const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt']);
          const data=encode(JSON.stringify({url:config.url,model:config.model,key:secret}));
          const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode(format)},key,data));
          const base64=bytes=>btoa(String.fromCharCode(...bytes));
          return {format,iterations,salt:base64(salt),iv:base64(iv),ciphertext:base64(ciphertext)};
        }''', password)
        browser.close()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bundle, indent=2) + '\n', encoding='utf-8')
    print('已导出开发者配置密文；未导出明文凭据。')
finally:
    run('forward', '--remove', 'tcp:' + port)
