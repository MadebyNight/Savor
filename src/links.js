import {Readability} from '@mozilla/readability';
import {request} from './storage.js';
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
export async function fetchArticle(input) {
  const match=input.match(/https?:\/\/[^\s<>"，。]+/);if(!match)throw new Error('请粘贴完整链接或包含链接的分享文字');
  const url=new URL(match[0]);if(url.protocol!=='https:')throw new Error('请使用 HTTPS 链接');
  const result=await request({url:url.href,method:'GET',headers:{Accept:'text/html'}});
  if(result.status!==200)throw new Error('正文获取失败（HTTP '+result.status+'），请粘贴文字或截图');
  if(result.data.length>5*1024*1024)throw new Error('页面过大，请粘贴正文');
  return extractArticle(result.data,url.href);
}
