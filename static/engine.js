/* 브라우저 내 OpenCV 연산. 업로드 사진은 외부 서버로 전송하지 않는다. */
function cvAnalyze(cv,refData,curData,o,manual){
 const allocated=[];const own=x=>(allocated.push(x),x),mat=()=>own(new cv.Mat());
 try{
 const ref=own(cv.matFromImageData(refData)),cur=own(cv.matFromImageData(curData)),w=ref.cols,h=ref.rows;
 const gray=a=>{const g=mat();cv.cvtColor(a,g,cv.COLOR_RGBA2GRAY);return g};
 const gr=gray(ref),gc=gray(cur);let p=[],q=[],flags=[],matches=0,H,median=null;
 if(manual){if(manual.reference.length!==4||manual.current.length!==4)throw Error('각 사진에 대응점 네 개를 지정하세요.');p=manual.current.map(v=>[v[0]*cur.cols,v[1]*cur.rows]);q=manual.reference.map(v=>[v[0]*w,v[1]*h]);flags=[1,1,1,1];matches=4;}
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
 if(manual&&(hullArea(p)<cur.cols*cur.rows*.03||hullArea(q)<w*h*.03))throw Error('기준점을 일직선이 아닌 넓은 영역에 분산하세요.');
 const pm=own(cv.matFromArray(p.length,1,cv.CV_32FC2,p.flat())),qm=own(cv.matFromArray(q.length,1,cv.CV_32FC2,q.flat())),inliers=mat();
 H=own(cv.findHomography(pm,qm,manual?0:cv.RANSAC,3,inliers));if(H.empty())throw Error('사진 정렬에 실패했습니다.');
 if(!manual)flags=Array.from(inliers.data);
 const hm=Array.from(H.data64F);const transform=([x,y])=>{let z=hm[6]*x+hm[7]*y+hm[8];return [(hm[0]*x+hm[1]*y+hm[2])/z,(hm[3]*x+hm[4]*y+hm[5])/z]};
 const errors=[],ip=[],iq=[];flags.forEach((f,i)=>{if(f){ip.push(p[i]);iq.push(q[i]);let t=transform(p[i]);errors.push(Math.hypot(t[0]-q[i][0],t[1]-q[i][1]))}});errors.sort((a,b)=>a-b);if(!manual)median=errors[Math.floor(errors.length/2)];
 if(!manual&&(errors.length<10||median>2.5||hullArea(iq)<w*h*.03||(errors.length/matches<.08&&errors.length<20)))throw Error('정렬 신뢰도가 낮습니다. 수동 기준점을 사용하세요.');
 const corners=[[0,0],[cur.cols,0],[cur.cols,cur.rows],[0,cur.rows]],den=corners.map(([x,y])=>hm[6]*x+hm[7]*y+hm[8]),corn=own(cv.matFromArray(4,1,cv.CV_32FC2,corners.map(transform).flat()));let ar=cv.contourArea(corn)/(w*h);
 if(!hm.every(Number.isFinite)||Math.min(...den)*Math.max(...den)<=0||!cv.isContourConvex(corn)||ar<.15||ar>6)throw Error('변환이 지나치게 왜곡되었습니다. 사진과 기준점을 확인하세요.');
 const aligned=mat();cv.warpPerspective(cur,aligned,H,new cv.Size(w,h));
 const valid=mat(),white=own(new cv.Mat(cur.rows,cur.cols,cv.CV_8UC1,new cv.Scalar(255))),edge=own(cv.Mat.ones(19,19,cv.CV_8U));cv.warpPerspective(white,valid,H,new cv.Size(w,h),cv.INTER_NEAREST);cv.erode(valid,valid,edge);
 const overlap=cv.countNonZero(valid)/(w*h);if(overlap<.35)throw Error('공통 촬영 영역이 35% 미만입니다.');
 for(let i=0;i<aligned.data.length;i+=4){for(let c=0;c<3;c++)aligned.data[i+c]=Math.max(0,Math.min(255,aligned.data[i+c]*o.contrast+o.brightness));aligned.data[i+3]=255;}
 const processed=[];
 function detect(a){let g=gray(a),blur=mat(),eq=mat(),bh=mat(),binary=mat();cv.GaussianBlur(g,blur,new cv.Size(5,5),0);let clahe=own(new cv.CLAHE(2,new cv.Size(8,8)));clahe.apply(blur,eq);processed.push(eq);let kernel=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(21,21)));cv.morphologyEx(eq,bh,cv.MORPH_BLACKHAT,kernel);cv.threshold(bh,binary,o.threshold,255,cv.THRESH_BINARY);
 let labels=mat(),stats=mat(),centroids=mat();const n=cv.connectedComponentsWithStats(binary,labels,stats,centroids,8,cv.CV_32S),keep=new Uint8Array(n);
 for(let i=1;i<n;i++){let width=stats.intAt(i,2),height=stats.intAt(i,3),area=stats.intAt(i,4);if(area>=o.minimum&&Math.max(width,height)>=15&&area/(width*height)<.65)keep[i]=1}
 for(let i=0;i<w*h;i++)binary.data[i]=(keep[labels.data32S[i]]&&valid.data[i])?255:0;return binary;}
 const a=detect(ref),b=detect(aligned),da=mat(),db=mat(),tol=own(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(2*o.tolerance+1,2*o.tolerance+1)));cv.dilate(a,da,tol);cv.dilate(b,db,tol);
 let newly=0,lost=0;const overlay=mat();cv.addWeighted(ref,.5,aligned,.5,0,overlay);
 for(let i=0;i<w*h;i++){let color=null;if(a.data[i]||b.data[i])color=[40,160,170];if(b.data[i]&&!da.data[i]){newly++;color=[235,75,60]}if(a.data[i]&&!db.data[i]){lost++;color=[35,140,230]}for(let c=0;c<3;c++)overlay.data[4*i+c]=valid.data[i]?(color?color[c]:overlay.data[4*i+c]):overlay.data[4*i+c]*.25;overlay.data[4*i+3]=255;}
 // Zhang–Suen 세선화 후 중심선 연결 길이.
 function length(m){let s=Uint8Array.from(m.data,x=>x?1:0),remove=[],changed=true,loops=0;while(changed&&loops++<100){changed=false;for(let pass=0;pass<2;pass++){remove=[];for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let i=y*w+x;if(!s[i])continue;let p=[s[i-w],s[i-w+1],s[i+1],s[i+w+1],s[i+w],s[i+w-1],s[i-1],s[i-w-1]],n=p.reduce((a,b)=>a+b,0),t=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])t++;if(n<2||n>6||t!==1)continue;if(pass===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;remove.push(i)}if(remove.length)changed=true;for(const i of remove)s[i]=0;}}
 let l=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){let i=y*w+x;if(!s[i])continue;if(x+1<w&&s[i+1])l++;if(y+1<h&&s[i+w])l++;if(x+1<w&&y+1<h&&s[i+w+1]&&!s[i+1]&&!s[i+w])l+=Math.SQRT2;if(x>0&&y+1<h&&s[i+w-1]&&!s[i-1]&&!s[i+w])l+=Math.SQRT2;}return Math.round(l*100)/100;}
 let ma=cv.countNonZero(a),mb=cv.countNonZero(b),la=length(a),lb=length(b);const metrics={reference_area_px2:ma,current_area_px2:mb,area_delta_px2:mb-ma,new_candidate_area_px2:newly,missing_candidate_area_px2:lost,reference_length_px:la,current_length_px:lb,length_delta_px:Math.round((lb-la)*100)/100,area_change_percent:ma?100*(mb-ma)/ma:null,length_change_percent:la?100*(lb-la)/la:null};
 const warnings=['명암 규칙으로 검출한 균열 후보입니다. 얼룩·그림자를 육안 확인하세요.','신규·미검출 후보는 실제 진행·소멸을 확정하지 않습니다. 공통 영역만 비교합니다.'];if(manual)warnings.push('수동 4점은 독립적인 정렬 정확도 검증이 아닙니다.');if(o.scale){Object.assign(metrics,{approx_reference_area_mm2:ma*o.scale**2,approx_current_area_mm2:mb*o.scale**2,approx_reference_length_mm:la*o.scale,approx_current_length_mm:lb*o.scale,approx_area_delta_mm2:(mb-ma)*o.scale**2,approx_length_delta_mm:(lb-la)*o.scale});warnings.push('실단위는 기준 사진이 정면 또는 정사보정된 평면이며 척도가 정확할 때만 유효합니다.')}
 const vis=own(new cv.Mat(Math.max(h,cur.rows),w+cur.cols,cv.CV_8UC4,new cv.Scalar(230,230,230,255))),roi1=own(vis.roi(new cv.Rect(0,0,w,h))),roi2=own(vis.roi(new cv.Rect(w,0,cur.cols,cur.rows)));ref.copyTo(roi1);cur.copyTo(roi2);for(let i=0;i<Math.min(ip.length,60);i++)cv.line(vis,new cv.Point(ip[i][0]+w,ip[i][1]),new cv.Point(iq[i][0],iq[i][1]),new cv.Scalar(65,200,105,255),1);
 // 후보 마스크의 윤곽만 원본 사진 위에 표시한다.
 const refContour=mat(),curContour=mat();ref.copyTo(refContour);cur.copyTo(curContour);
 const currentOriginalMask=mat(),inv=mat();cv.invert(H,inv);cv.warpPerspective(b,currentOriginalMask,inv,new cv.Size(cur.cols,cur.rows),cv.INTER_NEAREST);
 function contours(mask,image){const curves=own(new cv.MatVector()),hier=mat(),copy=mat();mask.copyTo(copy);cv.findContours(copy,curves,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);cv.drawContours(image,curves,-1,new cv.Scalar(230,75,35,255),1);}
 contours(a,refContour);contours(currentOriginalMask,curContour);
 function pixels(m){let rgba=m;if(m.channels()!==4){rgba=mat();cv.cvtColor(m,rgba,cv.COLOR_GRAY2RGBA)}return {width:rgba.cols,height:rgba.rows,data:new Uint8ClampedArray(rgba.data)}}
 return {registration:{method:manual?'수동 기준점 4쌍':'ORB + RANSAC',matches,inliers:errors.length,inlier_ratio:errors.length/matches,median_error_px:median,overlap_ratio:overlap},metrics,warnings,parameters:o,homography_current_to_reference:[hm.slice(0,3),hm.slice(3,6),hm.slice(6)],processing_size:{reference:[w,h],current:[cur.cols,cur.rows]},images:{reference:pixels(ref),reference_contour:pixels(refContour),current_contour:pixels(curContour),reference_preprocessed:pixels(processed[0]),current_preprocessed:pixels(processed[1]),aligned:pixels(aligned),overlay:pixels(overlay),matches:pixels(vis),current_mask:pixels(b),reference_mask:pixels(a)}};
 }finally{for(let i=allocated.length-1;i>=0;i--)allocated[i].delete();}
}
if(typeof module!=='undefined')module.exports=cvAnalyze;
