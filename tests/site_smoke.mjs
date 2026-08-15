import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

const port=18163;
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port)},stdio:'ignore'});
try{
  let response;
  for(let attempt=0;attempt<30;++attempt){
    try{response=await fetch(`http://127.0.0.1:${port}/darning-simulator/`);break;}catch{await sleep(50);}
  }
  assert.ok(response?.ok);
  assert.match(response.headers.get('content-type'),/^text\/html/);
  const html=await response.text();
  assert.match(html,/2026-08-16\.rust-star-2/);
  assert.match(html,/Traditional star darn/);
  assert.doesNotMatch(html,/Loading JavaScript model|WASM failed/);
  const assets=await Promise.all(['app.js','worker.js','darning_core.wasm','style.css'].map(path=>fetch(`http://127.0.0.1:${port}/darning-simulator/${path}`)));
  assets.forEach(asset=>assert.equal(asset.ok,true));
  assert.match(assets[0].headers.get('content-type'),/^text\/javascript/);
  assert.match(assets[1].headers.get('content-type'),/^text\/javascript/);
  assert.equal(assets[2].headers.get('content-type'),'application/wasm');
  assert.match(assets[3].headers.get('content-type'),/^text\/css/);
  assert.equal(WebAssembly.validate(await assets[2].arrayBuffer()),true);
  console.log('site smoke passed');
}finally{
  server.kill('SIGTERM');
}
