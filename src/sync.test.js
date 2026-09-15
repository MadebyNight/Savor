import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSync,uploadVersion,downloadVersion,fingerprint} from './sync.js';
import {setSecret,setPreference,getPreference} from './storage.js';
import {businessState,validateBackup} from './services.js';

const state=()=>({recipes:[{id:'a',name:'菜',ingredients:[],steps:[],image:'data:image/png;base64,AAAA'}],fridge:[],confirmed:{},confirmedRecipes:[],weeks:{},archives:{}});
const config={url:'https://example.test/dav/',username:'用户'};
function environment(){
  const prefs=new Map();globalThis.localStorage={getItem:k=>prefs.get(k)??null,setItem:(k,v)=>prefs.set(k,v)};
  const files=new Map(),writes=[];let race=false;
  const call=async(path,method='GET',body,headers={})=>{
    if(method==='MKCOL')return {status:201,headers:{}};
    if(method==='GET')return files.has(path)?{status:200,data:files.get(path),headers:{etag:'"1"'}}:{status:404,data:'',headers:{}};
    writes.push({path,headers});
    if(method==='DELETE'){files.delete(path);return {status:204,headers:{}};}
    if(path==='current.json' && race)return {status:412,headers:{}};
    if(headers['If-None-Match']==='*' && files.has(path))return {status:412,headers:{}};
    files.set(path,body);return {status:201,headers:{}};
  };
  globalThis.fetch=async(url,options)=>{const path=decodeURI(String(url)).split('/食光/')[1];const res=await call(path,options.method,options.body,options.headers);return {status:res.status,text:async()=>res.data||'',headers:new Map(Object.entries(res.headers))};};
  return {files,writes,call,race:()=>{race=true;}};
}
test('两端分别修改必须选择，单端修改只沿对应方向同步',async()=>{
  const env=environment();await setSecret('dav','password');const local=state();
  await setPreference('sync-base',{id:'old',hash:await fingerprint(businessState(local))});
  env.files.set('current.json',JSON.stringify({id:'new'}));
  assert.equal((await inspectSync(config,local)).action,'download');
  local.recipes[0].name='修改';assert.equal((await inspectSync(config,local)).action,'choose');
  env.files.set('current.json',JSON.stringify({id:'old'}));assert.equal((await inspectSync(config,local)).action,'upload');
});
test('并发412保留版本副本且不更新同步基线',async()=>{
  const env=environment();env.race();const old={id:'old',hash:'old-hash'};await setPreference('sync-base',old);
  await assert.rejects(uploadVersion({call:env.call,remote:{id:'old'},etag:'"1"'},state()),/另一设备/);
  assert.deepEqual(await getPreference('sync-base'),old);
  assert.ok([...env.files.keys()].some(k=>k.startsWith('versions/')));
  assert.equal((await getPreference('sync-pending')).length,1);
  assert.equal(env.writes.find(x=>x.path==='current.json').headers['If-Match'],'"1"');
});
test('图片完整往返，损坏或缺失图片拒绝恢复',async()=>{
  const env=environment(),local=state();const manifest=await uploadVersion({call:env.call,remote:null},local);
  assert.deepEqual(businessState(await downloadVersion({call:env.call,remote:manifest})),businessState(local));
  const path=[...env.files.keys()].find(k=>k.startsWith('images/'));
  env.files.set(path,JSON.stringify('damaged'));await assert.rejects(downloadVersion({call:env.call,remote:manifest}),/图片校验/);
  env.files.delete(path);await assert.rejects(downloadVersion({call:env.call,remote:manifest}),/HTTP 404/);
});
test('入口仅列最近10个成功版本且保留未解决版本文件',async()=>{
  const env=environment();const previous=Array.from({length:10},(_,i)=>({id:'v'+i}));
  env.files.set('versions/v9.json','old');env.files.set('versions/unresolved.json','conflict');
  const result=await uploadVersion({call:env.call,remote:{id:'v0',versions:previous},etag:'"1"'},state());
  assert.equal(result.versions.length,10);assert.deepEqual(result.versions.slice(1),previous.slice(0,9));
  assert.equal(env.writes.filter(x=>x.path==='current.json').length,1);
  assert.equal(env.files.has('versions/v9.json'),false);assert.equal(env.files.has('versions/unresolved.json'),true);
  assert.deepEqual(await getPreference('sync-pending'),[]);
});
test('清理失败不撤销成功同步并在下次上传重试',async()=>{
  const env=environment();await setPreference('sync-cleanup',['old']);
  const call=(path,method,...rest)=>method==='DELETE'?Promise.resolve({status:500}):env.call(path,method,...rest);
  const first=await uploadVersion({call,remote:null},state());
  assert.equal((await getPreference('sync-base')).id,first.id);assert.deepEqual(await getPreference('sync-cleanup'),['old']);
  await uploadVersion({call:env.call,remote:first,etag:'"1"'},state());assert.deepEqual(await getPreference('sync-cleanup'),[]);
});
test('缺少etag仍留下可恢复的待发布版本',async()=>{
  const env=environment();await assert.rejects(uploadVersion({call:env.call,remote:{id:'old'}},state()),/未提供条件写入/);
  const pending=await getPreference('sync-pending');assert.equal(pending.length,1);
  assert.deepEqual(businessState(await downloadVersion({call:env.call},pending[0])),businessState(state()));
});
test('已存在的同名损坏图片不会被412误认为上传成功',async()=>{
  const env=environment(),local=state();env.files.set('images/'+await fingerprint(local.recipes[0].image)+'.json',JSON.stringify('broken'));
  await assert.rejects(uploadVersion({call:env.call,remote:null},local),/已有图片损坏/);
  assert.equal(env.files.has('current.json'),false);assert.equal(await getPreference('sync-base'),null);
});
test('损坏业务备份在返回可应用状态前被拒绝',()=>{
  assert.throws(()=>validateBackup({...state(),recipes:[{name:'缺失食材步骤'}]}),/菜谱格式/);
  assert.throws(()=>validateBackup({...state(),fridge:[{name:'菜',qty:-1}]}),/库存格式/);
  assert.throws(()=>validateBackup({...state(),weeks:{'2026-09-14':{lunch:'损坏'}}}),/菜单格式/);
  assert.throws(()=>validateBackup({...state(),confirmed:{a:-1}}),/采购份数/);
  assert.throws(()=>validateBackup({format:'other',version:99,state:state()}),/备份格式/);
});
test('旧版数字菜谱ID转独立快照，缺失记录明确标记，新周菜单拒绝ID',()=>{
  const local=state();local.recipes[0].id=1;delete local.archives;local.plan={lunch:[1,99]};
  const imported=validateBackup(local);assert.equal(imported.archives['旧版存档'].lunch[0].name,'菜');
  assert.equal(imported.archives['旧版存档'].lunch[1].missing,true);
  imported.archives['旧版存档'].lunch[0].name='changed';assert.equal(local.recipes[0].name,'菜');
  assert.throws(()=>validateBackup({...state(),weeks:{'2026-09-14':{lunch:[1]}}}),/菜单快照/);
  assert.throws(()=>validateBackup({...local,plan:{lunch:'invalid'}}),/菜单格式/);
});
