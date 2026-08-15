const BUILD='2026-08-16.rust-star-2';
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const controls=Object.fromEntries($$('input[id],select[id]').map(control=>[control.id,control]));
const number=id=>Number(controls[id].value);
const tissueCanvas=$('#tissue-canvas');
const strengthCanvas=$('#strength-canvas');
const status=$('#engine-status');
const drawPolygonButton=$('#draw-polygon');
const finishPolygonButton=$('#finish-polygon');
const drawHint=$('#draw-hint');
const worker=new Worker(new URL(`worker.js?v=${BUILD}`,import.meta.url));

let result;
let ready=false;
let requestId=0;
let displayedId=0;
let timer;
let drawingPolygon=false;
let polygon=[[-11,-7],[12,-7],[13,-1],[6,-1],[6,9],[-12,8],[-9,1]];

const presets={
  base:{'damage-kind':0,'damage-severity':0,'repair-shape':0,'pattern-kind':0,'load-angle':0},
  hole:{'damage-kind':2,'damage-x':5,'damage-y':4,'damage-angle':0,'damage-severity':1,'repair-shape':0,'pattern-kind':0,'load-angle':0,'transfer-length':4.5},
  star:{'damage-kind':2,'damage-x':3.2,'damage-y':3,'damage-angle':0,'damage-severity':1,'repair-shape':1,'repair-x':8.5,'repair-y':8,'repair-angle':0,'pattern-kind':6,'pattern-spacing':1.5,'stitch-length':1.4,'thread-strength':1.4,'thread-width':.5,'pattern-angle':-8,'load-angle':0,'transfer-length':4.5,'grid-size':129},
  darn:{'damage-kind':2,'damage-x':8,'damage-y':5.5,'damage-angle':0,'damage-severity':1,'repair-shape':1,'repair-x':13,'repair-y':10,'repair-angle':0,'pattern-kind':1,'pattern-spacing':1.6,'stitch-length':2.2,'thread-strength':1.8,'thread-width':.75,'pattern-angle':0,'load-angle':0,'transfer-length':5},
  sashiko:{'damage-kind':1,'damage-x':10,'damage-y':7,'damage-angle':-8,'damage-severity':.46,'repair-shape':1,'repair-x':17,'repair-y':13,'repair-angle':-8,'pattern-kind':5,'pattern-spacing':4.8,'stitch-length':2.8,'thread-strength':.72,'thread-width':.45,'pattern-angle':0,'load-angle':12,'transfer-length':6.5},
  tear:{'damage-kind':3,'damage-x':9,'damage-y':1.2,'damage-angle':22,'damage-severity':1,'repair-shape':2,'repair-x':14,'repair-y':8,'repair-angle':22,'pattern-kind':2,'pattern-spacing':2.4,'stitch-length':3.2,'thread-strength':1.55,'thread-width':.65,'pattern-angle':22,'load-angle':0,'transfer-length':5},
};

const configVector=()=>new Float32Array([
  number('grid-size'),number('warp-strength'),number('weft-strength'),number('fabric-angle'),number('base-spacing'),
  number('load-angle'),number('transfer-length'),number('tolerance'),number('damage-kind'),number('damage-x'),
  number('damage-y'),number('damage-angle'),number('damage-severity'),number('repair-shape'),number('repair-x'),
  number('repair-y'),number('repair-angle'),number('pattern-kind'),number('pattern-spacing'),number('stitch-length'),
  number('thread-strength'),number('thread-width'),number('pattern-angle'),48,
]);

const polygonVector=()=>new Float32Array(polygon.flat());

function updateOutputs(){
  $$('output[data-for]').forEach(output=>{
    const input=controls[output.dataset.for];
    const value=Number(input.value);
    const digits=String(input.step??'1').includes('.')?Math.min(2,String(input.step).split('.')[1].length):0;
    output.textContent=output.dataset.format==='percent'
      ?`${(100*value).toFixed(value<.1?1:0)}%`
      :`${value.toFixed(digits)}${output.dataset.unit??''}`;
  });
}

function run(){
  timer=undefined;
  if(!ready)return;
  const config=configVector();
  const customPolygon=polygonVector();
  const id=++requestId;
  status.textContent='Rust/WASM · computing…';
  status.className='engine-status';
  worker.postMessage({type:'run',id,config,polygon:customPolygon},[config.buffer,customPolygon.buffer]);
}

function schedule(){
  updateOutputs();
  clearTimeout(timer);
  timer=setTimeout(run,45);
}

