import {build} from 'vite';
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';

// 禁用 Vite 的 public 目录整目录复制，只发布明确允许的静态媒体。
// 即使本机存在开发者配置密文，也不能进入公开版输出。
const media=new Set(['.png','.jpg','.jpeg','.webp','.svg','.gif','.ico','.woff','.woff2']);
async function assets(directory='public',prefix='') {
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    if(entry.name.startsWith('.'))continue;
    const file=path.join(directory,entry.name),name=prefix+entry.name;
    if(entry.isDirectory())result.push(...await assets(file,name+'/'));
    else if(entry.isFile()&&media.has(path.extname(entry.name).toLowerCase()))result.push({name,file});
  }
  return result;
}
const built=await build({
  publicDir:false,
  define:{'import.meta.env.VITE_APP_EDITION':JSON.stringify('public')},
  plugins:[{
    name:'public-media-only',
    async buildStart() {
      for(const {name,file} of await assets())this.emitFile({type:'asset',fileName:name,source:await readFile(file)});
    },
  }],
});

// 不依赖构建器清空旧目录；有任何非本轮产物就拒绝继续发布。
const expected=new Set((Array.isArray(built)?built:[built]).flatMap(result=>result.output.map(item=>item.fileName)));
async function checkOutput(directory='dist',prefix='') {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const name=prefix+entry.name;
    if(entry.isDirectory())await checkOutput(path.join(directory,entry.name),name+'/');
    else if(!entry.isFile()||!expected.has(name))throw new Error('公开构建目录含历史或未知产物，请使用干净源码工作区：'+name);
  }
}
await checkOutput();
