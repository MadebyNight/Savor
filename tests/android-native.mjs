import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
const adb='.android-tools/sdk/platform-tools/adb.exe', serial='ea767f86';
const sh=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const waiting=new Map();
async function connect(){const pid=sh('shell','pidof','com.shiguang.mealplanner');sh('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid);for(let n=0;n<30;n++){try{const pages=await(await fetch('http://127.0.0.1:9222/json/list')).json();if(pages.length){ws=new WebSocket(pages[0].webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{const m=JSON.parse(e.data);if(waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id);}};return;}}catch{}await sleep(500);}throw Error('WebView unavailable');}
async function cmd(method,params){const key=++id;const p=new Promise(r=>waiting.set(key,r));ws.send(JSON.stringify({id:key,method,params}));const result=await Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('CDP timeout: '+method)),15000))]);if(result.error)throw Error(JSON.stringify(result.error));return result.result;}
async function js(expression){const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function click(name){await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()===${JSON.stringify(name)});if(!b)throw Error('button missing '+${JSON.stringify(name)});b.click();})()`);await sleep(400);}
async function fill(selector,value){await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('input missing');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(150);}
const read=()=>js('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)');

mkdirSync('.android-tools/device-e2e',{recursive:true});
const network={wifi:sh('shell','settings','get','global','wifi_on'),data:sh('shell','settings','get','global','mobile_data')};
await connect();await sleep(800);
const original=await read();writeFileSync('.android-tools/device-e2e/native-before.json',original);
const report={device:serial,checks:[],restored:false};
async function nav(name){if(!await js(`!![...document.querySelectorAll('button')].find(b=>b.innerText.trim().includes(${JSON.stringify(name)}))`)){await js(`document.querySelector('button[aria-label="切换侧边栏"]').click()`);await sleep(300);}await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim().includes(${JSON.stringify(name)}));if(!b)throw Error('nav missing');b.click()})()`);await sleep(500);}
try{
 const img='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
 const saved=await js(`Capacitor.Plugins.LocalData.saveImage({data:${JSON.stringify(img)},mime:'image/png'})`);
 const loaded=await js(`Capacitor.Plugins.LocalData.readImage({path:${JSON.stringify(saved.path)}})`);
 if(loaded.data!==img||loaded.mime!=='image/png')throw Error('Image bytes differ');
 report.checks.push('native private image byte-exact roundtrip');report.imagePath=saved.path;
 sh('shell','svc','wifi','disable');sh('shell','svc','data','disable');await sleep(1000);
 if(sh('shell','settings','get','global','wifi_on')!=='0'||sh('shell','settings','get','global','mobile_data')!=='0')throw Error('Network not disabled');
 await nav('我的冰箱');await click('添加食材');await fill('[role="dialog"] input[aria-label="食材名称"]','离线验收番茄');await fill('[role="dialog"] input[aria-label="数量"]','30');await click('确认放入冰箱');await sleep(700);
 let state=JSON.parse(await read());if(!state.fridge.some(x=>x.name==='离线验收番茄'&&Number(x.qty)===30))throw Error('Offline fridge not saved');report.checks.push('offline UI fridge saved in SQLite');
 await nav('周菜单');
 console.log('WEEK UI',await js('document.body.innerText'));
 const name=state.confirmedRecipes[0]?.name;if(!name)throw Error('No confirmed recipe for week test');
 await js(`[...document.querySelectorAll('button')].filter(b=>b.innerText.trim()===${JSON.stringify(name)}).at(-1).click()`);await sleep(250);
 await js(`document.querySelector('button[aria-label="安排周1早餐"]').click()`);await sleep(500);
 await fill('input[aria-label="'+name+'餐次份数"]','3');await sleep(700);
 state=JSON.parse(await read());const hasMeal=s=>Object.values(s.weeks).some(w=>Object.values(w).some(items=>items.some(x=>x.name===name&&Number(x.servings)===3)));
 if(!hasMeal(state))throw Error('Offline week not saved');report.checks.push('offline weekly meal arrangement and servings persisted');
 ws.close();sh('shell','am','force-stop','com.shiguang.mealplanner');sh('shell','am','start','-n','com.shiguang.mealplanner/.MainActivity');await sleep(1500);await connect();await sleep(900);
 state=JSON.parse(await read());if(!hasMeal(state)||!state.fridge.some(x=>x.name==='离线验收番茄'))throw Error('Offline restart lost data');report.checks.push('offline force-stop restart retains fridge and week');
}catch(e){report.error=e.message;process.exitCode=1;}
finally{
 sh('shell','svc','wifi',network.wifi==='1'?'enable':'disable');sh('shell','svc','data',network.data==='1'?'enable':'disable');
 try{await js(`Capacitor.Plugins.LocalData.saveState({value:${JSON.stringify(original)}})`);await js('location.reload()');await sleep(1000);report.restored=(await read())===original;}catch(e){report.restoreError=e.message;process.exitCode=1;}
 writeFileSync('.android-tools/device-e2e/native-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));ws.close();
}
