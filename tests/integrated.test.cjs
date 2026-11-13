const assert=require('node:assert/strict');
const cv=require('../static/opencv.js');
global.CrackFilter=require('../static/crack-filter.js');
const analyze=require('../static/engine.js');
const ready=async()=>{try{
 const width=64,height=64,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=(Math.abs(y-44)<=1||x===32&&y>=14&&y<=44)?30:180;data.set([v,v,v,255],(y*width+x)*4)}
 const image={width,height,data},manual={reference:[[.1,44/64],[.9,44/64]],current:[[.1,44/64],[.9,44/64]]};
 const options={brightness:0,contrast:1,threshold:8,modelThreshold:2,minimum:5,tolerance:3,detector:'contrast',refine:false,guide:true,guideScope:'segment',guideWidth:3};
 const roi={x:30,y:14,width:5,height:30},mask=new Uint8ClampedArray(5*30*4);for(let y=0;y<30;y++)mask[(y*5+2)*4]=255;
 const detail={roi,native_size:[64,64],mask:{width:5,height:30,data:mask}};
 const before=await analyze(cv,image,image,options,manual),combined=await analyze(cv,image,image,{...options,fineEnabled:true},manual,null,{reference:detail,current:detail});
 assert(combined.metrics.reference_area_px2>before.metrics.reference_area_px2+20);
 assert(combined.metrics.reference_length_px>before.metrics.reference_length_px+20);
 assert.equal(combined.metrics.area_delta_px2,0);assert.equal(combined.metrics.length_delta_px,0);
 assert.equal(combined.metrics.new_candidate_area_px2,0);assert.equal(combined.metrics.missing_candidate_area_px2,0);
 assert(combined.images.reference_mask.data[(20*64+32)*4]>0);assert(combined.images.current_mask.data[(20*64+32)*4]>0);
 const duplicate={roi:{x:20,y:43,width:20,height:3},native_size:[64,64],mask:{width:20,height:3,data:new Uint8ClampedArray(20*3*4).fill(255)}};
 const same=await analyze(cv,image,image,{...options,fineEnabled:true},manual,null,{reference:duplicate,current:duplicate});
 assert.deepEqual(same.metrics,before.metrics);assert.equal(same.segmentation.fine_detail.added_common_reference_px2,0);
 const disabled=await analyze(cv,image,image,{...options,fineEnabled:false},manual,null,{reference:detail,current:detail});assert.deepEqual(disabled.metrics,before.metrics);
 console.log('Combined branch included in views and totals; duplicate pixels not counted twice; identical-photo change zero; disabled mode preserved.');
}catch(e){console.error(e);process.exitCode=1}};
if(cv.Mat)ready();else cv.onRuntimeInitialized=ready;
