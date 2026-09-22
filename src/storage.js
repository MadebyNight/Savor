import { Capacitor, registerPlugin } from '@capacitor/core';
export const LocalData = registerPlugin('LocalData');
export const isNative = () => Capacitor.isNativePlatform();
let pending = Promise.resolve();
const imageCache = new Map();
async function encodeImages(value) {
  if (Array.isArray(value)) return Promise.all(value.map(encodeImages));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'image' && typeof item === 'string' && item.startsWith('data:image/')) {
        let path = imageCache.get(item);
        if (!path) { const [head, data] = item.split(','); path = (await LocalData.saveImage({data, mime: head.slice(5).split(';')[0]})).path; imageCache.set(item, path); }
        result[key] = {localImage: path};
      } else result[key] = await encodeImages(item);
    }
    return result;
  }
  return value;
}
async function decodeImages(value) {
  if (Array.isArray(value)) return Promise.all(value.map(decodeImages));
  if (value && typeof value === 'object') {
    if (value.localImage) { const image = await LocalData.readImage({path: value.localImage}); const data = `data:${image.mime};base64,${image.data}`; imageCache.set(data, value.localImage); return data; }
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k,v]) => [k,await decodeImages(v)])));
  }
  return value;
}
export async function loadState() {
  const value = isNative() ? (await LocalData.loadState()).value : localStorage.getItem('shiguang-v1');
  return value ? await decodeImages(JSON.parse(value)) : null;
}
export function saveState(state) {
  const snapshot = structuredClone(state);
  const operation = pending.catch(() => {}).then(async () => {
    const value = JSON.stringify(isNative() ? await encodeImages(snapshot) : snapshot);
    if (isNative()) await LocalData.saveState({value}); else localStorage.setItem('shiguang-v1',value);
  });
  pending = operation;
  return operation;
}
export async function getPreference(key, fallback = null) {
  const value = isNative() ? (await LocalData.getPreference({key})).value : localStorage.getItem('pref:' + key);
  return value == null ? fallback : JSON.parse(value);
}
export async function setPreference(key, value) {
  const encoded = JSON.stringify(value);
  if (isNative()) await LocalData.setPreference({key,value:encoded}); else localStorage.setItem('pref:' + key,encoded);
}
let draftPending = Promise.resolve();
export function saveRecognitionDraft(mode, value) {
  const snapshot = structuredClone(value);
  const operation = draftPending.catch(() => {}).then(async () => setPreference('ai-draft:' + mode, isNative() ? await encodeImages(snapshot) : snapshot));
  draftPending = operation;
  return operation;
}
export async function loadRecognitionDraft(mode) {
  await draftPending.catch(() => {});
  if (!(await getPreference('ai-draft:migrated', false))) {
    const old = await getPreference('ai-draft', null);
    if (old) {
      const target = old.kind === 'stock' ? 'stock' : old.image ? 'recipe-image' : 'recipe-text';
      if (await getPreference('ai-draft:' + target, null) === null) await saveRecognitionDraft(target, old);
    }
    await setPreference('ai-draft:migrated', true);
  }
  if (mode === 'recipe-import' && await getPreference('ai-draft:recipe-import', null) === null) {
    const imageDraft = await loadRecognitionDraft('recipe-image');
    const textDraft = await loadRecognitionDraft('recipe-text');
    const drafts = [imageDraft, textDraft];
    const items = drafts.flatMap(value => {
      const parsed = JSON.parse(value.draft || '[]');
      if (!Array.isArray(parsed)) throw new Error('旧版识别草稿格式异常');
      return parsed;
    });
    await saveRecognitionDraft(mode, {
      kind: 'recipes',
      image: imageDraft.image || textDraft.image || '',
      text: [...new Set(drafts.map(value => value.text).filter(Boolean))].join('\n\n'),
      draft: JSON.stringify(items),
    });
  }
  return decodeImages(await getPreference('ai-draft:' + mode, {}));
}
const webSecrets = new Map();
export async function getSecret(key) { return isNative() ? (await LocalData.getSecret({key})).value || '' : webSecrets.get(key) || ''; }
export async function setSecret(key,value) { if (isNative()) await LocalData.setSecret({key,value}); else webSecrets.set(key,value); }
export async function request(options) {
  if (isNative()) return LocalData.request(options);
  const response = await fetch(options.url,{method:options.method || 'GET',headers:options.headers,body:options.body,...(options.redirect?{redirect:options.redirect}:{})});
  return {status:response.status,data:await response.text(),headers:Object.fromEntries(response.headers)};
}
export async function exportBlob(blob,name,share=false) {
  if(isNative()) {
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return LocalData.exportFile({data:btoa(binary),name,mime:blob.type || 'application/octet-stream',share});
  }
  if(share && navigator.canShare?.({files:[new File([blob],name,{type:blob.type})]})) {await navigator.share({files:[new File([blob],name,{type:blob.type})]});return {status:'share-sheet-closed'};}
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return {status:'saved'};
}
