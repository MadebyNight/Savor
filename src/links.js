import {Readability} from '@mozilla/readability';
import {request,isNative} from './storage.js';
export function extractArticle(html,url) {
  const document=new DOMParser().parseFromString(html,'text/html');
  const base=document.createElement('base');base.href=url;document.head.prepend(base);
  const metadata=document.querySelector('meta[name="description"],meta[property="og:description"]')?.getAttribute('content')?.trim() || '';
  const title=document.title || '';
  const article=new Readability(document,{charThreshold:80,maxElemsToParse:40000}).parse();
  let text=article?.textContent?.trim() || '';
  if(metadata.length>text.length)text=metadata;
  if(text.length<20 || /^(登录|扫码|安全验证|页面不存在|访问异常|小红书[\s-]*你的生活指南)/.test(text))throw new Error('没有取得可用正文，请粘贴原文或上传截图');
  return {title:article?.title || title,text};
}
function publicURL(value,base) {
  let url;
  try {url=new URL(value,base);}catch{throw new Error('链接地址无效，请重新复制完整链接');}
  if(url.protocol!=='https:')throw new Error('请使用 HTTPS 链接');
  if(url.username || url.password)throw new Error('不要在公开链接中填写账号密码');
  url.hash='';
  return url;
}
export async function fetchPublicPage(input,send=request) {
  const match=input.match(/https?:\/\/[^\s<>"，。]+/);if(!match)throw new Error('请粘贴完整链接或包含链接的分享文字');
  let url=publicURL(match[0]);const visited=new Set();
  for(let hop=0;hop<=5;hop++) {
    if(visited.has(url.href))throw new Error('链接发生循环跳转，请粘贴正文或截图');
    visited.add(url.href);
    // 只有公开 GET 沿跳转获取正文；不更改 AI/WebDAV 带凭据请求的跳转策略。
    const headers={Accept:'text/html'};
    // 与手机浏览器一致地请求公开移动页面，避免被分流到无正文的通用页面。
    if(isNative() && globalThis.navigator?.userAgent)headers['User-Agent']=navigator.userAgent.replace('; wv','').replace('Version/4.0 ','');
    const result=await send({url:url.href,method:'GET',headers,redirect:'manual'});
    if([301,302,303,307,308].includes(result.status)) {
      const location=Object.entries(result.headers||{}).find(([key])=>key.toLowerCase()==='location')?.[1];
      if(!location)throw new Error('链接跳转缺少目标地址，请粘贴正文或截图');
      url=publicURL(location,url.href);continue;
    }
    if(result.status===0)throw new Error('当前预览环境无法读取跨站跳转，请在 Android 应用中获取正文');
    if(result.status!==200)throw new Error('正文获取失败（HTTP '+result.status+'），请粘贴文字或截图');
    if(typeof result.data!=='string' || result.data.length>5*1024*1024)throw new Error('页面过大或内容无效，请粘贴正文');
    return {html:result.data,url:url.href};
  }
  throw new Error('链接跳转次数过多，请粘贴正文或截图');
}
export async function fetchArticle(input) {
  const page=await fetchPublicPage(input);
  return extractArticle(page.html,page.url);
}
