import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

const port=18164;
const root=new URL('..',import.meta.url);
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
let worker;
try{
  for(let attempt=0;attempt<30;++attempt){
    try{if((await fetch(`http://127.0.0.1:${port}/darning-simulator/worker.js`)).ok)break;}catch{}
    await sleep(50);
  }
  const source=await readFile(new URL('../darning-simulator/worker.js',import.meta.url),'utf8');
  const wrapper=`
    const {parentPort}=require('node:worker_threads');
    const browserFetch=globalThis.fetch;
    globalThis.fetch=(input,init)=>browserFetch(new URL(String(input),'http://127.0.0.1:${port}/darning-simulator/'),init);
    globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
    parentPort.on('message',data=>globalThis.onmessage?.({data}));
    ${source}
  `;
  worker=new Worker(wrapper,{eval:true});
  const message=type=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`worker ${type} timeout`)),5000);
    const listener=value=>{
      if(value.type==='error'){clearTimeout(timeout);worker.off('message',listener);reject(new Error(value.message));}
      if(value.type===type){clearTimeout(timeout);worker.off('message',listener);resolve(value);}
    };
    worker.on('message',listener);
  });
  const ready=await message('ready');
  assert.equal(ready.build,'2026-08-16.rust-star-2');
  const resultPromise=message('result');
  const config=new Float32Array([
    129,1,.78,0,1.6,0,4.5,.02,
    2,3.2,3,0,1,
    1,8.5,8,0,
    6,1.5,1.4,1.4,.5,-8,48,
  ]);
  const polygon=new Float32Array();
  worker.postMessage({type:'run',id:7,config,polygon},[config.buffer,polygon.buffer]);
  const result=await resultPromise;
  assert.equal(result.id,7);
  assert.equal(result.gridSize,129);
  assert.ok(result.elapsed<200,`worker simulation took ${result.elapsed.toFixed(1)} ms`);
  assert.equal(result.strength.length,129*129);
  assert.ok(result.segmentCount>30);
  const families=Array.from({length:result.segmentCount},(_,index)=>Math.round(result.segments[index*6+4]));
  assert.ok(families.includes(6)&&families.includes(7)&&families.includes(8));
  console.log(`worker smoke passed: ready + ${result.gridSize}² in ${result.elapsed.toFixed(1)} ms`);
}finally{
  await worker?.terminate();
  server.kill('SIGTERM');
}
