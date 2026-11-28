const $=id=>document.getElementById(id);
const files={},photos={},points={reference:[],current:[]};
const checkpoints={reference:[],current:[]};
const photoKeys=['reference','current'];
let result=null,sample='',revision=0,busy=false,activeView='overlay';
let photoRevision=0,loadingExample=false;
const photoRequests={reference:0,current:0};
const microRegions={reference:null,current:null},regionStarts={reference:null,current:null};
const canvasIds={reference:'refCanvas',current:'curCanvas'};
const isManual=()=>$('mode').value.startsWith('manual');
const pointLimit=()=>10;
function updatePointStatus(){const n=pointLimit();$('pointStatus').textContent=`이전 ${points.reference.length}/${n} · 현재 ${points.current.length}/${n}`;}
function status(t,cls=''){$('status').textContent=t;$('status').className=cls;}
function invalidate(){revision++;if(result){result=null;$('result').hidden=true;$('empty').hidden=false;status('입력 또는 조정값이 변경되었습니다. 다시 분석하세요.','stale');}}
function updateCheckControls(){
 const {reference,current}=checkpoints;
 $('checkControls').hidden=$('photoAction').value!=='check'&&!reference.length&&!current.length;
 $('checkCount').textContent=`이전 ${reference.length}/2 · 현재 ${current.length}/2`;
 $('undoCheckReference').disabled=!reference.length;
 $('undoCheckCurrent').disabled=!current.length;
 $('clearChecks').disabled=!reference.length&&!current.length;
}
function clearCheckpoints(){
 for(const key of photoKeys)checkpoints[key]=[];
 updateCheckControls();
}
function updateBusyControls(){
 const locked=busy||loadingExample;
 for(const id of ['analyze','realSample','realSample2'])$(id).disabled=locked;
}
function render(key){
 const canvas=$(canvasIds[key]),image=photos[key];
 if(!image)return;
 canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.style.display='block';
 const {width,height}=canvas,ctx=canvas.getContext('2d');
 ctx.drawImage(image,0,0);
 const size=Math.max(4,Math.min(width,height)/85,5*width/(canvas.clientWidth||width));
 drawMicroRegion(ctx,key,width,height);
 ctx.font=`bold ${size*1.2}px sans-serif`;
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(const [list,color,prefix] of [[points[key],'#b74c2d',''],[checkpoints[key],'#1b6190','V']]){
  list.forEach(([x,y],i)=>{
   ctx.fillStyle=color;
   ctx.beginPath();ctx.arc(x*width,y*height,prefix?size*1.25:size,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='white';ctx.fillText(`${prefix}${i+1}`,x*width,y*height);
  });
 }
}
function renderPhotos(){
 for(const key of photoKeys)render(key);
 updatePointStatus();updateRoiStatus();updateCheckControls();
}
function showPhotoInfo(key,file,image){
 $(key==='reference'?'refName':'curName').textContent=`${file.name} · ${image.naturalWidth} × ${image.naturalHeight}px · ${file.type} · ${(file.size/1024/1024).toFixed(2)}MB`;
}
function syncFileSelection(key,file){
 const input=$(key);
 try{
  if(!file){input.value='';return true;}
  const selection=new DataTransfer();selection.items.add(file);input.files=selection.files;
  if(input.files.length===1&&input.files[0].name===file.name&&input.files[0].size===file.size)return true;
 }catch{}
 if(file&&input.files?.length===1&&input.files[0].name===file.name&&input.files[0].size===file.size)return true;
 input.value='';return false;
}
function clearSampleMetadata(){
 if(!sample)return;
 sample='';
 updatePathOption(false);
 for(const field of ['reference_date','current_date','location'])$(field).value='';
}
function rejectFileSelection(key){
 if(syncFileSelection(key,files[key]))return;
 delete files[key];delete photos[key];points[key]=[];microRegions[key]=null;regionStarts[key]=null;
 clearSampleMetadata();clearCheckpoints();
 $(canvasIds[key]).style.display='none';
 $(key==='reference'?'refName':'curName').textContent=key==='reference'?'사진을 선택하거나 여기에 놓으세요':'JPG · PNG · WEBP / 각 10MB 이하';
 invalidate();renderPhotos();
}
async function load(key,file){
 if(!file)return;
 photoRevision++;
 const request=++photoRequests[key];
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10485760){
  rejectFileSelection(key);
  status('JPG, PNG, WEBP 형식의 10MB 이하 사진을 사용하세요.','error');return;
 }
 invalidate();
 try{
  const image=await decodePhoto(file);
  if(request!==photoRequests[key])return;
  files[key]=file;photos[key]=image;syncFileSelection(key,file);
  points[key]=[];microRegions[key]=null;regionStarts[key]=null;
  clearSampleMetadata();clearCheckpoints();invalidate();
  showPhotoInfo(key,file,image);renderPhotos();
  status('사진 입력 완료. 조정값을 확인하고 분석하세요.');
 }catch{
  if(request===photoRequests[key]){rejectFileSelection(key);status('이미지를 읽을 수 없습니다.','error');}
 }
}
async function decodePhoto(file){
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
  return image;
 }finally{URL.revokeObjectURL(url);}
}
function photoPosition(event){
 const box=event.currentTarget.getBoundingClientRect();
 const normalize=value=>Math.max(0,Math.min(1-Number.EPSILON,value));
 return [normalize((event.clientX-box.left)/box.width),normalize((event.clientY-box.top)/box.height)];
}
for(const key of photoKeys){
 $(key).onchange=event=>load(key,event.target.files[0]);
 const area=$(key).closest('.upload');
 area.ondragover=event=>{event.preventDefault();area.classList.add('drag');};
 area.ondragleave=()=>area.classList.remove('drag');
 area.ondrop=event=>{event.preventDefault();area.classList.remove('drag');load(key,event.dataTransfer.files[0]);};
 $(canvasIds[key]).onclick=event=>{
  const action=$('photoAction').value;
  if(action==='micro'){selectMicroRegion(key,event);return;}
  if(action==='check'){
   if(checkpoints[key].length>=2)return;
   checkpoints[key].push(photoPosition(event));updateCheckControls();
  }else{
   if(!isManual()||points[key].length>=pointLimit())return;
   points[key].push(photoPosition(event));updatePointStatus();
  }
  invalidate();render(key);
 };
}
$('clearChecks').onclick=()=>{clearCheckpoints();renderPhotos();invalidate();};
for(const [id,key] of [['undoCheckReference','reference'],['undoCheckCurrent','current']]){
 $(id).onclick=()=>{checkpoints[key].pop();render(key);updateCheckControls();invalidate();};
}
for(const id of ['brightness','contrast','threshold','modelThreshold']){$(id).oninput=()=>{$(id+'Val').textContent=$(id).value;invalidate()}}
for(const id of ['minimum','tolerance','guideWidth','crackRegion','reference_date','current_date','location'])$(id).oninput=invalidate;
function updatePathOption(available){
 const option=$('detector').querySelector('[value="path"]');
 option.hidden=!available;option.disabled=!available;
 if(!available&&$('detector').value==='path')$('detector').value='unet';
 detectorControls();
}
function detectorControls(){
 const usingPath=$('detector').value==='path';
 $('crackRegion').disabled=usingPath;
 $('guideWidth').disabled=usingPath;
 $('fineSettings').hidden=usingPath;
 if(usingPath)$('crackRegion').value='all';
 const usingModel=$('detector').value==='unet';
 $('modelSettings').hidden=!usingModel;
 $('refineSettings').hidden=!usingModel;
 $('contrastSettings').hidden=usingModel&&!$('refine').checked;
}
$('detector').onchange=()=>{detectorControls();invalidate()};
$('refine').onchange=()=>{detectorControls();invalidate()};
$('mode').onchange=()=>{points.reference=[];points.current=[];$('manualHelp').hidden=!isManual();$('manualInstructions').textContent='두 사진의 같은 지점을 같은 순서로 2~10쌍 선택하세요.';renderPhotos();invalidate()};
$('clearPoints').onclick=()=>{points.reference=[];points.current=[];renderPhotos();invalidate()};
for(const [id,key] of [['undoReference','reference'],['undoCurrent','current']])$(id).onclick=()=>{points[key].pop();render(key);updatePointStatus();invalidate()};
$('reset').onclick=()=>{$('includeFine').checked=true;$('microThreshold').value=3.5;$('microThresholdVal').textContent='3.5';$('microMinimum').value=10;$('microDirection').value='axis';$('microLongest').checked=true;$('refine').checked=true;detectorControls();$('crackRegion').value='all';$('guideWidth').value=20;for(const [k,v] of Object.entries({brightness:0,contrast:1,threshold:8,modelThreshold:2,minimum:10,tolerance:3})){$(k).value=v;if($(k+'Val'))$(k+'Val').textContent=v}invalidate();status('조정값을 초기화했습니다.')};
function applyAnalysisPreset(precision) {
 if (precision && !isManual()) {
  $('mode').value='manual';
  $('mode').onchange();
 }
 const values=precision
  ? {threshold:8,modelThreshold:2,minimum:10,guideWidth:8,tolerance:3}
  : {threshold:6,modelThreshold:1,minimum:5,guideWidth:20,tolerance:3};
 for (const [id,value] of Object.entries(values)) {
  $(id).value=value;
  if ($(id+'Val')) $(id+'Val').textContent=value;
 }
 $('detector').value='unet';
 $('refine').checked=true;
 $('crackRegion').value=precision?'segment':'all';
 detectorControls();
 invalidate();
 status(precision
  ? '오검출 억제 설정. 균열 구간의 양끝을 포함해 같은 지점을 순서대로 지정하세요.'
  : '가는 균열 우선 설정. 검출 영역에서 그림자와 표면 무늬를 확인하세요.');
}
$('presetPrecision').onclick=()=>applyAnalysisPreset(true);
$('presetFine').onclick=()=>applyAnalysisPreset(false);
async function prepareExamplePhoto(item){
 const response=await fetch(`samples/${item.name}`);
 if(!response.ok)throw Error('실제 사진을 불러오지 못했습니다.');
 const file=new File([await response.blob()],item.name,{type:'image/jpeg'});
 const image=await decodePhoto(file);
 if(image.naturalWidth!==item.width||image.naturalHeight!==item.height)throw Error('실제 사진의 크기를 확인하세요.');
 return {item,file,image};
}
async function loadExample(example){
 if(busy||loadingExample)return;
 loadingExample=true;
 const request=++photoRevision;
 for(const key of photoKeys)photoRequests[key]++;
 invalidate();
 const initialRevision=revision;
 updateBusyControls();status('실제 사진을 불러오는 중…');
 try{
  const prepared=await Promise.all(example.photos.map(prepareExamplePhoto));
  if(request!==photoRevision||initialRevision!==revision){
   if(request===photoRevision)status('입력이 변경되었습니다. 사진을 다시 불러오세요.','stale');
   return;
  }
  $('reset').onclick();
  $('mode').value='manual';$('mode').onchange();
  updatePathOption(example.detector==='path');
  if(example.segment)applyAnalysisPreset(true);
  else{
   $('detector').value=example.detector||'unet';$('refine').checked=example.refine??true;detectorControls();
  }
  for(const [id,value] of Object.entries(example.settings||{})){
   $(id).value=value;
   if($(id+'Val'))$(id+'Val').textContent=value;
  }
  for(const {item,file,image} of prepared){
   const {key,width,height}=item;
   const normalize=([x,y])=>[x/width,y/height];
   files[key]=file;photos[key]=image;regionStarts[key]=null;
   microRegions[key]=item.roi||null;
   points[key]=item.points.map(normalize);
   checkpoints[key]=(item.checkpoints||[]).map(normalize);
   syncFileSelection(key,file);showPhotoInfo(key,file,image);
  }
  $('reference_date').value='';$('current_date').value='';$('location').value=example.location||'';
  sample=example.label;$('photoAction').value='points';
  renderPhotos();status('실제 균열 사진을 불러왔습니다.');
 }catch(error){status(error.message||'실제 사진을 불러오지 못했습니다.','error');}
 finally{loadingExample=false;updateBusyControls();}
}
for(const [id,example] of Object.entries(samplePairs))$(id).onclick=()=>loadExample(example);
function metric(label,value,unit){const box=document.createElement('div');box.className='stat';for(const [tag,t] of [['small',label],['strong',value],['em',unit]]){const a=document.createElement(tag);a.textContent=t;box.append(a)}return box}
function showView(view){if(!result)return;const scope=result.parameters.detector==='path'?'지정 경로 주변':result.segmentation.fine_detail?'분석 영역':result.comparison?.scope==='segment'?'지정 구간':result.parameters.guide?'대응점 주변':'사진 전체';activeView=view;$('resultLegend').hidden=view!=='overlay';$('viewExplanation').textContent=({overlay:result.comparison.assessment.status==='withheld'?'노란색: 판정 제외 · 어두운 영역: 분석 범위 밖':'어두운 영역: 공통 분석 범위 밖',reference_contour:`이전 ${scope}의 균열 후보 윤곽선입니다. 변화 비교는 공통 영역만 사용합니다.`,current_contour:`현재 ${scope}의 균열 후보 윤곽선입니다. 변화 비교는 공통 영역만 사용합니다.`,reference_preprocessed:result.segmentation.method.startsWith('U-Net')?'이전 사진의 U-Net 입력 RGB 영상입니다. (256×256px)':'기준 사진의 잡음 제거·국부 명암 보정 결과입니다.',current_preprocessed:result.segmentation.method.startsWith('U-Net')?'현재 사진의 U-Net 입력 RGB 영상입니다. (256×256px)':'현재 사진의 잡음 제거·국부 명암 보정 결과입니다.',matches:result.registration.manual?'같은 번호가 같은 지점입니다. 초록색은 사용, 빨간색은 제외된 점입니다.':'두 사진의 대응점 중 RANSAC으로 선택한 내점을 최대 60쌍 표시합니다.',aligned:'현재 사진을 기준 사진의 좌표계로 정렬했습니다.',current_mask:`현재 ${scope}의 균열 후보입니다. 흰색은 후보 픽셀입니다.`,reference_mask:`이전 ${scope}의 균열 후보입니다. 흰색은 후보 픽셀입니다.`})[view]||'';if(view==='matches'&&result.registration.verification.status!=='not_set')$('viewExplanation').textContent+=' 파란색 V1·V2는 정렬 확인점입니다.';$('resultImage').src=result.images[view];$('imageLink').href=result.images[view];document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view))}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
function display(){
 const {registration:r,metrics:m,comparison,metadata}=result;
 const assessment=comparison.assessment;
 $('empty').hidden=true;
 $('result').hidden=false;
 const matches=r.manual?`사용 ${r.inliers}/${r.matches}쌍`:`내점 ${r.inliers}/${r.matches}`;
 $('quality').textContent=`${result.segmentation.method} · ${r.method} · ${matches}`;
 $('overlap').textContent=`사진 겹침 ${(r.overlap_ratio*100).toFixed(1)}%`;
 $('scopeSummary').hidden=!result.parameters.guide;
 const scope=result.segmentation.fine_detail?'가는 균열 포함':comparison.scope==='segment'?'지정 구간':'대응점 주변';
 $('scopeSummary').textContent=`${scope} · 공통 분석 ${comparison.analysis_area_px2.toLocaleString()}px²`;

 const reasonLabels={
  similarity_only:'원근 정렬 필요',
  few_correspondences:'유효 대응점 부족',
  registration_error:'정렬 잔차 큼',
  checkpoint_failed:'정렬 확인점 검증 실패',
  missing_baseline:'한쪽 이상에서 균열 후보 미검출'
 };
 const decision=assessment.status==='withheld'
  ?`변화 판단 보류 · ${reasonLabels[assessment.reason]}`
  :`${assessment.status==='review'?'변화 후보 확인 필요':'허용 범위 밖 변화 후보 없음'} · 허용 거리 ${assessment.applied_tolerance_px}px · 최소 구간 ${assessment.minimum_segment_length_px}px`;
 $('changeSummary').textContent=decision;
 displayVerification(r.verification,assessment.reason);
 const number=value=>value===null?'—':value.toLocaleString(undefined,{maximumFractionDigits:2});
 $('stats').replaceChildren(
  metric('신규 후보 길이',number(m.new_candidate_length_px),'px'),
  metric('미검출 후보 길이',number(m.missing_candidate_length_px),'px'),
  metric('정렬 잔차 중앙값',r.median_error_px===null?'—':r.median_error_px.toFixed(2),'px · 대응점 기준')
 );
 const rows=[
  ['후보 면적 (px²)',m.reference_area_px2,m.current_area_px2,m.area_delta_px2],
  ['중심선 길이 (px)',m.reference_length_px,m.current_length_px,m.length_delta_px]
 ];
 $('measurements').replaceChildren(...rows.map(row=>{
  const tr=document.createElement('tr');
  row.forEach((value,i)=>{
   const td=document.createElement('td');
   td.textContent=i===0?value:i===3&&assessment.status==='withheld'?'—':`${i===3&&value>0?'+':''}${number(value)}`;
   tr.append(td);
  });
  return tr;
 }));
 $('warnings').replaceChildren(...result.warnings.map(text=>{
  const p=document.createElement('p');
  p.textContent=text;
  return p;
 }));
 $('meta').textContent=`${metadata.location||'위치 미입력'} · ${metadata.reference_date||'날짜 미입력'} → ${metadata.current_date||'날짜 미입력'} · 기준 처리 크기 ${result.processing_size.reference.join(' × ')}px${metadata.sample?' · '+metadata.sample:''}`;
 $('inspectionSaveStatus').textContent='';
 showView('overlay');
}
function displayVerification(verification,assessmentReason){
 const {status:state,reason,points:checks,threshold_px:threshold}=verification;
 const summary=$('verificationSummary'),help=$('recaptureHelp');
 const errors=checks.map((check,index)=>`V${index+1} ${check.error_px===null?'—':`${check.error_px.toFixed(2)}px`}`);
 summary.textContent=state==='not_set'?'정렬 확인점 미지정':
  `정렬 확인 ${state==='passed'?'통과':'미통과'} · ${errors.join(' · ')} · 기준 ${threshold}px`;
 let advice='';
 if(reason==='reused_fit_point')advice='대응점과 떨어진 같은 벽면의 고정점을 확인점으로 선택하세요.';
 if(reason==='outside_overlap')advice='두 사진에 공통으로 보이는 벽면 안에서 확인점을 지정하세요.';
 if(reason==='error_exceeded')advice='확인점 순서와 위치를 확인하세요. 오차가 계속 크면 같은 벽면이 넓게 겹치도록 다시 촬영하세요.';
 if(!advice&&['similarity_only','few_correspondences','registration_error'].includes(assessmentReason)){
  advice='같은 벽면의 고정점을 위·아래와 좌·우에 분산해 지정하세요. 고정점이 적으면 촬영 위치를 가까운 각도로 맞추세요.';
 }
 help.textContent=advice;help.hidden=!advice;
}
function analysisOptions(){
 const ranges=[['brightness',-60,60,'밝기'],['contrast',.5,2,'대비'],['threshold',5,100,'선 검출 임계값'],
  ['modelThreshold',.1,50,'분할 임계값'],['minimum',5,2000,'최소 연결 영역'],['tolerance',0,15,'허용 거리'],['guideWidth',3,80,'주변 반폭']];
 const options={};
 for(const [id,low,high,label] of ranges){
  const field=$(id),value=Number(field.value);
  if(field.value.trim()===''||!Number.isFinite(value)||value<low||value>high)throw Error(`${label}은 ${low}~${high} 범위로 입력하세요.`);
  options[id]=value;
 }
 options.detector=$('detector').value;
 if(options.detector==='path'){
  options.crackGuides=Object.fromEntries(samplePairs.realSample2.photos.map(item=>[item.key,item.crackGuide]));
 }
 options.refine=options.detector==='unet'&&$('refine').checked;
 options.guide=$('crackRegion').value!=='all';
 options.guideScope=$('crackRegion').value==='segment'?'segment':'extended';
 options.fineEnabled=options.detector!=='path'&&$('includeFine').checked;
 return options;
}
function fineAnalysis(){
 const options={threshold:Number($('microThreshold').value),minLength:Number($('microMinimum').value),
  direction:$('microDirection').value,longest:$('microLongest').checked};
 const fine={};
 for(const key of photoKeys){
  if(!microRegions[key])continue;
  const detail=MicroCracks.analyze(nativePhotoData(key),microRegions[key],options);
  fine[key]={roi:detail.roi,native_size:detail.native_size,parameters:detail.parameters,metrics:detail.metrics,mask:detail.images.mask};
 }
 return fine;
}
$('analyze').onclick=async()=>{
 if(busy||loadingExample)return;
 if(!files.reference||!files.current){status('이전 사진과 현재 사진을 모두 입력하세요.','error');return;}
 if(isManual()&&(points.reference.length<2||points.reference.length!==points.current.length)){
  status('각 사진에 같은 수의 대응점을 2~10쌍 지정하세요.','error');return;
 }
 const {reference,current}=checkpoints;
 if((reference.length||current.length)&&(reference.length!==2||current.length!==2)){
  status('두 사진에서 확인점 V1·V2를 각각 지정하거나 지우세요.','error');return;
 }
 if($('crackRegion').value!=='all'&&!isManual()){
  status('구간 분석은 수동 대응점을 지정한 뒤 실행하세요.','error');return;
 }
 const reference_date=$('reference_date').value,current_date=$('current_date').value;
 if(reference_date&&current_date&&current_date<reference_date){status('현재 촬영 날짜는 이전 촬영 날짜보다 빠를 수 없습니다.','error');return;}
 const version=revision;
 busy=true;updateBusyControls();
 result=null;$('result').hidden=true;$('empty').hidden=false;
 status('특징점 정렬 및 균열 후보를 분석하는 중…');
 try{
  if(!window.cv||!cv.Mat)throw Error('분석 엔진을 불러오는 중입니다. 잠시 후 다시 실행하세요.');
  await new Promise(resolve=>setTimeout(resolve,80));
  if(version!==revision){status('분석 중 입력이 변경되었습니다. 다시 실행하세요.','stale');return;}
  const options=analysisOptions();
  const metadata={reference_date,current_date,location:$('location').value,sample,
   reference_file:files.reference.name,current_file:files.current.name};
  const fine=options.fineEnabled?fineAnalysis():{};
  const data=await cvAnalyze(cv,photoData('reference'),photoData('current'),options,
   isManual()?structuredClone(points):null,
   image=>UnetSegmentation.segment(image,message=>{if(version===revision)status(message);}),fine,structuredClone(checkpoints));
  if(version!==revision){status('분석 중 입력이 변경되었습니다. 다시 실행하세요.','stale');return;}
  data.metadata=metadata;
  for(const [key,pixels] of Object.entries(data.images)){
   const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
   canvas.getContext('2d').putImageData(new ImageData(pixels.data,pixels.width,pixels.height),0,0);
   data.images[key]=canvas.toDataURL('image/png');
  }
  result=data;display();status('분석 완료. 특징점 대응과 검출 영역을 함께 확인하세요.');
 }catch(error){status(error.message,'error');}
 finally{busy=false;updateBusyControls();}
};
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$('downloadPng').onclick=async()=>{
 if(!result)return;
 const view=activeView;
 download(await(await fetch(result.images[view])).blob(),`crack-${view}.png`);
};
$('downloadJson').onclick=()=>{
 if(!result)return;
 const {images,...record}=result;
 download(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),'crack-analysis.json');
};
$('downloadCsv').onclick=()=>{
 if(!result)return;
 const verification=result.registration.verification;
 const rows={...result.metrics,...result.comparison.assessment,verification_status:verification.status,
  verification_max_error_px:verification.max_error_px};
 verification.points.forEach((point,i)=>{rows[`verification_${i+1}_error_px`]=point.error_px;});
 const csv='\ufeff측정항목,값\n'+Object.entries(rows).map(([k,v])=>`${k},${v??''}`).join('\n');
 download(new Blob([csv],{type:'text/csv;charset=utf-8'}),'crack-measurements.csv');
};
initializeInspectionHistory(()=>result,download);

