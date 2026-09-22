import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRecognitionDraft,saveRecognitionDraft} from './storage.js';

test('旧混合草稿完整迁移、按任务隔离、失败后幂等恢复且不覆盖目标', async () => {
  const values = new Map();
  let failMarker = true;
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem(key,value) {
      if(key === 'pref:ai-draft:migrated' && failMarker) throw new Error('disk full');
      values.set(key,value);
    },
  };
  const old = {kind:'recipes',text:'原文字',image:'data:image/png;base64,AA==',draft:'[]'};
  values.set('pref:ai-draft',JSON.stringify(old));
  await assert.rejects(loadRecognitionDraft('recipe-image'),/disk full/);
  assert.equal(values.has('pref:ai-draft:migrated'),false);
  await saveRecognitionDraft('recipe-image',{...old,text:'已编辑'});
  failMarker=false;
  assert.equal((await loadRecognitionDraft('recipe-image')).text,'已编辑');
  assert.deepEqual(await loadRecognitionDraft('recipe-text'),{});
  assert.deepEqual(await loadRecognitionDraft('stock'),{});
  assert.deepEqual(JSON.parse(values.get('pref:ai-draft')),old);
  await Promise.all([saveRecognitionDraft('recipe-text',{text:'一'}),saveRecognitionDraft('recipe-text',{text:'二'})]);
  assert.equal((await loadRecognitionDraft('recipe-text')).text,'二');
  values.clear();
  values.set('pref:ai-draft',JSON.stringify({...old,kind:'stock'}));
  assert.equal((await loadRecognitionDraft('stock')).text,old.text);
  assert.deepEqual(await loadRecognitionDraft('recipe-image'),{});
});

test('统一导入合并两份旧草稿且保留原件，重开不重复迁移', async()=>{
  const values=new Map();
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const image={kind:'recipes',image:'data:image/png;base64,AA==',text:'图片备注',draft:JSON.stringify([{name:'图片草稿'}])};
  const text={kind:'recipes',text:'正文草稿',draft:JSON.stringify([{name:'正文结果'}])};
  await saveRecognitionDraft('recipe-image',image);
  await saveRecognitionDraft('recipe-text',text);
  const merged=await loadRecognitionDraft('recipe-import');
  assert.equal(merged.image,image.image);
  assert.equal(merged.text,'图片备注\n\n正文草稿');
  assert.deepEqual(JSON.parse(merged.draft),[{name:'图片草稿'},{name:'正文结果'}]);
  assert.deepEqual(await loadRecognitionDraft('recipe-image'),image);
  assert.deepEqual(await loadRecognitionDraft('recipe-text'),text);
  await saveRecognitionDraft('recipe-import',{text:'新输入',draft:'[]'});
  assert.deepEqual(await loadRecognitionDraft('recipe-import'),{text:'新输入',draft:'[]'});
});
