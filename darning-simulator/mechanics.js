(()=>{
'use strict';

const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const dot=(left,right)=>left[0]*right[0]+left[1]*right[1];
const length=vector=>Math.hypot(vector[0],vector[1]);
const mix=(left,right,amount)=>[left[0]+amount*(right[0]-left[0]),left[1]+amount*(right[1]-left[1])];
const pointInPolygon=(point,polygon)=>polygon.reduce((inside,current,index)=>{
  const previous=polygon[(index+polygon.length-1)%polygon.length];
  const crosses=(current[1]>point[1])!==(previous[1]>point[1]);
  const intersection=(previous[0]-current[0])*(point[1]-current[1])/(previous[1]-current[1]+1e-20)+current[0];
  return crosses&&point[0]<intersection?!inside:inside;
},false);
const segmentDistance=(point,start,finish)=>{
  const delta=[finish[0]-start[0],finish[1]-start[1]];
  const amount=clamp(((point[0]-start[0])*delta[0]+(point[1]-start[1])*delta[1])/Math.max(1e-20,dot(delta,delta)),0,1);
  return Math.hypot(point[0]-start[0]-amount*delta[0],point[1]-start[1]-amount*delta[1]);
};
const polygonPoints=flat=>Array.from({length:flat.length/2},(_,index)=>[flat[2*index],flat[2*index+1]]);
const segmentObjects=flat=>Array.from({length:flat.length/6},(_,index)=>{
  const offset=6*index;
  const start=[flat[offset],flat[offset+1]];
  const finish=[flat[offset+2],flat[offset+3]];
  const delta=[finish[0]-start[0],finish[1]-start[1]];
  const segmentLength=length(delta);
  return{start,finish,tangent:[delta[0]/segmentLength,delta[1]/segmentLength],length:segmentLength,family:Math.round(flat[offset+4]),weight:flat[offset+5],hidden:false};
}).filter(segment=>Number.isFinite(segment.length)&&segment.length>1e-5);

function hiddenUnderpasses(segments,config,outline){
  const pattern=Math.round(config[17]);
  if(![2,3,4,5].includes(pattern))return[];
  const lineTolerance=Math.max(.18*config[4],.08);
  const groups=new Map();
  segments.forEach(segment=>{
    const reversed=segment.tangent[0]<-1e-6||(Math.abs(segment.tangent[0])<=1e-6&&segment.tangent[1]<0);
    const tangent=reversed?[-segment.tangent[0],-segment.tangent[1]]:segment.tangent;
    const start=reversed?segment.finish:segment.start;
    const finish=reversed?segment.start:segment.finish;
    const normal=[-tangent[1],tangent[0]];
    const midpoint=mix(start,finish,.5);
    const angleBin=Math.round(Math.atan2(tangent[1],tangent[0])/.025);
    const offsetBin=Math.round(dot(midpoint,normal)/lineTolerance);
    const key=`${segment.family}:${angleBin}:${offsetBin}`;
    const entry={...segment,start,finish,tangent,alongStart:dot(start,tangent),alongFinish:dot(finish,tangent)};
    groups.set(key,[...(groups.get(key)??[]),entry]);
  });
  const maximumGap=Math.max(2.8*config[19],2.2*config[18],1.5*config[4]);
  return[...groups.values()].flatMap(group=>{
    const ordered=[...group].sort((left,right)=>left.alongStart-right.alongStart);
    return ordered.slice(1).flatMap((current,index)=>{
      const previous=ordered[index];
      const gap=current.alongStart-previous.alongFinish;
      const samples=[.2,.5,.8].map(amount=>mix(previous.finish,current.start,amount));
      const inside=outline.length<3||samples.every(point=>pointInPolygon(point,outline));
      const delta=[current.start[0]-previous.finish[0],current.start[1]-previous.finish[1]];
      const connectorLength=length(delta);
      return gap>.03&&gap<maximumGap&&inside&&connectorLength<1.15*maximumGap?[{
        start:previous.finish,
        finish:current.start,
        tangent:[delta[0]/connectorLength,delta[1]/connectorLength],
        length:connectorLength,
        family:current.family,
        weight:.62*Math.min(previous.weight,current.weight),
        hidden:true,
      }]:[];
    });
  });
}

class UnionFind{
  constructor(size){this.parent=Int32Array.from({length:size},(_,index)=>index);this.rank=new Uint8Array(size);}
  find(value){
    let root=value;
    while(this.parent[root]!==root)root=this.parent[root];
    let current=value;
    while(this.parent[current]!==current){const next=this.parent[current];this.parent[current]=root;current=next;}
    return root;
  }
  union(left,right){
    const a=this.find(left),b=this.find(right);
    if(a===b)return;
    const [root,child]=this.rank[a]>=this.rank[b]?[a,b]:[b,a];
    this.parent[child]=root;
    if(this.rank[a]===this.rank[b])this.rank[root]++;
  }
}

const fieldSampler=(field,size,bounds)=>point=>{
  const gx=clamp((point[0]-bounds[0])/bounds[4],0,size-1);
  const gy=clamp((point[1]-bounds[2])/bounds[4],0,size-1);
  const x=Math.min(size-2,Math.floor(gx));
  const y=Math.min(size-2,Math.floor(gy));
  const tx=gx-x,ty=gy-y;
  const index=(px,py)=>py*size+px;
  return(1-tx)*(1-ty)*field[index(x,y)]+tx*(1-ty)*field[index(x+1,y)]+(1-tx)*ty*field[index(x,y+1)]+tx*ty*field[index(x+1,y+1)];
};

function anchoredSegments(segments,config,damage,size,bounds){
  const epsilon=Math.max(.22*config[4],.45*bounds[4]);
  const star=Math.round(config[17])===6;
  const key=point=>star&&Math.hypot(...point)<.28*config[18]?'star:center':`${Math.round(point[0]/epsilon)}:${Math.round(point[1]/epsilon)}`;
  const nodeIds=new Map();
  const nodePoints=[];
  const nodeFor=point=>{
    const nodeKey=key(point);
    if(!nodeIds.has(nodeKey)){nodeIds.set(nodeKey,nodePoints.length);nodePoints.push(point);}
    return nodeIds.get(nodeKey);
  };
  const edges=segments.map(segment=>({...segment,startNode:nodeFor(segment.start),finishNode:nodeFor(segment.finish)}));
  const union=new UnionFind(nodePoints.length);
  edges.forEach(edge=>union.union(edge.startNode,edge.finishNode));
  const degrees=new Uint16Array(nodePoints.length);
  edges.forEach(edge=>{degrees[edge.startNode]++;degrees[edge.finishNode]++;});
  const sampleDamage=fieldSampler(damage,size,bounds);
  const stats=new Map();
  edges.forEach(edge=>{
    const root=union.find(edge.startNode);
    const samples=Array.from({length:7},(_,index)=>sampleDamage(mix(edge.start,edge.finish,index/6)));
    const soundFraction=samples.reduce((sum,value)=>sum+(1-clamp(value,0,1)),0)/samples.length;
    const current=stats.get(root)??{length:0,soundLength:0,anchorEnds:0,families:new Set()};
    current.length+=edge.length;
    current.soundLength+=edge.length*soundFraction;
    current.families.add(edge.family);
    stats.set(root,current);
  });
  nodePoints.forEach((point,node)=>{
    const root=union.find(node);
    const current=stats.get(root);
    if(current&&degrees[node]===1&&sampleDamage(point)<.28)current.anchorEnds++;
  });
  const transferLength=Math.max(.3,config[6]);
  const componentAnchor=new Map([...stats].map(([root,stat])=>{
    const topology=stat.anchorEnds>=2?1:stat.anchorEnds===1?.55:.32;
    const embedment=1-Math.exp(-stat.soundLength/(2*transferLength));
    return[root,clamp(topology*embedment,.025,1)];
  }));
  const spokeAnchor=Math.max(0,...edges.filter(edge=>edge.family===6).map(edge=>componentAnchor.get(union.find(edge.startNode))??0));
  return edges.map(edge=>{
    const root=union.find(edge.startNode);
    const inherited=star&&[7,8].includes(edge.family)?.68*spokeAnchor:0;
    return{...edge,anchor:Math.max(componentAnchor.get(root)??.025,inherited)};
  });
}

function materialTensors(config,damage,segments,size,bounds){
  const cells=size*size;
  const angle=config[3]*Math.PI/180;
  const warp=[Math.cos(angle),Math.sin(angle)];
  const weft=[-warp[1],warp[0]];
  const baseTensor=[
    config[1]*warp[0]*warp[0]+config[2]*weft[0]*weft[0],
    config[1]*warp[0]*warp[1]+config[2]*weft[0]*weft[1],
    config[1]*warp[1]*warp[1]+config[2]*weft[1]*weft[1],
  ];
  const kxx=new Float64Array(cells),kxy=new Float64Array(cells),kyy=new Float64Array(cells);
  const sxx=new Float64Array(cells),sxy=new Float64Array(cells),syy=new Float64Array(cells);
  const threadXx=new Float64Array(cells),threadXy=new Float64Array(cells),threadYy=new Float64Array(cells);
  damage.forEach((value,index)=>{
    const retention=.002+.998*(1-clamp(value,0,1));
    kxx[index]=sxx[index]=retention*baseTensor[0];
    kxy[index]=sxy[index]=retention*baseTensor[1];
    kyy[index]=syy[index]=retention*baseTensor[2];
  });
  const threadWidth=Math.max(.05,config[21]);
  const sigma=Math.max(threadWidth/2.355,.42*bounds[4]);
  const radius=2.7*sigma;
  const lineScale=config[20]*threadWidth/Math.max(.2,config[4]);
  segments.forEach(segment=>{
    const capacity=lineScale*segment.weight*segment.anchor;
    const stiffness=.72*capacity;
    const minX=Math.max(0,Math.floor((Math.min(segment.start[0],segment.finish[0])-radius-bounds[0])/bounds[4]));
    const maxX=Math.min(size-1,Math.ceil((Math.max(segment.start[0],segment.finish[0])+radius-bounds[0])/bounds[4]));
    const minY=Math.max(0,Math.floor((Math.min(segment.start[1],segment.finish[1])-radius-bounds[2])/bounds[4]));
    const maxY=Math.min(size-1,Math.ceil((Math.max(segment.start[1],segment.finish[1])+radius-bounds[2])/bounds[4]));
    for(let y=minY;y<=maxY;++y)for(let x=minX;x<=maxX;++x){
      const cell=y*size+x;
      const point=[bounds[0]+x*bounds[4],bounds[2]+y*bounds[4]];
      const distance=segmentDistance(point,segment.start,segment.finish);
      if(distance>radius)continue;
      const profile=Math.exp(-.5*distance*distance/(sigma*sigma));
      const xx=profile*segment.tangent[0]*segment.tangent[0];
      const xy=profile*segment.tangent[0]*segment.tangent[1];
      const yy=profile*segment.tangent[1]*segment.tangent[1];
      threadXx[cell]+=capacity*xx;threadXy[cell]+=capacity*xy;threadYy[cell]+=capacity*yy;
      kxx[cell]+=stiffness*xx;kxy[cell]+=stiffness*xy;kyy[cell]+=stiffness*yy;
      sxx[cell]+=capacity*xx;sxy[cell]+=capacity*xy;syy[cell]+=capacity*yy;
    }
  });
  return{baseTensor,kxx,kxy,kyy,sxx,sxy,syy,threadXx,threadXy,threadYy};
}

function assemble(size,cell,tensors){
  const cells=size*size;
  const diagonal=new Float64Array(cells);
  const east=new Float64Array(cells),north=new Float64Array(cells),northEast=new Float64Array(cells),northWest=new Float64Array(cells);
  const addEdge=(left,right,value)=>{
    const a=Math.min(left,right),b=Math.max(left,right),delta=b-a;
    if(delta===1)east[a]+=value;
    else if(delta===size)north[a]+=value;
    else if(delta===size+1)northEast[a]+=value;
    else if(delta===size-1)northWest[a]+=value;
    else throw new Error(`unsupported finite-element edge ${delta}`);
  };
  const triangle=(nodes,coordinates)=>{
    const [p0,p1,p2]=coordinates;
    const twiceArea=(p1[0]-p0[0])*(p2[1]-p0[1])-(p2[0]-p0[0])*(p1[1]-p0[1]);
    const area=Math.abs(twiceArea)/2;
    const gradients=[
      [(p1[1]-p2[1])/twiceArea,(p2[0]-p1[0])/twiceArea],
      [(p2[1]-p0[1])/twiceArea,(p0[0]-p2[0])/twiceArea],
      [(p0[1]-p1[1])/twiceArea,(p1[0]-p0[0])/twiceArea],
    ];
    const average=name=>(tensors[name][nodes[0]]+tensors[name][nodes[1]]+tensors[name][nodes[2]])/3;
    const kxx=average('kxx'),kxy=average('kxy'),kyy=average('kyy');
    const coefficient=(left,right)=>area*(
      kxx*gradients[left][0]*gradients[right][0]
      +kxy*(gradients[left][0]*gradients[right][1]+gradients[left][1]*gradients[right][0])
      +kyy*gradients[left][1]*gradients[right][1]
    );
    [0,1,2].forEach(local=>diagonal[nodes[local]]+=coefficient(local,local));
    [[0,1],[0,2],[1,2]].forEach(([left,right])=>addEdge(nodes[left],nodes[right],coefficient(left,right)));
  };
  for(let y=0;y<size-1;++y)for(let x=0;x<size-1;++x){
    const p00=y*size+x,p10=p00+1,p01=p00+size,p11=p01+1;
    if((x+y)%2===0){
      triangle([p00,p10,p11],[[x*cell,y*cell],[(x+1)*cell,y*cell],[(x+1)*cell,(y+1)*cell]]);
      triangle([p00,p11,p01],[[x*cell,y*cell],[(x+1)*cell,(y+1)*cell],[x*cell,(y+1)*cell]]);
    }else{
      triangle([p00,p10,p01],[[x*cell,y*cell],[(x+1)*cell,y*cell],[x*cell,(y+1)*cell]]);
      triangle([p10,p11,p01],[[(x+1)*cell,y*cell],[(x+1)*cell,(y+1)*cell],[x*cell,(y+1)*cell]]);
    }
  }
  const boundary=Array.from({length:cells},(_,index)=>{
    const x=index%size,y=Math.floor(index/size);
    return x===0||y===0||x===size-1||y===size-1;
  });
  const apply=(input,output)=>{
    output.fill(0);
    for(let index=0;index<cells;++index)output[index]=diagonal[index]*input[index];
    const distribute=(coefficients,offset)=>{
      for(let index=0;index<cells-offset;++index){
        const value=coefficients[index];
        if(value===0)continue;
        output[index]+=value*input[index+offset];
        output[index+offset]+=value*input[index];
      }
    };
    distribute(east,1);distribute(north,size);distribute(northEast,size+1);distribute(northWest,size-1);
    boundary.forEach((isBoundary,index)=>{if(isBoundary)output[index]=0;});
  };
  return{diagonal,boundary,apply};
}

function solveEquilibrium(config,size,bounds,tensors){
  const cells=size*size;
  const loadAngle=config[5]*Math.PI/180;
  const load=[Math.cos(loadAngle),Math.sin(loadAngle)];
  const farField=Float64Array.from({length:cells},(_,index)=>{
    const x=index%size,y=Math.floor(index/size);
    return load[0]*(bounds[0]+x*bounds[4])+load[1]*(bounds[2]+y*bounds[4]);
  });
  const operator=assemble(size,bounds[4],tensors);
  const applied=new Float64Array(cells);
  operator.apply(farField,applied);
  const correction=new Float64Array(cells);
  const residual=Float64Array.from(applied,(value,index)=>operator.boundary[index]?0:-value);
  const preconditioned=Float64Array.from(residual,(value,index)=>operator.boundary[index]?0:value/Math.max(1e-12,operator.diagonal[index]));
  const direction=new Float64Array(preconditioned);
  const action=new Float64Array(cells);
  const inner=(left,right)=>left.reduce((sum,value,index)=>sum+(operator.boundary[index]?0:value*right[index]),0);
  let rz=inner(residual,preconditioned);
  const initial=Math.max(1e-30,rz);
  const maximum=Math.max(64,Math.min(180,Math.round(config[23]*2.5)));
  let completed=0;
  for(let iteration=0;iteration<maximum&&rz/initial>1e-12;++iteration){
    operator.apply(direction,action);
    const denominator=inner(direction,action);
    if(Math.abs(denominator)<1e-30)break;
    const alpha=rz/denominator;
    for(let index=0;index<cells;++index)if(!operator.boundary[index]){
      correction[index]+=alpha*direction[index];
      residual[index]-=alpha*action[index];
      preconditioned[index]=residual[index]/Math.max(1e-12,operator.diagonal[index]);
    }
    const next=inner(residual,preconditioned);
    const beta=next/Math.max(1e-30,rz);
    for(let index=0;index<cells;++index)if(!operator.boundary[index])direction[index]=preconditioned[index]+beta*direction[index];
    rz=next;completed=iteration+1;
  }
  const displacement=Float64Array.from(farField,(value,index)=>value+correction[index]);
  return{displacement,load,residual:Math.sqrt(Math.max(0,rz/initial)),iterations:completed};
}

const weightedQuantile=(entries,quantile)=>{
  if(entries.length===0)return 1;
  const ordered=[...entries].sort((left,right)=>left[0]-right[0]);
  const total=ordered.reduce((sum,entry)=>sum+entry[1],0);
  const target=quantile*total;
  let cumulative=0;
  return ordered.find(entry=>(cumulative+=entry[1])>=target)?.[0]??ordered.at(-1)[0];
};

function evaluate(config,size,bounds,damage,segments,tensors,equilibrium){
  const cells=size*size;
  const base=tensors.baseTensor[0]*equilibrium.load[0]**2+2*tensors.baseTensor[1]*equilibrium.load[0]*equilibrium.load[1]+tensors.baseTensor[2]*equilibrium.load[1]**2;
  const strength=new Float32Array(cells),reinforcement=new Float32Array(cells);
  const reserve=new Float64Array(cells);
  const gradient=(index,axis)=>{
    const x=index%size,y=Math.floor(index/size),h=bounds[4],field=equilibrium.displacement;
    if(axis===0){
      const left=y*size+Math.max(0,x-1),right=y*size+Math.min(size-1,x+1);
      return(field[right]-field[left])/(h*(x===0||x===size-1?1:2));
    }
    const below=Math.max(0,y-1)*size+x,above=Math.min(size-1,y+1)*size+x;
    return(field[above]-field[below])/(h*(y===0||y===size-1?1:2));
  };
  for(let index=0;index<cells;++index){
    const ux=gradient(index,0),uy=gradient(index,1);
    const qx=tensors.kxx[index]*ux+tensors.kxy[index]*uy;
    const qy=tensors.kxy[index]*ux+tensors.kyy[index]*uy;
    const determinant=Math.max(1e-14,tensors.sxx[index]*tensors.syy[index]-tensors.sxy[index]**2);
    const energy=(tensors.syy[index]*qx*qx-2*tensors.sxy[index]*qx*qy+tensors.sxx[index]*qy*qy)/determinant;
    const capacity=(tensors.sxx[index]*equilibrium.load[0]**2+2*tensors.sxy[index]*equilibrium.load[0]*equilibrium.load[1]+tensors.syy[index]*equilibrium.load[1]**2)/Math.max(1e-12,base);
    const utilization=Math.sqrt(Math.max(0,energy/Math.max(1e-12,base)));
    const ratio=capacity<1e-6?0:clamp(capacity/Math.max(1e-6,utilization),0,2.5);
    reserve[index]=ratio;
    strength[index]=base*ratio;
    reinforcement[index]=(
      tensors.threadXx[index]*equilibrium.load[0]**2
      +2*tensors.threadXy[index]*equilibrium.load[0]*equilibrium.load[1]
      +tensors.threadYy[index]*equilibrium.load[1]**2
    )/Math.max(1e-12,base);
  }
  const tolerance=Math.max(.005,config[7]);
  let damageWeight=0,damageMean=0,affected=0,weak=0,influenceRadius=0,boundaryError=0;
  const active=[];
  for(let index=0;index<cells;++index){
    const x=index%size,y=Math.floor(index/size),ratio=reserve[index];
    const deviation=Math.abs(ratio-1);
    const weight=damage[index]+Math.min(1,reinforcement[index])+Math.min(1,deviation/tolerance);
    if(weight>1e-6)active.push([ratio,weight]);
    damageWeight+=damage[index];damageMean+=damage[index]*ratio;
    if(deviation>tolerance){
      affected++;weak+=Number(ratio<1-tolerance);
      const px=bounds[0]+x*bounds[4]-bounds[5],py=bounds[2]+y*bounds[4]-bounds[6];
      influenceRadius=Math.max(influenceRadius,Math.hypot(px,py));
    }
    if(x<2||y<2||x>=size-2||y>=size-2)boundaryError=Math.max(boundaryError,deviation);
  }
  const damageArea=damageWeight*bounds[4]*bounds[4];
  const low=weightedQuantile(active,.05),high=weightedQuantile(active,.95);
  const metrics=new Float32Array([
    base,
    base*low,
    base*(damageWeight>1e-6?damageMean/damageWeight:1),
    base*high,
    influenceRadius,
    segments.reduce((sum,segment)=>sum+segment.length,0),
    affected>0?weak/affected:0,
    damageArea,
    boundaryError,
    equilibrium.residual,
    equilibrium.iterations,
    segments.length,
  ]);
  return{strength,reinforcement,metrics,reserve};
}

function solve({config,gridSize,bounds,damage,segments,outline}){
  const visible=segmentObjects(segments);
  const polygon=polygonPoints(outline);
  const hidden=hiddenUnderpasses(visible,config,polygon);
  const anchored=anchoredSegments([...visible,...hidden],config,damage,gridSize,bounds);
  const tensors=materialTensors(config,damage,anchored,gridSize,bounds);
  const equilibrium=solveEquilibrium(config,gridSize,bounds,tensors);
  const result=evaluate(config,gridSize,bounds,damage,anchored,tensors,equilibrium);
  return{
    ...result,
    diagnostics:{
      hiddenSegments:hidden.length,
      visibleSegments:visible.length,
      meanAnchor:anchored.reduce((sum,segment)=>sum+segment.anchor,0)/Math.max(1,anchored.length),
      iterations:equilibrium.iterations,
      residual:equilibrium.residual,
    },
  };
}

globalThis.DarningMechanics=Object.freeze({solve});
})();
