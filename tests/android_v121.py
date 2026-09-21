"""V1.2.1 device acceptance. Private backups never leave the ignored workspace."""
import os,json,subprocess,hashlib,sys,tarfile,io,time,xml.etree.ElementTree as ET
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.android-tools/v1.2.1-device';OUT.mkdir(exist_ok=True)
ADB=ROOT/'.android-tools/sdk/platform-tools/adb.exe'
SERIAL=os.environ.get('ANDROID_SERIAL','ea767f86');PACKAGE='com.shiguang.mealplanner';PORT='9223'
def adb(*args,binary=False):
 r=subprocess.run([str(ADB),'-s',SERIAL,*args],capture_output=True,check=True,timeout=120)
 return r.stdout if binary else r.stdout.decode('utf-8',errors='replace').strip()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def statehash(value):
 s=json.loads(value)
 if not s.get('nutritionReports'):s.pop('nutritionReports',None)
 return sha(json.dumps(s,sort_keys=True,ensure_ascii=False).encode())
def attach(p):
 adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity')
 pid=adb('shell','pidof',PACKAGE);adb('forward','tcp:'+PORT,'localabstract:webview_devtools_remote_'+pid)
 for n in range(20):
  try:b=p.chromium.connect_over_cdp('http://127.0.0.1:'+PORT,timeout=3000,no_defaults=True);break
  except Exception:
   if n==19:raise
   time.sleep(.5)
 page=b.contexts[0].pages[0];page.set_default_timeout(15000)
 page.wait_for_function("!!document.querySelector('.topbar') && [...document.querySelectorAll('[role=status]')].some(e=>e.textContent==='已保存')")
 return b,page
def snapshot():
 folders=adb('shell','run-as',PACKAGE,'ls').split()
 return adb('exec-out','run-as',PACKAGE,'tar','-cf','-',*[f for f in ['databases','files','shared_prefs'] if f in folders],binary=True)
def saved_members():
 with tarfile.open(fileobj=io.BytesIO((OUT/'before.tar').read_bytes())) as t:return {m.name:t.extractfile(m).read() for m in t.getmembers() if m.isfile()}
def write_private(path,data):
 subprocess.run([str(ADB),'-s',SERIAL,'shell','run-as',PACKAGE,'sh','-c',"'cat > "+path+"'"],input=data,check=True,capture_output=True)
if __name__=='__main__':
 mode=sys.argv[1]
 if mode=='prepare':
  if (OUT/'before.tar').exists():raise RuntimeError('Baseline exists; refusing overwrite')
  adb('shell','am','force-stop',PACKAGE);(OUT/'before.tar').write_bytes(snapshot())
  installed=adb('shell','pm','path',PACKAGE).splitlines();assert len(installed)==1
  adb('pull',installed[0].removeprefix('package:'),str(OUT/'installed-before.apk'))
  members=saved_members();prefs=ET.fromstring(members.get('shared_prefs/preferences.xml',b'<map/>'))
  node=next((e for e in prefs if e.get('name')=='dav-auto-sync'),None)
  if node is None:node=ET.SubElement(prefs,'string',name='dav-auto-sync')
  node.text='false';write_private('shared_prefs/preferences.xml',ET.tostring(prefs,encoding='utf-8',xml_declaration=True))
  with sync_playwright() as p:
   b,page=attach(p);original=page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)');(OUT/'before.json').write_text(original,encoding='utf-8');b.close()
  adb('forward','--remove','tcp:'+PORT)
  print('PASS private backup, APK, business baseline; automatic sync disabled for testing')
 elif mode=='upgrade':
  before=(OUT/'before.json').read_text(encoding='utf-8');report={}
  with sync_playwright() as p:
   b,page=attach(p);after=page.evaluate('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)')
   assert statehash(before)==statehash(after),'Business state changed during upgrade'
   report['businessPreserved']=True
   # Compare encrypted credential storage, without reading/decrypting secrets.
   members=saved_members();old=members.get('shared_prefs/credentials.xml')
   current=adb('exec-out','run-as',PACKAGE,'cat','shared_prefs/credentials.xml',binary=True) if old else None
   assert old==current,'Encrypted credentials changed';report['encryptedCredentialsPreserved']=True
   assert page.evaluate('Capacitor.Plugins.LocalData.getPreference({key:"dav-auto-sync"}).then(r=>r.value)')=='false'
   page.screenshot(path=str(OUT/'upgraded-home.png'));b.close()
  adb('forward','--remove','tcp:'+PORT);(OUT/'upgrade-result.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
 elif mode=='restore':
  before=(OUT/'before.json').read_text(encoding='utf-8')
  with sync_playwright() as p:
   b,page=attach(p);page.evaluate('value=>Capacitor.Plugins.LocalData.saveState({value})',before);b.close()
  adb('shell','am','force-stop',PACKAGE)
  for name,data in saved_members().items():
   if name.startswith('shared_prefs/'):write_private(name,data)
  adb('forward','--remove','tcp:'+PORT)
  print('PASS business state and original preference files restored; app remains stopped')
 else:raise ValueError('prepare / upgrade / restore')