worker.onmessage=event=>{
  const message=event.data;
  if(message.type==='ready'){
    ready=true;
    status.textContent=`Rust/WASM · ${message.build}`;
    status.className='engine-status ready';
    run();
    return;
  }
  if(message.type==='error'){
    status.textContent=`Rust/WASM failed: ${message.message}`;
    status.className='engine-status error';
    return;
  }
  if(message.type==='result'&&message.id>=displayedId){
    displayedId=message.id;
    result=message;
    render();
    status.textContent=`Rust/WASM · ${message.gridSize}² · ${message.elapsed.toFixed(1)} ms`;
    status.className='engine-status ready';
  }
};
worker.onerror=event=>{
  status.textContent=`Worker failed: ${event.message}`;
  status.className='engine-status error';
};

function prepareCanvas(canvas){
  const rect=canvas.getBoundingClientRect();
  const ratio=Math.min(devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*ratio));
  const height=Math.max(1,Math.round(rect.height*ratio));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  return{context:canvas.getContext('2d'),width,height,ratio};
}

function transform(bounds,width,height){
  const[minX,maxX,minY,maxY]=bounds;
  return{
    point:([x,y])=>[width*(x-minX)/(maxX-minX),height*(maxY-y)/(maxY-minY)],
    world:([x,y])=>[minX+x*(maxX-minX)/width,maxY-y*(maxY-minY)/height],
    scale:width/(maxX-minX),
  };
}

function rotate([x,y],degrees){
  const angle=degrees*Math.PI/180;
  const cosine=Math.cos(angle);
  const sine=Math.sin(angle);
  return[cosine*x-sine*y,sine*x+cosine*y];
}

function ellipse(radiusX,radiusY,angle,count=72){
  return Array.from({length:count},(_,index)=>{
    const phase=2*Math.PI*index/count;
    return rotate([radiusX*Math.cos(phase),radiusY*Math.sin(phase)],angle);
  });
}

function capsule(halfLength,radius,angle,count=28){
  const right=Array.from({length:count+1},(_,index)=>{
    const phase=-Math.PI/2+Math.PI*index/count;
    return[halfLength+radius*Math.cos(phase),radius*Math.sin(phase)];
  });
  const left=Array.from({length:count+1},(_,index)=>{
    const phase=Math.PI/2+Math.PI*index/count;
    return[-halfLength+radius*Math.cos(phase),radius*Math.sin(phase)];
  });
  return[...right,...left].map(point=>rotate(point,angle));
}

function damageOutline(){
  const kind=number('damage-kind');
  if(kind===0)return[];
  return kind===3
    ?capsule(number('damage-x'),number('damage-y'),number('damage-angle'))
    :ellipse(number('damage-x'),number('damage-y'),number('damage-angle'));
}

function outlinePoints(){
  if(!result)return[];
  return Array.from({length:result.outlineCount},(_,index)=>[result.outline[2*index],result.outline[2*index+1]]);
}

function trace(context,projection,points,close=true){
  context.beginPath();
  if(points.length===0)return;
  context.moveTo(...projection.point(points[0]));
  points.slice(1).forEach(point=>context.lineTo(...projection.point(point)));
  if(close)context.closePath();
}

function drawWeave(context,projection,bounds,width,height){
  context.fillStyle='#ded2b8';
  context.fillRect(0,0,width,height);
  const angle=number('fabric-angle')*Math.PI/180;
  const warp=[Math.cos(angle),Math.sin(angle)];
  const weft=[-warp[1],warp[0]];
  const spacing=number('base-spacing');
  const diagonal=Math.hypot(bounds[1]-bounds[0],bounds[3]-bounds[2]);
  const centre=[bounds[5],bounds[6]];
  const family=(axis,normal,stroke,lineWidth)=>{
    context.strokeStyle=stroke;
    context.lineWidth=lineWidth;
    context.beginPath();
    for(let offset=Math.floor(-diagonal/spacing)*spacing+.5*spacing;offset<=diagonal;offset+=spacing){
      const centreLine=[centre[0]+normal[0]*offset,centre[1]+normal[1]*offset];
      const start=[centreLine[0]-axis[0]*diagonal,centreLine[1]-axis[1]*diagonal];
      const finish=[centreLine[0]+axis[0]*diagonal,centreLine[1]+axis[1]*diagonal];
      context.moveTo(...projection.point(start));
      context.lineTo(...projection.point(finish));
    }
    context.stroke();
  };
  family(warp,weft,'rgba(88,78,63,.47)',Math.max(.65,projection.scale*.1));
  family(weft,[-warp[0],-warp[1]],'rgba(111,96,74,.38)',Math.max(.6,projection.scale*.09));
}

