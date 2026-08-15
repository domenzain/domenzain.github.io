import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';

const bytes=await readFile(new URL('../darning-simulator/darning_core.wasm',import.meta.url));
assert.equal(WebAssembly.validate(bytes),true);
assert.ok(bytes.length<100_000,`WASM grew to ${bytes.length} bytes`);
const module=await WebAssembly.compile(bytes);
assert.deepEqual(WebAssembly.Module.imports(module),[]);
const instance=await WebAssembly.instantiate(module,{});
const e=instance.exports;
assert.ok(e.memory instanceof WebAssembly.Memory);
e.darning_reset();
const config=new Float32Array(e.memory.buffer,e.darning_config_ptr(),e.darning_config_len());
config.set([
  129,1,.78,0,1.6,0,4.5,.02,
  2,3.2,3,0,1,
  1,8.5,8,0,
  6,1.5,1.4,1.4,.5,-8,48,
]);
e.darning_set_polygon_count(0);
const started=performance.now();
assert.equal(e.darning_run(),1);
const elapsed=performance.now()-started;
const n=e.darning_grid_size();
const metrics=new Float32Array(e.memory.buffer,e.darning_metrics_ptr(),12);
const segments=new Float32Array(e.memory.buffer,e.darning_segment_ptr(),e.darning_segment_count()*6);
const families=Array.from({length:e.darning_segment_count()},(_,index)=>Math.round(segments[index*6+4]));
assert.equal(n,129);
assert.ok(e.darning_segment_count()>30);
assert.ok(families.includes(6)&&families.includes(7)&&families.includes(8));
assert.ok(metrics[2]>0);
assert.ok(metrics[3]>metrics[0]);
assert.ok(metrics[8]<=.021,`boundary error ${metrics[8]}`);
assert.ok(elapsed<200,`WASM simulation took ${elapsed.toFixed(1)} ms`);
console.log(`wasm smoke passed: ${bytes.length} bytes, ${n}² in ${elapsed.toFixed(1)} ms, ${e.darning_segment_count()} segments`);
