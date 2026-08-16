import assert from 'node:assert/strict';
import {deficitGradient,strengthColor,strengthStops,surplusGradient} from '../darning-simulator/palette.js';

const luminance=color=>color
  .map(value=>value/255)
  .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
  .reduce((sum,value,index)=>sum+[.2126,.7152,.0722][index]*value,0);
const distance=(left,right)=>Math.hypot(...left.map((value,index)=>value-right[index]));
const deuteranopia=([red,green,blue])=>[
  .367*red+.861*green-.228*blue,
  .280*red+.673*green+.047*blue,
  -.012*red+.043*green+.969*blue,
].map(value=>Math.max(0,Math.min(255,value)));

[-1,0,.5,.8,.95,1,1.08,1.25,1.6,3,Number.NaN].forEach(ratio=>{
  const color=strengthColor(ratio);
  assert.equal(color.length,3);
  assert.ok(color.every(value=>Number.isInteger(value)&&value>=0&&value<=255));
});
assert.deepEqual(strengthColor(1),[246,243,233]);
assert.ok(luminance(strengthColor(1))-luminance(strengthColor(.8))>.35);
assert.ok(luminance(strengthColor(1))-luminance(strengthColor(1.25))>.35);
assert.ok(distance(deuteranopia(strengthColor(.8)),deuteranopia(strengthColor(1.25)))>70);
assert.ok(strengthStops.every(([value],index)=>index===0||value>strengthStops[index-1][0]));
assert.match(deficitGradient,/linear-gradient/);
assert.match(surplusGradient,/linear-gradient/);
console.log('palette smoke passed: salient deficit, neutral baseline, CVD-distinct reserve');