function segmentEntries(){
  return Array.from({length:result.segmentCount},(_,index)=>{
    const offset=6*index;
    return{
      start:[result.segments[offset],result.segments[offset+1]],
      finish:[result.segments[offset+2],result.segments[offset+3]],
      family:Math.round(result.segments[offset+4]),
      weight:result.segments[offset+5],
    };
  });
}

function drawSegmentSet(context,projection,entries,alpha=1){
  const star=number('pattern-kind')===6;
  const layers=star
    ?[[8,'#b98700',.82],[6,'#d5a300',.96],[7,'#e3b51b',.99]]
    :[[null,'#a62643',.94]];
  context.save();
  context.lineCap='round';
  context.lineJoin='round';
  layers.forEach(([family,stroke,opacity])=>{
    context.strokeStyle=stroke;
    context.globalAlpha=opacity*alpha;
    context.lineWidth=Math.max(1.25,number('thread-width')*projection.scale*(star?1.08:1));
    entries.filter(entry=>family===null||entry.family===family).forEach(entry=>{
      context.beginPath();
      context.moveTo(...projection.point(entry.start));
      context.lineTo(...projection.point(entry.finish));
      context.stroke();
    });
  });
  context.restore();
}

function drawArrow(context,width,ratio){
  const angle=-number('load-angle')*Math.PI/180;
  const length=42*ratio;
  const centre=[width-55*ratio,52*ratio];
  const vector=[Math.cos(angle),Math.sin(angle)];
  const normal=[-vector[1],vector[0]];
  const start=[centre[0]-.5*length*vector[0],centre[1]-.5*length*vector[1]];
  const finish=[centre[0]+.5*length*vector[0],centre[1]+.5*length*vector[1]];
  const head=7*ratio;
  context.save();
  context.strokeStyle=context.fillStyle='rgba(35,31,27,.76)';
  context.lineWidth=1.6*ratio;
  context.beginPath();context.moveTo(...start);context.lineTo(...finish);context.stroke();
  context.beginPath();context.moveTo(...finish);
  context.lineTo(finish[0]-head*vector[0]+.55*head*normal[0],finish[1]-head*vector[1]+.55*head*normal[1]);
  context.lineTo(finish[0]-head*vector[0]-.55*head*normal[0],finish[1]-head*vector[1]-.55*head*normal[1]);
  context.closePath();context.fill();
  context.font=`${10*ratio}px ui-sans-serif,system-ui`;context.textAlign='center';context.fillText('pull',centre[0],centre[1]-18*ratio);
  context.restore();
}

function drawTissue(){
  const{context,width,height,ratio}=prepareCanvas(tissueCanvas);
  const projection=transform(result.bounds,width,height);
  context.clearRect(0,0,width,height);
  drawWeave(context,projection,result.bounds,width,height);
  const damage=damageOutline();
  if(damage.length){
    trace(context,projection,damage);
    context.fillStyle=`rgba(72,56,49,${.22+.62*number('damage-severity')})`;
    context.fill();
    context.strokeStyle='rgba(63,46,42,.75)';context.lineWidth=1.2*ratio;context.stroke();
  }
  const outline=outlinePoints();
  if(outline.length){
    trace(context,projection,outline);
    context.strokeStyle='rgba(69,61,48,.85)';context.lineWidth=1.2*ratio;context.setLineDash([6*ratio,5*ratio]);context.stroke();context.setLineDash([]);
  }
  drawSegmentSet(context,projection,segmentEntries());
  if(number('repair-shape')===3){
    context.fillStyle='#f7f1e4';
    polygon.forEach(point=>{const[x,y]=projection.point(point);context.beginPath();context.arc(x,y,3.7*ratio,0,2*Math.PI);context.fill();context.strokeStyle='#6a273a';context.lineWidth=1.2*ratio;context.stroke();});
  }
  drawArrow(context,width,ratio);
  context.strokeStyle='rgba(50,43,34,.35)';context.lineWidth=ratio;context.strokeRect(.5*ratio,.5*ratio,width-ratio,height-ratio);
}

const mix=(from,to,amount)=>from.map((value,index)=>Math.round(value+(to[index]-value)*Math.max(0,Math.min(1,amount))));
const strengthColor=ratio=>ratio<=1?mix([145,43,36],[242,236,219],ratio):mix([242,236,219],[39,83,121],(ratio-1)/.8);

