/* 브라우저 내 OpenCV 연산. 업로드 사진은 외부 서버로 전송하지 않는다. */
async function cvAnalyze(cv,refData,curData,o,manual,modelSegment,fine={}){
 const allocated=[];const own=x=>(allocated.push(x),x),mat=()=>own(new cv.Mat());
 try{
 const ref=own(cv.matFromImageData(refData)),cur=own(cv.matFromImageData(curData)),w=ref.cols,h=ref.rows;
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
 good.sort((a,b)=>a.distance-b.distance);const seen=new Set();for(const a of good){if(seen.has(a.trainIdx))continue;seen.add(a.trainIdx);let x=kc.get(a.queryIdx).pt,y=kr.get(a.trainIdx).pt;p.push([x.x,x.y]);q.push([y.x,y.y])}matches=p.length;if(matches<12)throw Error('신뢰할 매칭이 12쌍 미만입니다. 수동 정렬을 사용하세요.');
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
 const overlap=cv.countNonZero(valid)/(w*h);if(overlap<.35)throw Error('공통 촬영 영역이 35% 미만입니다.');
 const currentAdjusted=mat();cur.copyTo(currentAdjusted);
 for(let i=0;i<currentAdjusted.data.length;i+=4)for(let c=0;c<3;c++)currentAdjusted.data[i+c]=Math.max(0,Math.min(255,currentAdjusted.data[i+c]*o.contrast+o.brightness));
 for(let i=0;i<aligned.data.length;i+=4){for(let c=0;c<3;c++)aligned.data[i+c]=Math.max(0,Math.min(255,aligned.data[i+c]*o.contrast+o.brightness));aligned.data[i+3]=255;}
 const processed=[];
 const regions=[];
 let modelInfo=null;
 function lineInput(a){
  const g=gray(a),blur=mat(),eq=mat();
  cv.GaussianBlur(g,blur,new cv.Size(3,3),0);
  const clahe=own(new cv.CLAHE(2,new cv.Size(8,8)));clahe.apply(blur,eq);
  return {ridge:blur,preview:eq};
 }
 async function detect(a,guidePoints){
 let binary=mat();
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
 const fullA=await detect(ref,manual?.reference),currentSmall=await detect(currentSized,manual?.current),fullB=mat();cv.resize(currentSmall,fullB,new cv.Size(cur.cols,cur.rows),0,0,cv.INTER_NEAREST);
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
 const mappedB=mat(),a=mat(),b=mat(),da=mat(),db=mat(),tol=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(2*o.tolerance+1,2*o.tolerance+1)));
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
 cv.bitwise_and(fullA,valid,a);cv.bitwise_and(mappedB,valid,b);cv.dilate(a,da,tol);cv.dilate(b,db,tol);
 let newly=0,lost=0;const overlay=mat();cv.addWeighted(ref,.5,aligned,.5,0,overlay);
 for(let i=0;i<w*h;i++){let color=null;if(a.data[i]||b.data[i])color=[40,160,170];if(b.data[i]&&!da.data[i]){newly++;color=[235,75,60]}if(a.data[i]&&!db.data[i]){lost++;color=[35,140,230]}for(let c=0;c<3;c++)overlay.data[4*i+c]=valid.data[i]?(color?color[c]:overlay.data[4*i+c]):overlay.data[4*i+c]*.25;overlay.data[4*i+3]=255;}
 // Zhang–Suen 세선화 후 중심선 연결 길이.
 function length(m){let s=Uint8Array.from(m.data,x=>x?1:0),remove=[],changed=true,loops=0;while(changed&&loops++<100){changed=false;for(let pass=0;pass<2;pass++){remove=[];for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let i=y*w+x;if(!s[i])continue;let p=[s[i-w],s[i-w+1],s[i+1],s[i+w+1],s[i+w],s[i+w-1],s[i-1],s[i-w-1]],n=p.reduce((a,b)=>a+b,0),t=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])t++;if(n<2||n>6||t!==1)continue;if(pass===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;remove.push(i)}if(remove.length)changed=true;for(const i of remove)s[i]=0;}}
 let l=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){let i=y*w+x;if(!s[i])continue;if(x+1<w&&s[i+1])l++;if(y+1<h&&s[i+w])l++;if(x+1<w&&y+1<h&&s[i+w+1]&&!s[i+1]&&!s[i+w])l+=Math.SQRT2;if(x>0&&y+1<h&&s[i+w-1]&&!s[i-1]&&!s[i+w])l+=Math.SQRT2;}return Math.round(l*100)/100;}
 let ma=cv.countNonZero(a),mb=cv.countNonZero(b),la=length(a),lb=length(b);const metrics={reference_area_px2:ma,current_area_px2:mb,area_delta_px2:mb-ma,new_candidate_area_px2:newly,missing_candidate_area_px2:lost,reference_length_px:la,current_length_px:lb,length_delta_px:Math.round((lb-la)*100)/100,area_change_percent:ma?100*(mb-ma)/ma:null,length_change_percent:la?100*(lb-la)/la:null};
 let addedA=0,addedB=0;
 for(let i=0;i<w*h;i++)if(valid.data[i]){if(detailA?.mask.data[i]&&!baseA.data[i])addedA++;if(mappedDetail.data[i]&&!mappedBase.data[i])addedB++;}
 const fineDetail=detailA||detailB?{reference:detailA?.record||null,current:detailB?.record||null,added_common_reference_px2:addedA,added_common_current_px2:addedB,mapping:'source_pixel_forward_raster',measurement:'union_masks_in_reference_common_region'}:null;
 const warnings=[o.detector==='unet'?'U-Net 분할 후보입니다. 가는 균열의 누락과 얼룩·그림자의 오검출을 확인하세요.':'명암 규칙으로 검출한 균열 후보입니다. 얼룩·그림자를 육안 확인하세요.','신규·미검출 후보는 실제 진행·소멸을 확정하지 않습니다. 공통 영역만 비교합니다.'];if(o.guide)warnings.push(fineDetail?'선택한 분석 영역의 공통 부분만 측정합니다.':o.guideScope==='segment'?'첫 대응점과 마지막 대응점 사이의 지정 구간만 분석했습니다. 구간 밖과 주변 폭 밖의 균열은 측정에 포함되지 않습니다.':'대응점 주변에서만 균열 후보를 검출했습니다. 경로 밖 후보는 제외됩니다.');if(manualSimilarity)warnings.push('간단 정렬은 이동·회전·크기만 보정합니다. 원근 차이와 대응점 선택에 따른 오차를 확인하세요.');else if(manual)warnings.push('수동 대응점은 독립적인 정렬 정확도 검증이 아닙니다.');
 const vis=own(new cv.Mat(Math.max(h,cur.rows),w+cur.cols,cv.CV_8UC4,new cv.Scalar(230,230,230,255))),roi1=own(vis.roi(new cv.Rect(0,0,w,h))),roi2=own(vis.roi(new cv.Rect(w,0,cur.cols,cur.rows)));ref.copyTo(roi1);cur.copyTo(roi2);
 let shown=0;for(let i=0;i<p.length&&shown<60;i++){
  if(!manual&&!flags[i])continue;shown++;const color=flags[i]?new cv.Scalar(65,200,105,255):new cv.Scalar(220,60,50,255);
  const left=new cv.Point(Math.round(q[i][0]),Math.round(q[i][1])),right=new cv.Point(Math.round(p[i][0]+w),Math.round(p[i][1]));cv.line(vis,left,right,color,1);
  if(manual){for(const point of [left,right]){cv.circle(vis,point,5,color,-1);cv.putText(vis,String(i+1),new cv.Point(point.x+6,point.y-4),cv.FONT_HERSHEY_SIMPLEX,.5,color,1);}}
 }
 // 후보 마스크의 윤곽만 원본 사진 위에 표시한다.
 const refContour=mat(),curContour=mat();ref.copyTo(refContour);cur.copyTo(curContour);
 function contours(mask,image){const curves=own(new cv.MatVector()),hier=mat(),copy=mat();mask.copyTo(copy);cv.findContours(copy,curves,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);cv.drawContours(image,curves,-1,new cv.Scalar(230,75,35,255),1);}
 contours(fullA,refContour);contours(fullB,curContour);
 function pixels(m){let rgba=m;if(m.channels()!==4){rgba=mat();cv.cvtColor(m,rgba,cv.COLOR_GRAY2RGBA)}return {width:rgba.cols,height:rgba.rows,data:new Uint8ClampedArray(rgba.data)}}
 return {segmentation:{method:(o.detector==='unet'?(o.refine?'U-Net + 명암 보완':'U-Net'):'명암 기반')+(fineDetail?' + 가는 균열':''),fine_detail:fineDetail,postprocessing:o.detector==='unet'&&!o.refine?'model_threshold':'bilateral_ridge_hysteresis_v1',model:modelInfo},comparison:{fine_regions_included:!!fineDetail,scope:o.guide?(o.guideScope||'extended'):'all',analysis_area_px2:analysisArea,analysis_area_ratio:analysisArea/(w*h)},registration:{method:manual?(manualSimilarity?`수동 간단 정렬 (${matches}쌍)`:`수동 원근 정렬 (${matches}쌍)`):'ORB + RANSAC',manual:!!manual,matches,inliers:errors.length,inlier_ratio:errors.length/matches,median_error_px:median,overlap_ratio:overlap},metrics,warnings,parameters:o,homography_current_to_reference:[hm.slice(0,3),hm.slice(3,6),hm.slice(6)],processing_size:{reference:[w,h],current:[cur.cols,cur.rows]},images:{reference:pixels(ref),reference_contour:pixels(refContour),current_contour:pixels(curContour),reference_preprocessed:pixels(processed[0]),current_preprocessed:pixels(processed[1]),aligned:pixels(aligned),overlay:pixels(overlay),matches:pixels(vis),current_mask:pixels(fullB),reference_mask:pixels(fullA)}};
 }finally{for(let i=allocated.length-1;i>=0;i--)allocated[i].delete();}
}
if(typeof module!=='undefined')module.exports=cvAnalyze;
