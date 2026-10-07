import {getPreference,setPreference,isNative,LocalData,request} from './storage.js';
import packageInfo from '../package.json';

export const currentVersion=packageInfo.version;
export const isPublicEdition=import.meta.env?.VITE_APP_EDITION==='public';
const DAILY_KEY='app-update-checked-day';
const AUTO_KEY='app-update-auto-check';
const RELEASE_API='https://api.github.com/repos/MadebyNight/Savor/releases/latest';

export function compareVersions(left,right){
  const parse=value=>/^\d+\.\d+\.\d+$/.test(value||'') ? value.split('.').map(Number) : null;
  const a=parse(left),b=parse(right);
  if(!a||!b)throw new Error('版本号格式无效');
  for(let i=0;i<3;i++)if(a[i]!==b[i])return Math.sign(a[i]-b[i]);
  return 0;
}
export function localDay(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export async function checkedToday(){return await getPreference(DAILY_KEY,'')===localDay();}
export async function markCheckedToday(){await setPreference(DAILY_KEY,localDay());}
export async function autoCheckEnabled(){return await getPreference(AUTO_KEY,true)!==false;}
export async function setAutoCheckEnabled(enabled){await setPreference(AUTO_KEY,!!enabled);}

export async function latestPublicUpdate(){
  const response=await request({url:RELEASE_API,headers:{Accept:'application/vnd.github+json'}});
  if(response.status!==200)throw new Error('暂时无法检查更新，请稍后重试');
  let release;
  try{release=JSON.parse(response.data);}catch{throw new Error('更新信息无法读取');}
  const version=String(release.tag_name||'').replace(/^v/,'');
  compareVersions(version,currentVersion);
  if(release.draft||release.prerelease)return null;
  if(compareVersions(version,currentVersion)<=0)return null;
  const asset=release.assets?.find(item=>item.name===`Savor-v${version}-public.apk`);
  if(!asset||!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||'')||
    asset.browser_download_url!==`https://github.com/MadebyNight/Savor/releases/download/v${version}/${asset.name}`)
    throw new Error('新版安装包或校验值缺失，请稍后重试');
  return {version,url:asset.browser_download_url,sha256:asset.digest.slice(7).toLowerCase()};
}
export async function installPublicUpdate(update,onProgress){
  if(!isNative())throw new Error('请在 Android 应用内更新');
  const listener=await LocalData.addListener('appUpdateProgress',onProgress);
  try{return await LocalData.installAppUpdate(update);}
  finally{try{await listener.remove();}catch{}}
}
