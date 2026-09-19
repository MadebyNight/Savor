import {getPreference,setPreference,getSecret,request} from './storage.js';
import {businessState,validateBackup} from './services.js';
export const defaultDAV={url:'https://dav.jianguoyun.com/dav/',username:''};
export async function fingerprint(value) { const bytes=new TextEncoder().encode(JSON.stringify(value));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join(''); }
async function splitImages(value,images) {
  if(Array.isArray(value))return Promise.all(value.map(v=>splitImages(v,images)));
  if(value && typeof value==='object') {const output={};for(const [k,v] of Object.entries(value)) {if(k==='image' && typeof v==='string' && v.startsWith('data:image/')){const id=await fingerprint(v);images[id]=v;output[k]={syncImage:id};}else output[k]=await splitImages(v,images);}return output;}
  return value;
}
async function joinImages(value,get) {
  if(Array.isArray(value))return Promise.all(value.map(v=>joinImages(v,get)));
  if(value && typeof value==='object') {if(value.syncImage){const image=await get(value.syncImage);if(typeof image!=='string' || !image.startsWith('data:image/'))throw new Error('图片内容无效，未应用云端数据');return image;}return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await joinImages(v,get)])));}return value;
}
function credentials(config,password){const bytes=new TextEncoder().encode(config.username+':'+password);return 'Basic '+btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));}
export async function davClient(config) {
  const password=await getSecret('dav');if(!password || !config.username)throw new Error('请先保存坚果云账号和应用密码');
  const root=config.url.replace(/\/+$/,'')+'/食光/';const auth=credentials(config,password);
  const call=async(path,method='GET',body,headers={})=>request({url:encodeURI(root)+path,method,body,headers:{Authorization:auth,...headers}});
  return call;
}
function assertResponse(res){if(res.status<200 || res.status>=300)throw new Error('网盘请求失败（HTTP '+res.status+'），本地数据保留');}
export async function inspectSync(config,state) {
  const call=await davClient(config);
  const mk=await call('','MKCOL');if(![201,405].includes(mk.status))assertResponse(mk);
  const response=await call('current.json');
  if(response.status!==404)assertResponse(response);
  const remote=response.status===404?null:JSON.parse(response.data);
  const scope=JSON.stringify([config.url.replace(/\/+$/,''),config.username.trim()]);
  const savedBase=await getPreference('sync-base');
  const base=savedBase?.scope && savedBase.scope!==scope?null:savedBase;
  const hash=await fingerprint(businessState(state));
  const localChanged=!base || base.hash!==hash;
  const remoteChanged=remote && remote.id!==base?.id;
  let action= !remote?'upload':(!base?'choose':(localChanged && remoteChanged?'choose':remoteChanged?'download':localChanged?'upload':'equal'));
  return {action,remote,etag:response.headers.etag,hash,call,scope,trustedBase:base?.scope===scope};
}
export async function downloadVersion(context,version=context.remote) {
  if(!version?.id)throw new Error('没有可恢复的云端版本');
  const response=await context.call('versions/'+version.id+'.json');assertResponse(response);
  const packed=JSON.parse(response.data);
  if(await fingerprint(packed.state)!==packed.hash)throw new Error('云端数据校验失败，当前数据保留');
  const cache=new Map();
  const state=await joinImages(packed.state,async id=>{if(cache.has(id))return cache.get(id);const r=await context.call('images/'+id+'.json');assertResponse(r);const image=JSON.parse(r.data);if(await fingerprint(image)!==id)throw new Error('图片校验失败，未应用云端数据');cache.set(id,image);return image;});
  return validateBackup(state);
}
export async function uploadVersion(context,state) {
  for(const path of ['versions/','images/']){const r=await context.call(path,'MKCOL');if(![201,405].includes(r.status))assertResponse(r);}
  const images={};const packedState=await splitImages(businessState(state),images);
  for(const [id,data] of Object.entries(images)){
    const path='images/'+id+'.json';const r=await context.call(path,'PUT',JSON.stringify(data),{'Content-Type':'application/json','If-None-Match':'*'});
    if(r.status===412){const existing=await context.call(path);assertResponse(existing);if(await fingerprint(JSON.parse(existing.data))!==id)throw new Error('云端已有图片损坏，未发布新版本');}else assertResponse(r);
  }
  let device=await getPreference('device-id');if(!device){device=crypto.randomUUID();await setPreference('device-id',device);}
  const version={id:crypto.randomUUID(),time:new Date().toISOString(),device,recipes:state.recipes.length,stock:state.fridge.length};
  const payload={state:packedState,hash:await fingerprint(packedState)};
  const pending=await getPreference('sync-pending',[]);
  await setPreference('sync-pending',[...pending,version]);
  assertResponse(await context.call('versions/'+version.id+'.json','PUT',JSON.stringify(payload),{'Content-Type':'application/json','If-None-Match':'*'}));
  if(context.remote && !context.etag)throw new Error('网盘未提供条件写入版本标识，已保留新版本副本，未覆盖云端入口');
  const versions=[version,...(context.remote?.versions || (context.remote?[{id:context.remote.id,time:context.remote.time,device:context.remote.device}]:[]))].slice(0,10);
  const manifest={...version,versions};
  const result=await context.call('current.json','PUT',JSON.stringify(manifest),{'Content-Type':'application/json',...(context.remote?{'If-Match':context.etag}:{'If-None-Match':'*'})});
  if(result.status===412)throw new Error('另一设备刚刚修改了云端；新版本副本已保留，请重新同步');assertResponse(result);
  await setPreference('sync-base',{id:version.id,hash:await fingerprint(businessState(state)),time:version.time,scope:context.scope});
  await setPreference('sync-pending',(await getPreference('sync-pending',[])).filter(item=>item.id!==version.id));
  const retained=new Set(versions.map(item=>item.id));
  const protectedIds=new Set((await getPreference('sync-pending',[])).map(item=>item.id));
  const cleanup=[...new Set([...(await getPreference('sync-cleanup',[])),...(context.remote?.versions || []).filter(item=>!retained.has(item.id)).map(item=>item.id)])].filter(id=>!retained.has(id)&&!protectedIds.has(id));
  const failed=[];
  for(const id of cleanup){try{const response=await context.call('versions/'+id+'.json','DELETE');if(response.status!==404)assertResponse(response);}catch{failed.push(id);}}
  await setPreference('sync-cleanup',failed);
  return manifest;
}
export async function recordDownload(version,state,scope){await setPreference('sync-base',{id:version.id,hash:await fingerprint(businessState(state)),time:new Date().toISOString(),scope});}
