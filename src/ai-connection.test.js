import test from 'node:test';
import assert from 'node:assert/strict';
import {testAIConnection} from './services.js';
import {setSecret,getSecret} from './storage.js';

const config={url:'https://ai.test/v1/chat/completions',model:'test-alias'};
const success={model:'actual-model',choices:[{message:{content:'OK'}}]};
function mock(status,body,check=()=>{}){
 globalThis.fetch=async(url,options)=>{check(url,options);return {status,text:async()=>typeof body==='string'?body:JSON.stringify(body),headers:new Map()};};
}
test('当前输入Key优先，固定短文本实际调用，返回模型名称且不覆盖已保存Key',async()=>{
 await setSecret('ai','saved-key');
 mock(200,success,(url,options)=>{
  assert.equal(url,config.url);assert.equal(options.headers.Authorization,'Bearer entered-key');
  const body=JSON.parse(options.body);
  assert.equal(body.model,'test-alias');assert.equal(body.stream,false);assert.equal(body.max_tokens,32);
  assert.deepEqual(body.messages,[{role:'user',content:'Reply with OK only.'}]);
 });
 const result=await testAIConnection(config,'entered-key');
 assert.equal(result.returnedModel,'actual-model');assert.equal(result.requestedModel,'test-alias');
 assert.equal(await getSecret('ai'),'saved-key');assert.ok(result.elapsedMs>=0);
 mock(200,success,(_,options)=>assert.equal(options.headers.Authorization,'Bearer saved-key'));
 await testAIConnection(config,'');
});
test('缺少模型或Key、错误地址均不发送请求',async()=>{
 await setSecret('ai','');globalThis.fetch=()=>assert.fail('must not send');
 await assert.rejects(testAIConnection(config),/API Key/);
 await assert.rejects(testAIConnection({...config,model:' '}),/模型名称/);
 await assert.rejects(testAIConnection({...config,url:'not-url'}),/HTTPS/);
 await assert.rejects(testAIConnection({...config,url:'https://name:secret@ai.test'}),/不含账号密码/);
});
test('HTTP错误和网络异常不显示服务商原文与凭据',async()=>{
 for(const [status,reason] of [[401,'鉴权'],[403,'权限'],[404,'不存在'],[429,'受限'],[503,'异常']]){
  mock(status,{error:{message:'secret-test-key'}});
  await assert.rejects(testAIConnection(config,'secret-test-key'),e=>e.message.includes(reason)&&!e.message.includes('secret-test-key'));
 }
 globalThis.fetch=async()=>{throw new Error('secret-test-key');};
 await assert.rejects(testAIConnection(config,'secret-test-key'),/^Error: 连接失败/);
});
test('拒绝伪成功或无效格式；无model时不冒充请求模型；模型字段不回显Key',async()=>{
 for(const body of ['<html>login</html>',{}, {error:'failed'}, {choices:[{message:{content:''}}]}]){
  mock(200,body);await assert.rejects(testAIConnection(config,'key'),/接口已响应/);
 }
 mock(200,{choices:[{message:{content:'OK'}}]});
 assert.equal((await testAIConnection(config,'key')).returnedModel,'');
 mock(200,{model:'secret-key',choices:[{message:{content:null,reasoning_content:'Checking'}}]});
 assert.equal((await testAIConnection(config,'secret-key')).returnedModel,'[已隐藏]');
});
