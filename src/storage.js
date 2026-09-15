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
const webSecrets = new Map();
export async function getSecret(key) { return isNative() ? (await LocalData.getSecret({key})).value || '' : webSecrets.get(key) || ''; }
export async function setSecret(key,value) { if (isNative()) await LocalData.setSecret({key,value}); else webSecrets.set(key,value); }
export async function request(options) {
  if (isNative()) return LocalData.request(options);
  const response = await fetch(options.url,{method:options.method || 'GET',headers:options.headers,body:options.body});
  return {status:response.status,data:await response.text(),headers:Object.fromEntries(response.headers)};
}
