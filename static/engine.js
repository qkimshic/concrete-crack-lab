/* 브라우저 내 OpenCV 연산. 업로드 사진은 외부 서버로 전송하지 않는다. */
async function cvAnalyze(cv,refData,curData,o,manual,modelSegment,fine={},checkpoints){
 const allocated=[];const own=x=>(allocated.push(x),x),mat=()=>own(new cv.Mat());
 try{
 const ref=own(cv.matFromImageData(refData)),cur=own(cv.matFromImageData(curData)),w=ref.cols,h=ref.rows;
 const checks=prepareCheckpoints(checkpoints,ref,cur);
 const gray=a=>{const g=mat();cv.cvtColor(a,g,cv.COLOR_RGBA2GRAY);return g};
 const gr=gray(ref),gc=gray(cur);let p=[],q=[],flags=[],matches=0,H,median=null,manualSimilarity=false;
 if(manual){const n=manual.reference.length;if(n<2||n>10||manual.current.length!==n)throw Error('두 사진에 같은 개수의 대응점을 지정하세요.');p=manual.current.map(v=>[v[0]*cur.cols,v[1]*cur.rows]);q=manual.reference.map(v=>[v[0]*w,v[1]*h]);flags=Array(n).fill(1);matches=n;}
 else{
 const orb=own(new cv.ORB());orb.setMaxFeatures(6000);orb.setFastThreshold(12);
 const kr=own(new cv.KeyPointVector()),kc=own(new cv.KeyPointVector()),dr=mat(),dc=mat(),empty=mat();
 orb.detectAndCompute(gr,empty,kr,dr);orb.detectAndCompute(gc,empty,kc,dc);
 if(dr.empty()||dc.empty())throw Error('특징점이 부족합니다. 수동 정렬을 사용하세요.');
 const bf=own(new cv.BFMatcher(cv.NORM_HAMMING,false)),vv=own(new cv.DMatchVectorVector());bf.knnMatch(dc,dr,vv,2);
 const good=[];for(let i=0;i<vv.size();i++){let v=vv.get(i);if(v.size()===2){let a=v.get(0),b=v.get(1);if(a.distance<.72*b.distance)good.push({queryIdx:a.queryIdx,trainIdx:a.trainIdx,distance:a.distance})}v.delete()}
 good.sort((a,b)=>a.distance-b.distance);
 const seen=new Set();
 for(const match of good){
  if(seen.has(match.trainIdx))continue;
  const x=kc.get(match.queryIdx).pt,y=kr.get(match.trainIdx).pt;
  const current=[x.x,x.y],reference=[y.x,y.y];
  if(checks&&(nearCheckPoint(current,checks.current)||nearCheckPoint(reference,checks.reference)))continue;
  seen.add(match.trainIdx);
  p.push(current);q.push(reference);
 }
 matches=p.length;if(matches<12)throw Error('신뢰할 매칭이 12쌍 미만입니다. 수동 정렬을 사용하세요.');
 }
 const hullArea=pts=>{let v=own(cv.matFromArray(pts.length,1,cv.CV_32FC2,pts.flat())),hull=mat();cv.convexHull(v,hull);return cv.contourArea(hull)};
 if(manual){
  const span=pts=>{let d=0;for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)d=Math.max(d,Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]));return d};
  if(span(p)<Math.hypot(cur.cols,cur.rows)*.05||span(q)<Math.hypot(w,h)*.05)throw Error('대응점이 너무 가깝습니다. 서로 멀리 떨어진 같은 위치를 지정하세요.');
  manualSimilarity=p.length<4||hullArea(p)<cur.cols*cur.rows*.03||hullArea(q)<w*h*.03;
 }
 const pm=own(cv.matFromArray(p.length,1,cv.CV_32FC2,p.flat())),qm=own(cv.matFromArray(q.length,1,cv.CV_32FC2,q.flat())),inliers=mat();
 if(manualSimilarity){
  // 거의 일직선인 점은 원근 변환을 결정할 수 없으므로 유사변환을 사용한다.
  const fit=ids=>{
   const mean=(pts)=>ids.reduce((v,i)=>[v[0]+pts[i][0]/ids.length,v[1]+pts[i][1]/ids.length],[0,0]);
   const mp=mean(p),mq=mean(q);let den=0,ac=0,bc=0;
   for(const i of ids){const x=p[i][0]-mp[0],y=p[i][1]-mp[1],u=q[i][0]-mq[0],v=q[i][1]-mq[1];den+=x*x+y*y;ac+=x*u+y*v;bc+=x*v-y*u;}
   const a=ac/den,b=bc/den;return [a,-b,mq[0]-a*mp[0]+b*mp[1],b,a,mq[1]-b*mp[0]-a*mp[1],0,0,1];
  };
  let ids=p.map((_,i)=>i);
  if(p.length>=4){
   let best=[],bestSum=Infinity;const limit=Math.max(5,Math.hypot(w,h)*.025);
   for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
    let t=fit([i,j]);if(!t.every(Number.isFinite))continue;
    let candidate=[],sum=0;for(let k=0;k<p.length;k++){let d=Math.hypot(t[0]*p[k][0]+t[1]*p[k][1]+t[2]-q[k][0],t[3]*p[k][0]+t[4]*p[k][1]+t[5]-q[k][1]);if(d<=limit){candidate.push(k);sum+=d*d;}}
    if(candidate.length>best.length||(candidate.length===best.length&&sum<bestSum)){best=candidate;bestSum=sum;}
   }
   if(best.length<Math.max(3,Math.ceil(p.length*.7)))throw Error('대응점 위치나 순서가 맞지 않습니다. 두 사진에서 같은 번호가 같은 지점을 가리키도록 다시 지정하세요.');
   ids=best;flags=flags.map((_,i)=>ids.includes(i)?1:0);
  }
  const values=fit(ids);if(!values.every(Number.isFinite)||Math.hypot(values[0],values[3])<1e-6)throw Error('대응점을 확인하세요.');
  H=own(cv.matFromArray(3,3,cv.CV_64FC1,values));
 }else H=own(cv.findHomography(pm,qm,(manual&&p.length===4)?0:cv.RANSAC,3,inliers));
 if(H.empty())throw Error('사진 정렬에 실패했습니다.');
 if(!manual||(!manualSimilarity&&p.length>4))flags=Array.from(inliers.data);
 if(manual&&flags.filter(Boolean).length<Math.max(4,Math.ceil(p.length*.6))&&!manualSimilarity)throw Error('대응점이 서로 맞지 않습니다. 같은 위치와 번호를 확인하세요.');
 const hm=Array.from(H.data64F);const transform=([x,y])=>{let z=hm[6]*x+hm[7]*y+hm[8];return [(hm[0]*x+hm[1]*y+hm[2])/z,(hm[3]*x+hm[4]*y+hm[5])/z]};
 const errors=[],ip=[],iq=[];flags.forEach((f,i)=>{if(f){ip.push(p[i]);iq.push(q[i]);let t=transform(p[i]);errors.push(Math.hypot(t[0]-q[i][0],t[1]-q[i][1]))}});errors.sort((a,b)=>a-b);median=errors[Math.floor(errors.length/2)];
 if(manualSimilarity&&p.length>2&&Math.sqrt(errors.reduce((a,b)=>a+b*b,0)/errors.length)>Math.max(5,Math.hypot(w,h)*.03))throw Error('대응점 위치나 순서가 맞지 않습니다. 두 사진에서 같은 번호가 같은 지점을 가리키도록 다시 지정하세요.');
 if(manual&&!manualSimilarity&&(hullArea(ip)<cur.cols*cur.rows*.03||hullArea(iq)<w*h*.03))throw Error('원근 정렬에 사용된 대응점을 넓게 분산하거나 균열 위에 다시 지정하세요.');
 if(!manual&&(errors.length<10||median>2.5||hullArea(iq)<w*h*.03||(errors.length/matches<.08&&errors.length<20)))throw Error('정렬 신뢰도가 낮습니다. 수동 기준점을 사용하세요.');
 const corners=[[0,0],[cur.cols,0],[cur.cols,cur.rows],[0,cur.rows]],den=corners.map(([x,y])=>hm[6]*x+hm[7]*y+hm[8]),corn=own(cv.matFromArray(4,1,cv.CV_32FC2,corners.map(transform).flat()));let ar=cv.contourArea(corn)/(w*h);
 if(!hm.every(Number.isFinite)||Math.min(...den)*Math.max(...den)<=0||!cv.isContourConvex(corn)||ar<.15||ar>6)throw Error('변환이 지나치게 왜곡되었습니다. 사진과 기준점을 확인하세요.');
 const aligned=mat();cv.warpPerspective(cur,aligned,H,new cv.Size(w,h));
 const valid=mat(),white=own(new cv.Mat(cur.rows,cur.cols,cv.CV_8UC1,new cv.Scalar(255))),edge=own(cv.Mat.ones(3,3,cv.CV_8U));cv.warpPerspective(white,valid,H,new cv.Size(w,h),cv.INTER_NEAREST);cv.erode(valid,valid,edge);
 const overlap=cv.countNonZero(valid)/(w*h);if(overlap<.35)throw Error('공통 촬영 영역이 35% 미만입니다. 같은 벽면이 넓게 겹치도록 다시 촬영하세요.');
 const verification=verifyRegistration(checks,transform,valid,iq,ip);
 const currentAdjusted=mat();cur.copyTo(currentAdjusted);
 for(let i=0;i<currentAdjusted.data.length;i+=4)for(let c=0;c<3;c++)currentAdjusted.data[i+c]=Math.max(0,Math.min(255,currentAdjusted.data[i+c]*o.contrast+o.brightness));
 for(let i=0;i<aligned.data.length;i+=4){for(let c=0;c<3;c++)aligned.data[i+c]=Math.max(0,Math.min(255,aligned.data[i+c]*o.contrast+o.brightness));aligned.data[i+3]=255;}
 const processed=[];
 const regions=[];
 const guidedStrokes=[];
 let modelInfo=null;
 function lineInput(a){
  const g=gray(a),blur=mat(),eq=mat();
  cv.GaussianBlur(g,blur,new cv.Size(3,3),0);
  const clahe=own(new cv.CLAHE(2,new cv.Size(8,8)));clahe.apply(blur,eq);
  return {ridge:blur,preview:eq};
 }
 async function detect(a,guidePoints,crackGuide){
 let binary=mat();
 if(crackGuide){
  const {mask,strokes}=CrackPaths.detect(pixels(a),crackGuide,o.threshold,o.minimum);
  guidedStrokes.push(strokes);
  binary=own(cv.matFromArray(a.rows,a.cols,cv.CV_8UC1,mask));
  processed.push(lineInput(a).preview);
  return binary;
 }
 if(o.detector==='unet'){
  if(!modelSegment)throw Error('U-Net 모델 실행기를 불러오지 못했습니다.');
  const prediction=await modelSegment(pixels(a));modelInfo=prediction.model;
  const scores=own(cv.matFromArray(256,256,cv.CV_32FC1,prediction.scores)),scaled=mat(),thresholded=mat();
  cv.resize(scores,scaled,new cv.Size(a.cols,a.rows),0,0,cv.INTER_LINEAR);
  cv.threshold(scaled,thresholded,o.modelThreshold/100,255,cv.THRESH_BINARY);thresholded.convertTo(binary,cv.CV_8UC1);
  const preview=mat();cv.resize(a,preview,new cv.Size(256,256),0,0,cv.INTER_AREA);processed.push(preview);
  if(cv.countNonZero(binary)>a.cols*a.rows*.6)throw Error('U-Net 분할 영역이 사진의 60%를 초과했습니다. 분할 임계값을 높여 다시 분석하세요.');
  if(o.refine){const input=lineInput(a);const refined=CrackFilter.mask(cv,input.ridge,binary,o,own);refined.copyTo(binary);}
 }else{
  const input=lineInput(a);const detected=CrackFilter.mask(cv,input.ridge,null,o,own);detected.copyTo(binary);processed.push(input.preview);
 }
 const region=own(new cv.Mat(a.rows,a.cols,cv.CV_8UC1,new cv.Scalar(255)));
 if(o.guide&&guidePoints){
  region.setTo(new cv.Scalar(0));const pts=guidePoints.map(v=>[v[0]*a.cols,v[1]*a.rows]);
  const draw=(u,v)=>cv.line(region,new cv.Point(Math.round(u[0]),Math.round(u[1])),new cv.Point(Math.round(v[0]),Math.round(v[1])),new cv.Scalar(255),2*o.guideWidth+1);
  for(let i=1;i<pts.length;i++)draw(pts[i-1],pts[i]);
  const extend=(u,v)=>{let dx=u[0]-v[0],dy=u[1]-v[1],d=Math.hypot(dx,dy);if(d>1)draw(u,[u[0]+dx/d*2*Math.hypot(a.cols,a.rows),u[1]+dy/d*2*Math.hypot(a.cols,a.rows)]);};
  if(o.guideScope!=='segment'){extend(pts[0],pts[1]);extend(pts[pts.length-1],pts[pts.length-2]);}
  cv.bitwise_and(binary,region,binary);
 }
 regions.push(region);
 let labels=mat(),stats=mat(),centroids=mat();const n=cv.connectedComponentsWithStats(binary,labels,stats,centroids,8,cv.CV_32S),keep=new Uint8Array(n);
 for(let i=1;i<n;i++){let width=stats.intAt(i,2),height=stats.intAt(i,3),area=stats.intAt(i,4);const longSide=Math.max(width,height),shortSide=Math.min(width,height);if(area>=o.minimum&&longSide>=8&&(longSide>=3*shortSide||area/(width*height)<.7))keep[i]=1}
 for(let i=0;i<a.cols*a.rows;i++)binary.data[i]=keep[labels.data32S[i]]?255:0;return binary;}
 // 해상도 차이가 큰 사진도 비슷한 화면 규모에서 검출한 뒤 원래 좌표로 되돌린다.
 const factor=Math.min(2,Math.max(.25,Math.sqrt((w*h)/(cur.cols*cur.rows)))),currentSized=mat();
 cv.resize(currentAdjusted,currentSized,new cv.Size(Math.max(1,Math.round(cur.cols*factor)),Math.max(1,Math.round(cur.rows*factor))),0,0,factor<1?cv.INTER_AREA:cv.INTER_LINEAR);
 const fullA=await detect(ref,manual?.reference,o.crackGuides?.reference);
 const fullB=mat();
 if(o.crackGuides){
  const currentMask=await detect(currentAdjusted,null,o.crackGuides.current);
  currentMask.copyTo(fullB);
 }else{
  const currentSmall=await detect(currentSized,manual?.current);
  cv.resize(currentSmall,fullB,new cv.Size(cur.cols,cur.rows),0,0,cv.INTER_NEAREST);
 }
 const baseA=mat(),baseB=mat();fullA.copyTo(baseA);fullB.copyTo(baseB);
 function supplement(detail,width,height){
  if(!detail)return null;
  const [nw,nh]=detail.native_size,roi=detail.roi,source=detail.mask;
  if(![nw,nh,roi.x,roi.y,roi.width,roi.height].every(Number.isFinite)||nw<=0||nh<=0||source.width!==roi.width||source.height!==roi.height||source.data.length!==source.width*source.height*4)throw Error('보완 영역을 확인하세요.');
  const mask=own(new cv.Mat.zeros(height,width,cv.CV_8UC1)),scope=own(new cv.Mat.zeros(height,width,cv.CV_8UC1));
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(source.data[(y*source.width+x)*4]){
   const xx=Math.floor((roi.x+x+.5)*width/nw),yy=Math.floor((roi.y+y+.5)*height/nh);
   if(xx>=0&&xx<width&&yy>=0&&yy<height)mask.data[yy*width+xx]=255;
  }
  const margin=Math.max(4,o.tolerance*2),x0=Math.max(0,Math.floor(roi.x*width/nw)-margin),y0=Math.max(0,Math.floor(roi.y*height/nh)-margin),x1=Math.min(width,Math.ceil((roi.x+roi.width)*width/nw)+margin),y1=Math.min(height,Math.ceil((roi.y+roi.height)*height/nh)+margin);
  for(let y=y0;y<y1;y++)scope.data.fill(255,y*width+x0,y*width+x1);
  return {mask,scope,record:{roi,native_size:[nw,nh],parameters:detail.parameters,metrics:detail.metrics}};
 }
 const detailA=o.fineEnabled?supplement(fine.reference,w,h):null,detailB=o.fineEnabled?supplement(fine.current,cur.cols,cur.rows):null;
 if(detailA)cv.bitwise_or(fullA,detailA.mask,fullA);
 if(detailB)cv.bitwise_or(fullB,detailB.mask,fullB);
 if(o.guide){
  const currentRegion=mat(),mappedRegion=mat();cv.resize(regions[1],currentRegion,new cv.Size(cur.cols,cur.rows),0,0,cv.INTER_NEAREST);
  if(detailA)cv.bitwise_or(regions[0],detailA.scope,regions[0]);
  if(detailB)cv.bitwise_or(currentRegion,detailB.scope,currentRegion);
  cv.warpPerspective(currentRegion,mappedRegion,H,new cv.Size(w,h),cv.INTER_NEAREST);
  cv.bitwise_and(valid,regions[0],valid);cv.bitwise_and(valid,mappedRegion,valid);
 }
 const analysisArea=cv.countNonZero(valid);if(analysisArea<10)throw Error('두 사진의 지정 구간이 충분히 겹치지 않습니다. 대응점과 주변 폭을 확인하세요.');
 const mappedB=mat(),a=mat(),b=mat();
 cv.warpPerspective(baseB,mappedB,H,new cv.Size(w,h),cv.INTER_NEAREST);
 const mappedBase=mat();mappedB.copyTo(mappedBase);
 const mappedDetail=own(new cv.Mat.zeros(h,w,cv.CV_8UC1));
 if(detailB){
  for(let y=0;y<cur.rows;y++)for(let x=0;x<cur.cols;x++)if(detailB.mask.data[y*cur.cols+x]){
   const t=transform([x,y]),xx=Math.round(t[0]),yy=Math.round(t[1]);
   if(Number.isFinite(xx)&&Number.isFinite(yy)&&xx>=0&&xx<w&&yy>=0&&yy<h)mappedDetail.data[yy*w+xx]=255;
  }
  cv.bitwise_or(mappedB,mappedDetail,mappedB);
 }
 cv.bitwise_and(fullA,valid,a);
 cv.bitwise_and(mappedB,valid,b);
 function rasterizeStrokes(strokes, project, mask){
  const lines=own(new cv.Mat.zeros(h,w,cv.CV_8UC1));
  const toPoint=([x,y])=>new cv.Point(Math.round(x),Math.round(y));
  for(const stroke of strokes){
   for(let i=1;i<stroke.length;i++){
    cv.line(lines,toPoint(project(stroke[i-1])),toPoint(project(stroke[i])),new cv.Scalar(1),1);
   }
  }
  cv.bitwise_and(lines,mask,lines);
  return new Uint8Array(lines.data);
 }
 const centerA=guidedStrokes.length?rasterizeStrokes(guidedStrokes[0],point=>point,a):thinCrackMask(a.data,w,h);
 const centerB=guidedStrokes.length?rasterizeStrokes(guidedStrokes[1],transform,b):thinCrackMask(b.data,w,h);
 const ma=cv.countNonZero(a),mb=cv.countNonZero(b);
 const la=roundPixels(crackLineLength(centerA,w,h)),lb=roundPixels(crackLineLength(centerB,w,h));

 const residual90=errors[Math.ceil(errors.length*.9)-1];
 const holdReason=manualSimilarity?'similarity_only'
  :errors.length<5?'few_correspondences'
  :!Number.isFinite(residual90)||residual90>4?'registration_error'
  :verification.status==='failed'?'checkpoint_failed'
  :!ma||!mb?'missing_baseline':'';
 // Registration residuals come from the fitted points, so the tolerance is a
 // conservative screening rule, not a measured uncertainty bound on the surface.
 const tolerance=holdReason?null:Math.max(Math.ceil(o.tolerance),Math.ceil(residual90+1),Math.ceil(verification.max_error_px||0));
 const minimumRun=tolerance===null?null:Math.max(8,2*tolerance);
 let newLine=null,missingLine=null;
 let nearA,nearB;
 if(!holdReason){
  const kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(2*tolerance+1,2*tolerance+1)));
  nearA=mat();nearB=mat();
  cv.dilate(a,nearA,kernel);cv.dilate(b,nearB,kernel);
  newLine=screenCrackSegments(centerB,nearA.data,w,h,minimumRun);
  missingLine=screenCrackSegments(centerA,nearB.data,w,h,minimumRun);
 }
 const verdict=holdReason?'withheld':(newLine.length||missingLine.length)?'review':'none_detected';
 const assessment={status:verdict,reason:holdReason||null,applied_tolerance_px:tolerance,
  minimum_segment_length_px:minimumRun,registration_residual_p90_px:roundPixels(residual90)};
 const overlay=mat();
 cv.addWeighted(ref,.5,aligned,.5,0,overlay);
 const uncertainColor=[240,193,102], matchedColor=[40,160,170];
 const newColor=[235,75,60],missingColor=[35,140,230];
 for(let i=0;i<w*h;i++){
  const previous=a.data[i]!==0,current=b.data[i]!==0;
  let color=null;
  if(previous||current){
   const matched=!holdReason&&(!previous||nearB.data[i])&&(!current||nearA.data[i]);
   color=matched?matchedColor:uncertainColor;
   if(newLine?.pixels[i])color=newColor;
   if(missingLine?.pixels[i])color=missingColor;
  }
  for(let c=0;c<3;c++)overlay.data[4*i+c]=color?color[c]:overlay.data[4*i+c]*(valid.data[i]?1:.25);
  overlay.data[4*i+3]=255;
 }
 const metrics={
  reference_area_px2:ma,current_area_px2:mb,area_delta_px2:mb-ma,
  reference_length_px:la,current_length_px:lb,length_delta_px:roundPixels(lb-la),
  area_change_percent:ma?100*(mb-ma)/ma:null,length_change_percent:la?100*(lb-la)/la:null,
  new_candidate_length_px:newLine?roundPixels(newLine.length):null,
  missing_candidate_length_px:missingLine?roundPixels(missingLine.length):null
 };
 let addedA=0,addedB=0;
 for(let i=0;i<w*h;i++)if(valid.data[i]){if(detailA?.mask.data[i]&&!baseA.data[i])addedA++;if(mappedDetail.data[i]&&!mappedBase.data[i])addedB++;}
 const fineDetail=detailA||detailB?{reference:detailA?.record||null,current:detailB?.record||null,added_common_reference_px2:addedA,added_common_current_px2:addedB,mapping:'source_pixel_forward_raster',measurement:'union_masks_in_reference_common_region'}:null;
 const warnings=[o.detector==='path'?'사진의 지정 경로 주변을 분석합니다. 표면 공극과 박락부의 경계는 측정에서 제외합니다.':o.detector==='unet'?'U-Net 분할 후보입니다. 가는 균열의 누락과 얼룩·그림자의 오검출을 확인하세요.':'명암 규칙으로 검출한 균열 후보입니다. 얼룩·그림자를 육안 확인하세요.','조명, 해상도 및 촬영 위치에 따라 검출 차이가 생길 수 있습니다.'];if(o.guide)warnings.push(fineDetail?'선택한 분석 영역의 공통 부분만 측정합니다.':o.guideScope==='segment'?'첫 대응점과 마지막 대응점 사이의 지정 구간만 분석했습니다. 구간 밖과 주변 폭 밖의 균열은 측정에 포함되지 않습니다.':'대응점 주변에서만 균열 후보를 검출했습니다. 경로 밖 후보는 제외됩니다.');if(manualSimilarity)warnings.push('간단 정렬은 이동·회전·크기만 보정합니다. 원근 차이와 대응점 선택에 따른 오차를 확인하세요.');
 const vis=own(new cv.Mat(Math.max(h,cur.rows),w+cur.cols,cv.CV_8UC4,new cv.Scalar(230,230,230,255))),roi1=own(vis.roi(new cv.Rect(0,0,w,h))),roi2=own(vis.roi(new cv.Rect(w,0,cur.cols,cur.rows)));ref.copyTo(roi1);cur.copyTo(roi2);
 let shown=0;for(let i=0;i<p.length&&shown<60;i++){
  if(!manual&&!flags[i])continue;shown++;const color=flags[i]?new cv.Scalar(65,200,105,255):new cv.Scalar(220,60,50,255);
  const left=new cv.Point(Math.round(q[i][0]),Math.round(q[i][1])),right=new cv.Point(Math.round(p[i][0]+w),Math.round(p[i][1]));cv.line(vis,left,right,color,1);
  if(manual){for(const point of [left,right]){cv.circle(vis,point,5,color,-1);cv.putText(vis,String(i+1),new cv.Point(point.x+6,point.y-4),cv.FONT_HERSHEY_SIMPLEX,.5,color,1);}}
 }
 if(checks){
  const color=new cv.Scalar(40,114,220,255),radius=Math.max(5,Math.round((w+cur.cols)/180));
  for(let i=0;i<checks.reference.length;i++){
   const [x,y]=checks.reference[i],[u,v]=checks.current[i];
   const left=new cv.Point(Math.round(x),Math.round(y)),right=new cv.Point(Math.round(u+w),Math.round(v));
   cv.line(vis,left,right,color,1);
   for(const point of [left,right]){
    cv.circle(vis,point,radius,color,-1);
    cv.putText(vis,`V${i+1}`,new cv.Point(point.x+radius+2,point.y-radius),cv.FONT_HERSHEY_SIMPLEX,radius/12,color,Math.max(1,Math.round(radius/5)));
   }
  }
 }
 // 후보 마스크의 윤곽만 원본 사진 위에 표시한다.
 const refContour=mat(),curContour=mat();ref.copyTo(refContour);cur.copyTo(curContour);
 function contours(mask,image){const curves=own(new cv.MatVector()),hier=mat(),copy=mat();mask.copyTo(copy);cv.findContours(copy,curves,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);cv.drawContours(image,curves,-1,new cv.Scalar(230,75,35,255),1);}
 contours(fullA,refContour);contours(fullB,curContour);
 function pixels(m){let rgba=m;if(m.channels()!==4){rgba=mat();cv.cvtColor(m,rgba,cv.COLOR_GRAY2RGBA)}return {width:rgba.cols,height:rgba.rows,data:new Uint8ClampedArray(rgba.data)}}
 return {segmentation:{method:(o.detector==='path'?'균열 경로 · 명암 기반':o.detector==='unet'?(o.refine?'U-Net + 명암 보완':'U-Net'):'명암 기반')+(fineDetail?' + 가는 균열':''),fine_detail:fineDetail,postprocessing:o.detector==='path'?'guided_bilateral_ridges':o.detector==='unet'&&!o.refine?'model_threshold':'bilateral_ridge_hysteresis_v1',model:modelInfo},comparison:{assessment,fine_regions_included:!!fineDetail,scope:o.guide?(o.guideScope||'extended'):'all',analysis_area_px2:analysisArea,analysis_area_ratio:analysisArea/(w*h)},registration:{verification,method:manual?(manualSimilarity?`수동 간단 정렬 (${matches}쌍)`:`수동 원근 정렬 (${matches}쌍)`):'ORB + RANSAC',manual:!!manual,matches,inliers:errors.length,inlier_ratio:errors.length/matches,median_error_px:median,overlap_ratio:overlap},metrics,warnings,parameters:o,homography_current_to_reference:[hm.slice(0,3),hm.slice(3,6),hm.slice(6)],processing_size:{reference:[w,h],current:[cur.cols,cur.rows]},images:{reference:pixels(ref),reference_contour:pixels(refContour),current_contour:pixels(curContour),reference_preprocessed:pixels(processed[0]),current_preprocessed:pixels(processed[1]),aligned:pixels(aligned),overlay:pixels(overlay),matches:pixels(vis),current_mask:pixels(fullB),reference_mask:pixels(fullA)}};
 }finally{for(let i=allocated.length-1;i>=0;i--)allocated[i].delete();}
}
function roundPixels(value){
 return Number.isFinite(value)?Math.round(value*100)/100:null;
}

