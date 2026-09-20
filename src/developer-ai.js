import {getSecret,setSecret} from './storage.js';

export const developerAvailable=import.meta.env?.VITE_APP_EDITION!=='public';
const SLOT='ai-developer';
const FORMAT='shiguang-developer-ai-v1';
const decode=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
function validate(value) {
  const url=new URL(value.url);
  if(url.protocol!=='https:' || url.username || url.password || url.hash ||
    typeof value.model!=='string' || !value.model.trim() ||
    typeof value.key!=='string' || !value.key.trim())throw new Error('invalid profile');
  return {url:url.href,model:value.model.trim(),key:value.key.trim()};
}
export async function decryptDeveloperProfile(bundle,password) {
  try {
    if(bundle.format!==FORMAT || bundle.iterations!==600000 ||
      decode(bundle.salt).length!==32 || decode(bundle.iv).length!==12 ||
      typeof bundle.ciphertext!=='string' || bundle.ciphertext.length>65536)throw new Error('invalid bundle');
    const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:decode(bundle.salt),iterations:bundle.iterations},material,{name:'AES-GCM',length:256},false,['decrypt']);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(bundle.iv),additionalData:new TextEncoder().encode(FORMAT)},key,decode(bundle.ciphertext));
    return validate(JSON.parse(new TextDecoder().decode(plain)));
  } catch { throw new Error('密码错误或开发者配置已损坏，请检查后重试'); }
}
async function savedProfile() {
  const value=await getSecret(SLOT);
  if(!value)return null;
  try {return validate(JSON.parse(value));}
  catch {throw new Error('开发者配置读取失败，请关闭后重新启用');}
}
const metadata=profile=>profile ? {url:profile.url,model:profile.model,source:'developer'} : null;
export async function getDeveloperConfig() {return developerAvailable ? metadata(await savedProfile()) : null;}
export async function enableDeveloperConfig(password) {
  if(!developerAvailable)throw new Error('公开版请使用个人 AI 配置');
  let bundle;
  try {
    const response=await fetch('/developer-ai-profile.json',{cache:'no-store'});
    if(!response.ok)throw new Error('unavailable');
    bundle=await response.json();
  } catch {throw new Error('此安装包未包含有效的开发者配置，请联系开发者更新安装包');}
  const profile=await decryptDeveloperProfile(bundle,password);
  await setSecret(SLOT,JSON.stringify(profile));
  return metadata(profile);
}
export async function disableDeveloperConfig() {await setSecret(SLOT,'');}
export async function getAIKey(config,enteredKey='') {
  if(config.source!=='developer')return enteredKey.trim() || await getSecret('ai');
  if(!developerAvailable)throw new Error('公开版请使用个人 AI 配置');
  const profile=await savedProfile();
  // 不允许将开发者 Key 发往修改后的个人接口。
  if(!profile || config.url!==profile.url || config.model!==profile.model)throw new Error('开发者配置已变化，请重新打开设置后重试');
  return profile.key;
}
