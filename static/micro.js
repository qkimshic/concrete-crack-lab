/* Native-resolution ROI ridges; no rescaling or gap-filling. */
const MicroCracks=(()=>{
 function skeleton(mask,w,h){
  const a=Uint8Array.from(mask,v=>v?1:0),remove=[];let changed=true;
  while(changed){changed=false;for(let phase=0;phase<2;phase++){
   remove.length=0;
   for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;if(!a[i])continue;
    const p=[a[i-w],a[i-w+1],a[i+1],a[i+w+1],a[i+w],a[i+w-1],a[i-1],a[i-w-1]];
    const n=p.reduce((s,v)=>s+v,0);if(n<2||n>6)continue;
    let t=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])t++;if(t!==1)continue;
    if(phase===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;
    remove.push(i);
   }
   if(remove.length)changed=true;for(const i of remove)a[i]=0;
  }}return a;
 }
 function length(a,w,h){let n=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(!a[i])continue;
  if(x+1<w&&a[i+1])n++;if(y+1<h&&a[i+w])n++;
  if(x+1<w&&y+1<h&&a[i+w+1]&&!a[i+1]&&!a[i+w])n+=Math.SQRT2;
  if(x>0&&y+1<h&&a[i+w-1]&&!a[i-1]&&!a[i+w])n+=Math.SQRT2;
 }return n;}
 function analyze(image,roi,options={}){
  const threshold=options.threshold??1.8,minLength=options.minLength??10;
  if(!Number.isFinite(threshold)||threshold<.5||threshold>12||!Number.isFinite(minLength)||minLength<3||minLength>500)throw Error('미세균열 조정값의 입력 범위를 확인하세요.');
  const iw=image.width,ih=image.height;
  if(!roi||![roi.x,roi.y,roi.width,roi.height].every(Number.isFinite))throw Error('미세균열 분석 영역을 지정하세요.');
  const x0=Math.max(0,Math.floor(roi.x)),y0=Math.max(0,Math.floor(roi.y)),w=Math.min(iw-x0,Math.ceil(roi.width)),h=Math.min(ih-y0,Math.ceil(roi.height));
  if(w<5||h<5||w*h>200000)throw Error('미세균열 영역은 가로·세로 5px 이상, 200,000px² 이하로 지정하세요.');
  const gray=new Float32Array(iw*ih);for(let i=0;i<gray.length;i++)gray[i]=.299*image.data[4*i]+.587*image.data[4*i+1]+.114*image.data[4*i+2];
  function sample(a,sw,sh,x,y){x=Math.max(0,Math.min(sw-1,x));y=Math.max(0,Math.min(sh-1,y));const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;return (a[iy*sw+ix]*(1-fx)+a[iy*sw+Math.min(ix+1,sw-1)]*fx)*(1-fy)+(a[Math.min(iy+1,sh-1)*sw+ix]*(1-fx)+a[Math.min(iy+1,sh-1)*sw+Math.min(ix+1,sw-1)]*fx)*fy;}
  const margin=10,sw=w+margin*2,sh=h+margin*2,response=new Float32Array(w*h);
  for(const angle of (options.direction==='all'?[0,1,2,3,4,5,6,7]:h>=w?[0,1,7]:[3,4,5])){
   const nx=Math.cos(angle*Math.PI/8),ny=Math.sin(angle*Math.PI/8),tx=-ny,ty=nx,along=new Float32Array(sw*sh);
   for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
    let sum=0,weights=0;for(let step=-6;step<=6;step++){const weight=7-Math.abs(step);sum+=weight*sample(gray,iw,ih,x+x0-margin+tx*step,y+y0-margin+ty*step);weights+=weight;}along[y*sw+x]=sum/weights;
   }
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const center=along[(y+margin)*sw+x+margin],i=y*w+x;
    for(const r of [1,2,3,4,6]){
     const left=sample(along,sw,sh,x+margin-r*nx,y+margin-r*ny)-center;
     const right=sample(along,sw,sh,x+margin+r*nx,y+margin+r*ny)-center;
     response[i]=Math.max(response[i],Math.min(left,right));
    }
   }
  }
  const ridge=Float32Array.from(response);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x;
   if(options.direction!=='all'){
    const before=h>=w?response[y*w+Math.max(0,x-1)]:response[Math.max(0,y-1)*w+x];
    const after=h>=w?response[y*w+Math.min(w-1,x+1)]:response[Math.min(h-1,y+1)*w+x];
    if(response[i]<before||response[i]<=after)ridge[i]=0;
   }
  }
  const weak=Math.max(.45,threshold*.45),visited=new Uint8Array(w*h),mask=new Uint8Array(w*h),components=[];
  for(let start=0;start<response.length;start++){
   if(visited[start]||ridge[start]<weak)continue;
   const queue=[start];visited[start]=1;let seeded=false,sx=0,sy=0,sxx=0,syy=0,sxy=0;
   for(let k=0;k<queue.length;k++){
    const i=queue[k],x=i%w,y=Math.floor(i/w);if(ridge[i]>=threshold)seeded=true;
    sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
     const xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx<0||xx>=w||yy<0||yy>=h||visited[j]||ridge[j]<weak)continue;visited[j]=1;queue.push(j);
    }
   }
   const n=queue.length,vx=sxx/n-(sx/n)**2,vy=syy/n-(sy/n)**2,cov=sxy/n-sx*sy/n**2;
   const root=Math.sqrt((vx-vy)**2+4*cov**2),major=(vx+vy+root)/2,minor=Math.max(.05,(vx+vy-root)/2);
   if(!seeded||major/minor<3||Math.sqrt(major*12)<minLength)continue;
   for(const i of queue)mask[i]=1;components.push(queue);
  }
  let centerline=skeleton(mask,w,h),accepted=0;
  let longest=null,longestLength=0;for(const component of components){const single=new Uint8Array(w*h);for(const i of component)single[i]=centerline[i];if(length(single,w,h)<minLength){for(const i of component){mask[i]=0;centerline[i]=0;}}else {accepted++;const value=length(single,w,h);if(value>longestLength){longest=component;longestLength=value;}}}
  if(options.longest!==false&&longest){mask.fill(0);centerline.fill(0);for(const i of longest)mask[i]=1;centerline=skeleton(mask,w,h);accepted=1;}
  const crop=new Uint8ClampedArray(w*h*4),overlay=new Uint8ClampedArray(w*h*4),maskImage=new Uint8ClampedArray(w*h*4);let area=0,peak=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,j=((y+y0)*iw+x+x0)*4;crop.set(image.data.subarray(j,j+4),i*4);overlay.set(crop.subarray(i*4,i*4+4),i*4);
   if(mask[i]){area++;peak=Math.max(peak,response[i]);overlay[i*4]=220;overlay[i*4+1]=35;overlay[i*4+2]=35;}
   maskImage[i*4]=maskImage[i*4+1]=maskImage[i*4+2]=mask[i]?255:0;maskImage[i*4+3]=255;
  }
  return {roi:{x:x0,y:y0,width:w,height:h},native_size:[iw,ih],metrics:{candidate_area_px2:area,centerline_length_px:Math.round(length(centerline,w,h)*100)/100,component_count:accepted},parameters:{threshold,minLength,weak_threshold:weak,direction:options.direction==='all'?'all':'roi_long_axis',longest:options.longest!==false},method:'native_roi_directional_ridge_v1',units:'original_image_pixels',note:'가는 선의 중심 픽셀 검출값. 촬영 해상도와 명암에 따른 가는 균열 후보. 사진 간 원본 픽셀 수치를 직접 증감 비교하지 않음.',images:{original:{width:w,height:h,data:crop},overlay:{width:w,height:h,data:overlay},mask:{width:w,height:h,data:maskImage}}};
 }
 return {analyze};
})();
if(typeof module!=='undefined')module.exports=MicroCracks;