function prepareCheckpoints(checkpoints,ref,cur){
 if(!checkpoints||(!checkpoints.reference?.length&&!checkpoints.current?.length))return null;
 const read=(points,image)=>{
  if(!Array.isArray(points)||points.length!==2||points.some(point=>
   !Array.isArray(point)||point.length!==2||point.some(value=>!Number.isFinite(value)||value<0||value>=1)
  ))throw Error('두 사진에 확인점을 각각 두 곳 지정하세요.');
  return points.map(([x,y])=>[x*image.cols,y*image.rows]);
 };
 const reference=read(checkpoints.reference,ref),current=read(checkpoints.current,cur);
 if(nearCheckPoint(reference[0],[reference[1]])||nearCheckPoint(current[0],[current[1]])){
  throw Error('확인점은 서로 떨어진 두 곳을 선택하세요.');
 }
 return {reference,current};
}

function nearCheckPoint([x,y],points){
 return points.some(([px,py])=>(x-px)**2+(y-py)**2<=4);
}

function verifyRegistration(checks,transform,overlap,fitReference,fitCurrent){
 const limit=4;
 if(!checks)return {status:'not_set',reason:null,threshold_px:limit,max_error_px:null,points:[]};
 const errors=[];
 let reused=false,outside=false;
 const points=checks.reference.map(([x,y],i)=>{
  const current=checks.current[i];
  const projected=transform(current);
  const error=Math.hypot(projected[0]-x,projected[1]-y);
  const ix=Math.floor(x),iy=Math.floor(y);
  const within=Boolean(overlap.data[iy*overlap.cols+ix])&&projected.every(Number.isFinite)&&
   projected[0]>=0&&projected[0]<overlap.cols&&projected[1]>=0&&projected[1]<overlap.rows;
  const independent=!nearCheckPoint([x,y],fitReference)&&!nearCheckPoint(current,fitCurrent);
  errors.push(error);
  reused ||= !independent;
  outside ||= !within;
  return {index:i+1,reference_px:[x,y].map(roundPixels),current_px:current.map(roundPixels),
   projected_reference_px:projected.map(roundPixels),error_px:roundPixels(error),
   within_overlap:within,independent};
 });
 const maxError=Math.max(...errors);
 const reason=reused?'reused_fit_point':outside?'outside_overlap':maxError>limit?'error_exceeded':null;
 return {status:reason?'failed':'passed',reason,threshold_px:limit,max_error_px:roundPixels(maxError),points};
}