function photoData(key){const im=photos[key],scale=Math.min(1,1400/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*scale);c.height=Math.round(im.naturalHeight*scale);const ctx=c.getContext('2d');ctx.drawImage(im,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height);}


function updateRoiStatus(){
 $('roiStatus').textContent=['reference','current'].map(k=>{const r=microRegions[k];return `${k==='reference'?'이전':'현재'} 영역: ${r?`${r.width} × ${r.height}px`:'미지정'}`}).join(' · ');
}
function drawMicroRegion(ctx,key,w,h){
 const r=microRegions[key],start=regionStarts[key],line=Math.max(1,Math.min(w,h)/250);
 ctx.save();ctx.lineWidth=line*2;ctx.strokeStyle='#fff';
 if(r){ctx.strokeRect(r.x,r.y,r.width,r.height);ctx.lineWidth=line;ctx.strokeStyle='#111';ctx.setLineDash([line*3,line*2]);ctx.strokeRect(r.x,r.y,r.width,r.height);}
 if(start){ctx.setLineDash([]);ctx.beginPath();ctx.arc(start[0]*w,start[1]*h,line*3,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
function selectMicroRegion(key,event){
 if(!photos[key])return;
 const p=photoPosition(event);
 if(!regionStarts[key]){regionStarts[key]=p;render(key);status('같은 사진에서 반대쪽 모서리를 클릭하세요.');return;}
 const a=regionStarts[key],im=photos[key],x=Math.floor(Math.min(a[0],p[0])*im.naturalWidth),y=Math.floor(Math.min(a[1],p[1])*im.naturalHeight);
 const width=Math.min(im.naturalWidth-x,Math.ceil(Math.abs(a[0]-p[0])*im.naturalWidth)),height=Math.min(im.naturalHeight-y,Math.ceil(Math.abs(a[1]-p[1])*im.naturalHeight));
 regionStarts[key]=null;
 if(width<5||height<5||width*height>200000){status('가로·세로 5px 이상, 200,000px² 이하의 영역을 지정하세요.','error');render(key);return;}
 microRegions[key]={x,y,width,height};invalidate();render(key);updateRoiStatus();status('분석 영역이 지정되었습니다.');
}
$('photoAction').onchange=()=>{for(const key of photoKeys)regionStarts[key]=null;renderPhotos();};
for(const [id,key] of [['clearMicroReference','reference'],['clearMicroCurrent','current']])$(id).onclick=()=>{microRegions[key]=null;regionStarts[key]=null;invalidate();render(key);updateRoiStatus()};
for(const id of ['microThreshold','microMinimum','microDirection','microLongest','includeFine'])$(id).oninput=()=>{$('microThresholdVal').textContent=$('microThreshold').value;invalidate()};
function nativePhotoData(key){const im=photos[key],c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;c.getContext('2d').drawImage(im,0,0);return c.getContext('2d').getImageData(0,0,c.width,c.height)}
updateRoiStatus();updateCheckControls();
