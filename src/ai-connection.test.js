import test from 'node:test';
import assert from 'node:assert/strict';
import {testAIConnection,resolveAIEndpoint,recognize} from './services.js';
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
  mock(200,body);await assert.rejects(testAIConnection(config,'key'),/接口/);
 }
 mock(200,{choices:[{message:{content:'OK'}}]});
 assert.equal((await testAIConnection(config,'key')).returnedModel,'');
 mock(200,{model:'secret-key',choices:[{message:{content:null,reasoning_content:'Checking'}}]});
 assert.equal((await testAIConnection(config,'secret-key')).returnedModel,'[已隐藏]');
});

test('基础地址补全且完整自定义接口保持原样，识别与测试共用地址规则',async()=>{
 for(const address of ['https://ai.test','https://ai.test/','https://ai.test/v1','https://ai.test/v1/'])assert.equal(resolveAIEndpoint(address),'https://ai.test/v1/chat/completions');
 assert.equal(resolveAIEndpoint('https://ai.test/api/v1/'),'https://ai.test/api/v1/chat/completions');
 assert.equal(resolveAIEndpoint('https://ai.test/custom/chat?version=2'),'https://ai.test/custom/chat?version=2');
 await setSecret('ai','mock-key');
 mock(200,{choices:[{message:{content:'  ```json\n{"items":[]}\n```  '}}]},url=>assert.equal(url,'https://ai.test/v1/chat/completions'));
 assert.deepEqual(await recognize({...config,url:'https://ai.test'},'test','','recipes'),[]);
 mock(200,'<!doctype html><html>dashboard</html>');
 await assert.rejects(recognize(config,'test','','recipes'),/返回了网页/);
 mock(200,{choices:[{message:{content:'not-json'}}]});
 await assert.rejects(recognize(config,'test','','recipes'),/对话正文不是有效 JSON/);
 mock(200,{choices:[{message:{content:'null'}}]});
 await assert.rejects(recognize(config,'test','','recipes'),/条目格式无效/);
});

test('模型停服、图片无正文和网络异常给出可恢复提示，不回显服务商原文',async()=>{
 await setSecret('ai','private-key');
 mock(410,{error:{message:'private-key'}});
 await assert.rejects(testAIConnection(config,'private-key'),e=>e.message.includes('停止服务')&&!e.message.includes('private-key'));
 await assert.rejects(recognize(config,'text','','recipes'),/HTTP 410.*停止服务/);
 mock(200,{choices:[{message:{content:null}}]});
 await assert.rejects(recognize(config,'','data:image/png;base64,AAAA','recipes'),/文本连接测试不能验证视觉能力/);
 globalThis.fetch=async()=>{throw new Error('private-key');};
 await assert.rejects(recognize(config,'text','','recipes'),e=>e.message.includes('超时')&&!e.message.includes('private-key'));
});
