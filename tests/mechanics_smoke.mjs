import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';

const mechanicsSource=await readFile(new URL('../darning-simulator/mechanics.js',import.meta.url),'utf8');
const context={console,Float32Array,Float64Array,Int32Array,Uint8Array,Uint16Array,Math,Number,Map,Set,Array,Object};
context.globalThis=context;
vm.runInNewContext(mechanicsSource,context,{filename:'mechanics.js'});
const solve=context.DarningMechanics.solve;
const wasm=await readFile(new URL('../darning-simulator/darning_core.wasm',import.meta.url));
const instance=await WebAssembly.instantiate(wasm,{});
const e=instance.instance.exports;
e.darning_reset();

const geometry=values=>{
  const config=new Float32Array(values);
  new Float32Array(e.memory.buffer,e.darning_config_ptr(),e.darning_config_len()).set(config);
  e.darning_set_polygon_count(0);
  e.darning_run();
  const size=e.darning_grid_size();
  const count=e.darning_segment_count();
  const outlineCount=e.darning_outline_count();
  const copy=(pointer,length)=>new Float32Array(e.memory.buffer,pointer,length).slice();
  return{
    config,gridSize:size,
    damage:copy(e.darning_damage_ptr(),size*size),
    segments:copy(e.darning_segment_ptr(),count*6),
    outline:copy(e.darning_outline_ptr(),outlineCount*2),
    bounds:copy(e.darning_bounds_ptr(),8),
  };
};
const base=(overrides={})=>{
  const values=[
    97,1,.78,0,1.6,0,4.5,.02,
    2,5,3,0,1,
    1,14,8,0,
    3,2,1.2,2.5,.7,0,48,
  ];
  Object.entries(overrides).forEach(([index,value])=>values[Number(index)]=value);
  return values;
};
const run=overrides=>solve(geometry(base(overrides)));
const visibleLength=geometryResult=>Array.from({length:geometryResult.segments.length/6},(_,index)=>{
  const offset=6*index;
  return Math.hypot(geometryResult.segments[offset+2]-geometryResult.segments[offset],geometryResult.segments[offset+3]-geometryResult.segments[offset+1]);
}).reduce((sum,value)=>sum+value,0);

const untouched=run({8:0,12:0,13:0,17:0});
assert.ok(Math.max(...untouched.strength.map(value=>Math.abs(value/untouched.metrics[0]-1)))<2e-3);

const open=run({13:0,17:0});
assert.ok(open.metrics[2]/open.metrics[0]<.55);
assert.ok(open.metrics[1]/open.metrics[0]<.8);

const aligned=run({22:0});
const transverse=run({22:90});
assert.ok(aligned.metrics[2]>transverse.metrics[2]*1.02,`${aligned.metrics[2]} vs ${transverse.metrics[2]}`);

const shortAnchor=run({14:6,15:4});
const longGeometry=geometry(base({14:16,15:10}));
const longAnchor=solve(longGeometry);
assert.ok(longAnchor.metrics[2]>shortAnchor.metrics[2]*1.015,`${longAnchor.metrics[2]} vs ${shortAnchor.metrics[2]}`);
assert.ok(longAnchor.diagnostics.hiddenSegments>0);
assert.ok(longAnchor.metrics[5]>visibleLength(longGeometry));

const weakThread=run({20:.8});
const strongThread=run({20:3.2});
assert.ok(strongThread.metrics[2]>weakThread.metrics[2]);
assert.ok(strongThread.metrics[8]<.12,`boundary error ${strongThread.metrics[8]}`);
assert.ok(strongThread.metrics[9]<2e-4,`residual ${strongThread.metrics[9]}`);

const started=performance.now();
run({0:129,14:16,15:10});
const elapsed=performance.now()-started;
assert.ok(elapsed<500,`129² equilibrium solve took ${elapsed.toFixed(1)} ms`);
console.log(`mechanics smoke passed: continuity, orientation, anchorage, monotonicity; 129² ${elapsed.toFixed(1)} ms`);
