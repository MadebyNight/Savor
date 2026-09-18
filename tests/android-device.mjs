import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
const adb='.android-tools/sdk/platform-tools/adb.exe', serial='ea767f86';
const sh=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const waiting=new Map();
async function connect(){const pid=sh('shell','pidof','com.shiguang.mealplanner');sh('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid);for(let n=0;n<30;n++){try{const pages=await(await fetch('http://127.0.0.1:9222/json/list')).json();if(pages.length){ws=new WebSocket(pages[0].webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{const m=JSON.parse(e.data);if(waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id);}};return;}}catch{}await sleep(500);}throw Error('WebView unavailable');}
async function cmd(method,params){const key=++id;const p=new Promise(r=>waiting.set(key,r));ws.send(JSON.stringify({id:key,method,params}));const result=await p;if(result.error)throw Error(JSON.stringify(result.error));return result.result;}
async function js(expression){const r=await cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function click(name){await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()===${JSON.stringify(name)});if(!b)throw Error('button missing '+${JSON.stringify(name)});b.click();})()`);await sleep(400);}
async function fill(selector,value){await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('input missing');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await sleep(150);}
const read=()=>js('Capacitor.Plugins.LocalData.loadState().then(r=>r.value)');
mkdirSync('.android-tools/device-e2e',{recursive:true});await connect();await sleep(800);
const original=await read();writeFileSync('.android-tools/device-e2e/before.json',original);
const report={device:serial,checks:[]};
try{
 await click('菜谱');await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>['新建菜谱','继续草稿'].includes(b.innerText.trim()));if(!b)throw Error('recipe editor entry missing');b.click();})()`);await sleep(400);await fill('input[placeholder="给这道菜起个名字"]','真机验收临时菜谱');await fill('input[aria-label="食材名称"]','测试番茄');await fill('input[aria-label="数量"]','100');await fill('textarea[aria-label="步骤1"]','洗净炒熟');await click('确认保存到菜品库');await sleep(1000);
 let state=JSON.parse(await read());if(!state.recipes.some(r=>r.name==='真机验收临时菜谱'))throw Error('UI recipe not persisted');report.checks.push('UI recipe saved to native SQLite');
 await js(`document.querySelector('button[aria-label="添加真机验收临时菜谱"]').click()`);await click('确认我的菜单');await js(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('确认并同步')).click()`);await sleep(700);
 state=JSON.parse(await read());if(!state.confirmedRecipes.some(r=>r.name==='真机验收临时菜谱'))throw Error('snapshot not saved');report.checks.push('UI confirmed procurement snapshot');
 ws.close();sh('shell','am','force-stop','com.shiguang.mealplanner');sh('shell','am','start','-n','com.shiguang.mealplanner/.MainActivity');await sleep(1200);await connect();await sleep(1000);
 state=JSON.parse(await read());if(!state.recipes.some(r=>r.name==='真机验收临时菜谱'))throw Error('restart lost data');report.checks.push('force-stop restart persistence');
 const shot=await cmd('Page.captureScreenshot',{format:'png'});writeFileSync('.android-tools/device-e2e/restarted.png',Buffer.from(shot.data,'base64'));
}finally{
 await js(`Capacitor.Plugins.LocalData.saveState({value:${JSON.stringify(original)}})`);await js('location.reload()');await sleep(1000);report.restored=(await read())===original;writeFileSync('.android-tools/device-e2e/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));ws.close();
}