function thinCrackMask(mask,width,height){
 const pixels=Uint8Array.from(mask,value=>value?1:0);
 let changed=true;
 for(let iteration=0;changed&&iteration<100;iteration++){
  changed=false;
  for(let pass=0;pass<2;pass++){
   const remove=[];
   for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    if(!pixels[i])continue;
    const n=[pixels[i-width],pixels[i-width+1],pixels[i+1],pixels[i+width+1],
     pixels[i+width],pixels[i+width-1],pixels[i-1],pixels[i-width-1]];
    const count=n.reduce((sum,value)=>sum+value,0);
    if(count<2||count>6)continue;
    let transitions=0;
    for(let k=0;k<8;k++)if(!n[k]&&n[(k+1)%8])transitions++;
    if(transitions!==1)continue;
    if(pass===0?(n[0]*n[2]*n[4]||n[2]*n[4]*n[6]):(n[0]*n[2]*n[6]||n[0]*n[4]*n[6]))continue;
    remove.push(i);
   }
   if(remove.length)changed=true;
   for(const i of remove)pixels[i]=0;
  }
 }
 return pixels;
}

// Sum each horizontal, vertical or diagonal link once, avoiding corner shortcuts.
function forwardLineLinks(pixels,i,x,y,width,height){
 const right=x+1<width&&pixels[i+1],down=y+1<height&&pixels[i+width];
 let length=(right?1:0)+(down?1:0);
 if(y+1<height&&!down){
  if(x+1<width&&!right&&pixels[i+width+1])length+=Math.SQRT2;
  if(x>0&&!pixels[i-1]&&pixels[i+width-1])length+=Math.SQRT2;
 }
 return length;
}

