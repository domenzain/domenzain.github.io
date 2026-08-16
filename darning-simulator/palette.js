const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const toLinear=value=>{
  const channel=value/255;
  return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;
};
const toSrgb=value=>{
  const channel=value<=.0031308?12.92*value:1.055*value**(1/2.4)-.055;
  return Math.round(255*clamp(channel,0,1));
};
const toOklab=([red,green,blue])=>{
  const [r,g,b]=[red,green,blue].map(toLinear);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return[
    .2104542553*l+.793617785*m-.0040720468*s,
    1.9779984951*l-2.428592205*m+.4505937099*s,
    .0259040371*l+.7827717662*m-.808675766*s,
  ];
};
const fromOklab=([lightness,a,b])=>{
  const l=(lightness+.3963377774*a+.2158037573*b)**3;
  const m=(lightness-.1055613458*a-.0638541728*b)**3;
  const s=(lightness-.0894841775*a-1.291485548*b)**3;
  return[
    toSrgb(4.0767416621*l-3.3077115913*m+.2309699292*s),
    toSrgb(-1.2684380046*l+2.6097574011*m-.3413193965*s),
    toSrgb(-.0041960863*l-.7034186147*m+1.707614701*s),
  ];
};
const interpolate=(left,right,amount)=>{
  const a=toOklab(left),b=toOklab(right);
  return fromOklab(a.map((value,index)=>value+amount*(b[index]-value)));
};

export const strengthStops=[
  [0,[70,18,48]],
  [.5,[140,35,50]],
  [.8,[206,85,54]],
  [.95,[238,165,93]],
  [1,[246,243,233]],
  [1.08,[185,220,216]],
  [1.25,[67,151,158]],
  [1.6,[15,76,93]],
];

export const strengthColor=ratio=>{
  const value=Math.abs(ratio-1)<.01?1:clamp(Number.isFinite(ratio)?ratio:0,0,1.6);
  const found=strengthStops.findIndex(([stop])=>stop>=value);
  const upper=found<0?strengthStops.length-1:Math.max(1,found);
  const [lowValue,lowColor]=strengthStops[upper-1];
  const [highValue,highColor]=strengthStops[upper];
  return interpolate(lowColor,highColor,(value-lowValue)/(highValue-lowValue));
};

const cssColor=([red,green,blue])=>`rgb(${red} ${green} ${blue})`;
const gradient=(stops,position)=>`linear-gradient(90deg,${stops.map(([value,color])=>`${cssColor(color)} ${position(value).toFixed(1)}%`).join(',')})`;
export const deficitGradient=gradient(strengthStops.filter(([value])=>value<=1),value=>100*value);
export const surplusGradient=gradient(strengthStops.filter(([value])=>value>=1),value=>100*(value-1)/.6);
