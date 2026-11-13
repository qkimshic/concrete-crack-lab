const assert=require('node:assert/strict');
const micro=require('../static/micro.js');
function fixture(draw){const data=new Uint8ClampedArray(80*100*4);for(let y=0;y<100;y++)for(let x=0;x<80;x++){const v=draw(x,y);data.set([v,v,v,255],(y*80+x)*4)}return {width:80,height:100,data}}
const roi={x:20,y:10,width:40,height:80};
assert.equal(micro.analyze(fixture(()=>180),roi).metrics.candidate_area_px2,0);
assert.equal(micro.analyze(fixture(x=>x<40?100:180),roi).metrics.candidate_area_px2,0);
const faint=micro.analyze(fixture(x=>x===40?175:180),roi,{threshold:2,minLength:10});
assert(faint.metrics.centerline_length_px>65);
assert.deepEqual(faint.native_size,[80,100]);
assert.deepEqual(faint.roi,roi);
for(let y=0;y<roi.height;y++)for(let x=0;x<roi.width;x++)if(faint.images.mask.data[(y*roi.width+x)*4])assert.equal(x,20);
assert.throws(()=>micro.analyze(fixture(()=>180),{x:1,y:1,width:2,height:4}),/영역/);
assert.throws(()=>micro.analyze(fixture(()=>180),roi,{threshold:NaN}),/입력/);
console.log('Uniform/shadow rejection, faint-line retention, original coordinates, invalid input passed.');