function crackLineLength(pixels,width,height){
 let total=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x;
  if(pixels[i])total+=forwardLineLinks(pixels,i,x,y,width,height);
 }
 return total;
}

function screenCrackSegments(centerline,oppositeNeighborhood,width,height,minimumLength){
 const remaining=Uint8Array.from(centerline,(value,i)=>value&&!oppositeNeighborhood[i]?1:0);
 const visited=new Uint8Array(remaining.length);
 const pixels=new Uint8Array(remaining.length);
 let length=0;
 for(let start=0;start<remaining.length;start++){
  if(!remaining[start]||visited[start])continue;
  const component=[start];
  visited[start]=1;
  let componentLength=0;
  for(let k=0;k<component.length;k++){
   const i=component[k],x=i%width,y=Math.floor(i/width);
   componentLength+=forwardLineLinks(remaining,i,x,y,width,height);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy;
    if(xx<0||xx>=width||yy<0||yy>=height)continue;
    const next=yy*width+xx;
    if(!remaining[next]||visited[next])continue;
    visited[next]=1;
    component.push(next);
   }
  }
  if(componentLength<minimumLength)continue;
  for(const i of component)pixels[i]=1;
  length+=componentLength;
 }
 return {length,pixels};
}

if(typeof module!=='undefined')module.exports=cvAnalyze;