function drawStrength(){
  const{context,width,height,ratio}=prepareCanvas(strengthCanvas);
  const size=result.gridSize;
  const base=result.metrics[0];
  const image=new ImageData(size,size);
  for(let y=0;y<size;++y)for(let x=0;x<size;++x){
    const source=y*size+x;
    const target=((size-1-y)*size+x)*4;
    const[red,green,blue]=strengthColor(result.strength[source]/base);
    image.data[target]=red;image.data[target+1]=green;image.data[target+2]=blue;image.data[target+3]=255;
  }
  const scratch=document.createElement('canvas');
  scratch.width=scratch.height=size;
  scratch.getContext('2d').putImageData(image,0,0);
  context.clearRect(0,0,width,height);
  context.imageSmoothingEnabled=true;
  context.drawImage(scratch,0,0,width,height);
  const projection=transform(result.bounds,width,height);
  drawSegmentSet(context,projection,segmentEntries(),.24);
  const outline=outlinePoints();
  if(outline.length){trace(context,projection,outline);context.strokeStyle='rgba(35,31,27,.5)';context.lineWidth=1.1*ratio;context.setLineDash([5*ratio,4*ratio]);context.stroke();context.setLineDash([]);}
  drawArrow(context,width,ratio);
  context.strokeStyle='rgba(50,43,34,.35)';context.lineWidth=ratio;context.strokeRect(.5*ratio,.5*ratio,width-ratio,height-ratio);
}

function updateMetrics(){
  const[base,minimum,mean,maximum,radius,thread,weak]=result.metrics;
  const percent=value=>`${Math.round(100*value)}%`;
  $('#metric-mean').textContent=number('damage-kind')===0?'No damage':percent(mean/base);
  $('#metric-min').textContent=percent(minimum/base);
  $('#metric-max').textContent=percent(maximum/base);
  $('#metric-radius').textContent=`${radius.toFixed(1)} mm`;
  $('#metric-thread').textContent=`${thread.toFixed(0)} mm`;
  $('#metric-weak').textContent=percent(weak);
}

function render(){
  if(!result)return;
  drawTissue();
  drawStrength();
  updateMetrics();
}

function applyPreset(name){
  Object.entries(presets[name]).forEach(([id,value])=>controls[id].value=String(value));
  $$('[data-preset]').forEach(button=>button.classList.toggle('active',button.dataset.preset===name));
  drawingPolygon=false;
  tissueCanvas.classList.remove('drawing');
  drawPolygonButton.classList.remove('active');
  finishPolygonButton.disabled=true;
  drawHint.textContent=name==='star'?'Star darn: radial foundation with an over-under woven centre.':'Threads are placed on interstitial channels.';
  schedule();
}

function startPolygon(){
  controls['repair-shape'].value='3';
  polygon=[];
  drawingPolygon=true;
  tissueCanvas.classList.add('drawing');
  drawPolygonButton.classList.add('active');
  finishPolygonButton.disabled=true;
  drawHint.textContent='Click vertices; finish after at least three.';
  schedule();
}

function finishPolygon(){
  if(polygon.length<3)return;
  drawingPolygon=false;
  tissueCanvas.classList.remove('drawing');
  drawPolygonButton.classList.remove('active');
  finishPolygonButton.disabled=true;
  drawHint.textContent='Concave simple polygons are supported.';
  schedule();
}

function addPolygonVertex(event){
  if(!drawingPolygon||!result)return;
  const rect=tissueCanvas.getBoundingClientRect();
  const projection=transform(result.bounds,tissueCanvas.width,tissueCanvas.height);
  polygon.push(projection.world([
    (event.clientX-rect.left)*tissueCanvas.width/rect.width,
    (event.clientY-rect.top)*tissueCanvas.height/rect.height,
  ]));
  finishPolygonButton.disabled=polygon.length<3;
  schedule();
}

$$('input,select').forEach(control=>control.addEventListener(control.tagName==='SELECT'?'change':'input',()=>{
  $$('[data-preset]').forEach(button=>button.classList.remove('active'));
  schedule();
}));
$$('[data-preset]').forEach(button=>button.addEventListener('click',()=>applyPreset(button.dataset.preset)));
drawPolygonButton.addEventListener('click',startPolygon);
finishPolygonButton.addEventListener('click',finishPolygon);
tissueCanvas.addEventListener('click',addPolygonVertex);
window.addEventListener('keydown',event=>{if(event.key==='Enter'&&drawingPolygon)finishPolygon();if(event.key==='Escape'&&drawingPolygon)applyPreset('star');});
new ResizeObserver(()=>requestAnimationFrame(render)).observe($('.workspace'));
updateOutputs();
