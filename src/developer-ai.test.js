import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,pbkdf2Sync,createCipheriv} from 'node:crypto';
import {decryptDeveloperProfile,enableDeveloperConfig,disableDeveloperConfig,getDeveloperConfig,getAIKey} from './developer-ai.js';
import {setSecret,getSecret} from './storage.js';
import {testAIConnection,recognize} from './services.js';

const password='fixture-password';
const profile={url:'https://developer.test/v1/chat/completions',model:'fixture-model',key:'fixture-developer-key'};
function seal(value=profile) {
  const salt=randomBytes(32),iv=randomBytes(12),format='shiguang-developer-ai-v1',iterations=600000;
  const cipher=createCipheriv('aes-256-gcm',pbkdf2Sync(password,salt,iterations,32,'sha256'),iv);
  cipher.setAAD(Buffer.from(format));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]);
  return {format,iterations,salt:salt.toString('base64'),iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64')};
}
const bundle=seal();
test('正确密码解密，错误密码、篡改和非法接口拒绝且不泄露凭据',async()=>{
  assert.deepEqual(await decryptDeveloperProfile(bundle,password),profile);
  for(const [value,pwd] of [[bundle,'wrong'],[{...bundle,ciphertext:'AAAA'},password],[{...bundle,iterations:1},password],[seal({...profile,url:'http://unsafe.test'}),password]]) {
    await assert.rejects(decryptDeveloperProfile(value,pwd),error=>/密码错误或/.test(error.message)&&!error.message.includes(profile.key));
  }
});
test('开发者配置独立保存；切换、失败和关闭均保留个人凭据',async()=>{
  await setSecret('ai','fixture-personal-key');
  await disableDeveloperConfig();
  globalThis.fetch=async()=>({ok:true,json:async()=>bundle});
  await assert.rejects(enableDeveloperConfig('wrong'));
  assert.equal(await getDeveloperConfig(),null);
  const active=await enableDeveloperConfig(password);
  assert.deepEqual(active,{url:profile.url,model:profile.model,source:'developer'});
  assert.equal(active.key,undefined);
  assert.equal(await getAIKey(active,'ignored-user-key'),profile.key);
  await assert.rejects(getAIKey({...active,url:'https://other.test'}),/配置已变化/);
  await assert.rejects(enableDeveloperConfig('wrong'));
  assert.deepEqual(await getDeveloperConfig(),active);
  assert.equal(await getSecret('ai'),'fixture-personal-key');
  await disableDeveloperConfig();
  assert.equal(await getDeveloperConfig(),null);
  assert.equal(await getAIKey({url:'https://personal.test'}),'fixture-personal-key');
  await assert.rejects(getAIKey(active),/配置已变化/);
});
test('安装包缺失密文时不启用、不更改个人Key',async()=>{
  globalThis.fetch=async()=>({ok:false});
  await assert.rejects(enableDeveloperConfig(password),/未包含有效/);
  assert.equal(await getDeveloperConfig(),null);
});
test('测试与图片识别只将开发者Key发到已解锁接口，个人Key保持原样',async()=>{
  globalThis.fetch=async()=>({ok:true,json:async()=>bundle});
  const config=await enableDeveloperConfig(password);
  let content='OK',calls=0;
  globalThis.fetch=async(url,options)=>{
    calls++;assert.equal(url,profile.url);assert.equal(options.headers.Authorization,'Bearer '+profile.key);
    assert.equal(JSON.parse(options.body).model,profile.model);
    return {status:200,headers:new Map(),text:async()=>JSON.stringify({choices:[{message:{content}}]})};
  };
  await testAIConnection(config,'must-not-override');
  content='{"items":[]}';
  await recognize(config,'','data:image/png;base64,AAAA','stock');
  assert.equal(calls,2);assert.equal(await getSecret('ai'),'fixture-personal-key');
  await disableDeveloperConfig();
});
