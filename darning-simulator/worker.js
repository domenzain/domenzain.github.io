const BUILD='2026-08-16.rust-star-2';
let engine;

const instantiate=async()=>{
  const response=await fetch(`darning_core.wasm?v=${BUILD}`);
  const result=await WebAssembly.instantiateStreaming(response.clone(),{}).catch(async()=>WebAssembly.instantiate(await response.arrayBuffer(),{}));
  engine=result.instance.exports;
  engine.darning_reset();
  postMessage({type:'ready',build:BUILD,bytes:Number(response.headers.get('content-length')??0)});
};

const copy=(pointer,length)=>new Float32Array(engine.memory.buffer,pointer,length).slice();

const run=({id,config,polygon})=>{
  new Float32Array(engine.memory.buffer,engine.darning_config_ptr(),engine.darning_config_len()).set(config);
  const vertices=Math.min(polygon.length/2,engine.darning_polygon_capacity());
  new Float32Array(engine.memory.buffer,engine.darning_polygon_ptr(),2*vertices).set(polygon.subarray(0,2*vertices));
  engine.darning_set_polygon_count(vertices);
  const started=performance.now();
  engine.darning_run();
  const elapsed=performance.now()-started;
  const gridSize=engine.darning_grid_size();
  const segmentCount=engine.darning_segment_count();
  const outlineCount=engine.darning_outline_count();
  const result={
    type:'result',id,elapsed,gridSize,segmentCount,outlineCount,
    strength:copy(engine.darning_strength_ptr(),gridSize*gridSize),
    damage:copy(engine.darning_damage_ptr(),gridSize*gridSize),
    reinforcement:copy(engine.darning_reinforcement_ptr(),gridSize*gridSize),
    segments:copy(engine.darning_segment_ptr(),segmentCount*6),
    outline:copy(engine.darning_outline_ptr(),outlineCount*2),
    metrics:copy(engine.darning_metrics_ptr(),12),
    bounds:copy(engine.darning_bounds_ptr(),8),
  };
  postMessage(result,[result.strength.buffer,result.damage.buffer,result.reinforcement.buffer,result.segments.buffer,result.outline.buffer,result.metrics.buffer,result.bounds.buffer]);
};

onmessage=event=>{
  const message=event.data;
  if(message.type==='run')run(message);
};

instantiate().catch(error=>postMessage({type:'error',message:error instanceof Error?error.message:String(error)}));
