import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPublicPage} from './links.js';

test('公开 GET 跟随跨域及相对重定向，不携带凭据',async()=>{
  const requests=[];
  const responses=[{status:302,headers:{Location:'https://article.test/a'}},{status:307,headers:{location:'../final'}},{status:200,data:'article'}];
  const page=await fetchPublicPage('分享 https://short.test/s',async request=>{requests.push(request);return responses.shift();});
  assert.equal(page.url,'https://article.test/final');assert.equal(page.html,'article');
  for(const request of requests){assert.equal(request.method,'GET');assert.deepEqual(request.headers,{Accept:'text/html'});assert.equal(request.redirect,'manual');}
});
test('不请求跳转到 HTTP、含凭据地址、循环或无限跳转',async()=>{
  for(const location of ['http://bad.test','https://user:secret@bad.test','https://short.test/']) {
    let count=0;await assert.rejects(fetchPublicPage('https://short.test/',async()=>{count++;return {status:302,headers:{location}};}),/HTTPS|账号密码|循环/);assert.equal(count,1);
  }
  let count=0;await assert.rejects(fetchPublicPage('https://short.test/',async()=>({status:302,headers:{location:'/'+(++count)}})),/次数过多/);assert.equal(count,6);
});
test('缺少跳转地址、错误状态、过大页面均明确失败',async()=>{
  for(const [response,error] of [[{status:302},/缺少目标/],[{status:403},/HTTP 403/],[{status:200,data:'x'.repeat(5*1024*1024+1)},/页面过大/]]) {
    await assert.rejects(fetchPublicPage('https://short.test/',async()=>response),error);
  }
});
