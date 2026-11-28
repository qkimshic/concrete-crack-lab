function initializeInspectionHistory(getResult, download) {
 const storageKey = 'concrete-crack-lab.inspections.v1';
 const form = document.getElementById('inspectionForm');
 const entryId = document.getElementById('inspectionCrackId');
 const action = document.getElementById('inspectionNextAction');
 const saveStatus = document.getElementById('inspectionSaveStatus');
 const search = document.getElementById('inspectionSearch');
 const list = document.getElementById('inspectionList');
 const detail = document.getElementById('inspectionDetail');
 const status = document.getElementById('historyStatus');
 const number = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2});
 let selectedId = '';
 const statusLabels = {
  withheld: '판단 보류',
  review: '변화 후보 확인 필요',
  none_detected: '허용 범위 밖 변화 후보 없음'
 };

 function read() {
  const records = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(records) || records.some(record => !record || typeof record.id !== 'string' ||
   typeof record.crack_id !== 'string' || typeof record.next_action !== 'string' ||
   typeof record.saved_at !== 'string' || !record.analysis?.comparison?.assessment ||
   !record.analysis.metadata || !record.analysis.metrics || !record.analysis.registration)) {
   throw Error('점검 기록 형식을 읽을 수 없습니다.');
  }
  return records;
 }

 function write(records) {
  localStorage.setItem(storageKey, JSON.stringify(records));
 }

 function element(tag, content) {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
 }

 function measurement(value, unit) {
  return Number.isFinite(value) ? `${number.format(value)} ${unit}` : '—';
 }

 function showDetail(entry) {
  const {metadata, comparison, metrics, registration} = entry.analysis;
  const verification = registration.verification;
  const verificationLabels = {passed:'통과', failed:'미통과', not_set:'미지정'};
  const views = [
   ['위치', metadata.location || '미입력'],
   ['촬영 날짜', `${metadata.reference_date || '미입력'} → ${metadata.current_date || '미입력'}`],
   ['사진 파일', `${metadata.reference_file || '—'} → ${metadata.current_file || '—'}`],
   ['판정', statusLabels[comparison.assessment.status] || '—'],
   ['정렬 확인', `${verificationLabels[verification?.status] || '미지정'} · 최대 오차 ${measurement(verification?.max_error_px, 'px')}`],
   ['후보 면적', `${measurement(metrics.reference_area_px2,'px²')} → ${measurement(metrics.current_area_px2,'px²')}`],
   ['중심선 검출 길이', `${measurement(metrics.reference_length_px,'px')} → ${measurement(metrics.current_length_px,'px')}`],
   ['신규 / 미검출 후보 길이', `${measurement(metrics.new_candidate_length_px,'px')} / ${measurement(metrics.missing_candidate_length_px,'px')}`],
   ['다음 조치', entry.next_action || '미입력'],
   ['기록 저장 시각', new Date(entry.saved_at).toLocaleString('ko-KR')]
  ];
  const fields = document.createElement('dl');
  for (const [label, value] of views) fields.append(element('dt', label), element('dd', value));
  const buttons = document.createElement('div');
  buttons.className = 'manual-buttons';
  const save = element('button', '기록 JSON 저장');
  save.type = 'button';
  save.onclick = () => {
   const {analysis, ...inspection} = entry;
   const data = JSON.stringify({...analysis, inspection}, null, 2);
   download(new Blob([data], {type: 'application/json'}), 'crack-inspection.json');
  };
  const remove = element('button', '기록 삭제');
  remove.type = 'button';
  remove.onclick = () => {
   if (!window.confirm('선택한 점검 기록을 삭제할까요?')) return;
   try {
    write(read().filter(record => record.id !== entry.id));
    selectedId = '';
    render();
   } catch {
    status.textContent = '점검 기록을 삭제할 수 없습니다.';
   }
  };
  buttons.append(save, remove);
  detail.replaceChildren(element('h3', entry.crack_id), fields, buttons);
  detail.hidden = false;
 }

 function render(focusSelected = false) {
  list.replaceChildren();
  detail.hidden = true;
  detail.replaceChildren();
  let records;
  try {
   records = read();
  } catch {
   status.textContent = '브라우저의 점검 기록을 불러올 수 없습니다.';
   return;
  }
  const query = search.value.trim().toLocaleLowerCase();
  const date = r => r.analysis.metadata.current_date || r.saved_at.slice(0,10);
  const matching = records.filter(record => [record.crack_id, record.analysis.metadata.location]
   .some(value => String(value || '').toLocaleLowerCase().includes(query)))
   .sort((a,b) => date(b).localeCompare(date(a)) || b.saved_at.localeCompare(a.saved_at));
  status.textContent = matching.length ? `${matching.length}건` :
   query ? '검색 결과가 없습니다.' : '저장된 점검 기록이 없습니다.';
  for (const entry of matching) {
   const item = document.createElement('li');
   const button = document.createElement('button');
   button.type = 'button';
   button.append(element('strong', entry.crack_id),
    element('span', entry.analysis.metadata.location || '위치 미입력'),
    element('span', statusLabels[entry.analysis.comparison.assessment.status] || '—'),
    element('span', entry.analysis.metadata.current_date || `저장 ${date(entry)}`));
   button.onclick = () => {
    selectedId = entry.id;
    render(true);
   };
   item.append(button);
   list.append(item);
   if (entry.id === selectedId) {
    button.setAttribute('aria-current', 'true');
    showDetail(entry);
    if (focusSelected) button.focus();
   }
  }
 }

 form.addEventListener('input', () => { saveStatus.textContent = ''; });
 form.onsubmit = event => {
  event.preventDefault();
  saveStatus.textContent = '';
  const result = getResult();
  const crackId = entryId.value.trim();
  if (!result || !crackId) {
   saveStatus.textContent = result ? '균열 ID를 입력하세요.' : '먼저 분석을 실행하세요.';
   return;
  }
  const {images, ...analysis} = result;
  const record = {
   id: crypto.randomUUID(),
   crack_id: crackId,
   next_action: action.value.trim(),
   saved_at: new Date().toISOString(),
   analysis
  };
  try {
   write([...read(), record]);
  } catch {
   saveStatus.textContent = '브라우저에 저장할 수 없습니다. 분석 기록 JSON을 내려받으세요.';
   return;
  }
  selectedId = record.id;
  search.value = '';
  render();
  const link = element('a', '점검 이력에서 열기');
  link.href = '#inspectionHistory';
  saveStatus.replaceChildren(document.createTextNode('점검 기록을 저장했습니다. '), link);
  action.value = '';
 };

 search.addEventListener('input', () => render());
 window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) render();
 });
 render();
}
