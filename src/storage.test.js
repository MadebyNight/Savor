import test from 'node:test';
import assert from 'node:assert/strict';

let stored = JSON.stringify({
  recipes: [
    {id:'lost',name:'失效图片',image:{localImage:'lost.png'},ingredients:[],steps:[]},
    {id:'fine',name:'正常图片',image:{localImage:'fine.png'},ingredients:[],steps:[]},
  ],
  fridge:[{id:'stock',name:'土豆',qty:1,unit:'个'}],
  confirmed:{},confirmedRecipes:[],weeks:{},archives:{},
});
const files = new Map([['fine.png',{mime:'image/png',data:'AA=='}]]);
const prefs = new Map([['ai-draft:migrated',JSON.stringify(true)]]);
const calls = [];
globalThis.androidBridge = {};
globalThis.Capacitor = {
  PluginHeaders:[{name:'LocalData',methods:['loadState','saveState','readImage','saveImage','getPreference','setPreference'].map(name=>({name,rtype:'promise'}))}],
  nativePromise:async (_plugin,method,options) => {
    calls.push(method);
    if(method==='loadState')return {value:stored};
    if(method==='saveState'){stored=options.value;return {};}
    if(method==='readImage'){
      if(!files.has(options.path))throw new Error('file unavailable');
      return files.get(options.path);
    }
    if(method==='saveImage')throw new Error('Existing images must keep their path');
    if(method==='getPreference')return {value:prefs.get(options.key)??null};
    if(method==='setPreference'){prefs.set(options.key,options.value);return {};}
    throw new Error('Unexpected native method: '+method);
  },
};

const {loadState,saveState,loadRecognitionDraft,saveRecognitionDraft,isMissingLocalImage}=await import('./storage.js');
const {backup,validateBackup,recognize}=await import('./services.js');
const {uploadVersion}=await import('./sync.js');

test('单张图片读取失败仍加载其他数据，保存后原路径可恢复',async()=>{
  const state=await loadState();
  assert.equal(state.fridge[0].name,'土豆');
  assert.equal(isMissingLocalImage(state.recipes[0].image),true);
  assert.equal(state.recipes[1].image,'data:image/png;base64,AA==');
  await saveState(state);
  const raw=JSON.parse(stored);
  assert.deepEqual(raw.recipes.map(recipe=>recipe.image),[{localImage:'lost.png'},{localImage:'fine.png'}]);
  assert.equal(calls.includes('saveImage'),false);
  files.set('lost.png',{mime:'image/png',data:'AQ=='});
  const recovered=await loadState();
  assert.equal(recovered.recipes[0].image,'data:image/png;base64,AQ==');
  assert.equal(backup(recovered).state.recipes[0].image,recovered.recipes[0].image);
  files.delete('lost.png');
});

test('图片无法读取时，备份、导入和云端上传在写出前拒绝',async()=>{
  const state=await loadState();
  assert.throws(()=>backup(state),/本地图片暂时无法读取/);
  assert.throws(()=>validateBackup(state),/本地图片暂时无法读取/);
  let networkCalls=0;
  await assert.rejects(uploadVersion({call:async()=>{networkCalls++;return {status:201};}},state),/本地图片暂时无法读取/);
  assert.equal(networkCalls,0);
  const nested={...state,recipes:state.recipes.map(recipe=>({...recipe,image:''})),weeks:{'2026-09-21':{lunch:[state.recipes[0]]}}};
  assert.throws(()=>backup(nested),/本地图片暂时无法读取/);
});

test('识别草稿保留图片路径和文字，失效图片不能发送给 AI',async()=>{
  prefs.set('ai-draft:recipe-image',JSON.stringify({kind:'recipes',text:'番茄炒蛋',image:{localImage:'draft.png'},draft:'[]'}));
  const draft=await loadRecognitionDraft('recipe-image');
  assert.equal(draft.text,'番茄炒蛋');
  assert.equal(isMissingLocalImage(draft.image),true);
  await saveRecognitionDraft('recipe-image',draft);
  assert.deepEqual(JSON.parse(prefs.get('ai-draft:recipe-image')).image,{localImage:'draft.png'});
  const before=calls.length;
  await assert.rejects(recognize({},draft.text,draft.image,'recipes'),/图片暂时无法读取/);
  assert.equal(calls.length,before);
});
