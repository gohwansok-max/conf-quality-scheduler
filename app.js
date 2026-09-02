/**
 * (주)코엔에프 자가품질검사 스케줄러 - Supabase 실시간 클라우드 연동 버전
 */

// ==================== 1. Runtime & Supabase Client Setup ====================
const CONF_RUNTIME_CONFIG = window.CONF_RUNTIME_CONFIG || {};
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}
const LOCAL_FILE_DB_NAME = 'KoenfQualityFileCache';
const LOCAL_FILE_DB_VERSION = 1;
const LOCAL_FILE_STORE = 'files';
const LOCAL_CERTIFICATE_FILE_MAP_KEY = 'koenf_local_certificate_file_map_v1';

function openLocalFileDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_FILE_DB_NAME, LOCAL_FILE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_FILE_STORE)) database.createObjectStore(LOCAL_FILE_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('브라우저 파일 저장소를 열지 못했습니다.'));
  });
}

async function saveFileToLocalCache(key, file) {
  const database = await openLocalFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCAL_FILE_STORE, 'readwrite');
    const request = transaction.objectStore(LOCAL_FILE_STORE).put({ key, file, name: file.name, type: file.type, size: file.size, savedAt: new Date().toISOString() });
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error('파일을 이 브라우저에 보관하지 못했습니다.'));
  });
}

async function getFileFromLocalCache(key) {
  const database = await openLocalFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCAL_FILE_STORE, 'readonly');
    const request = transaction.objectStore(LOCAL_FILE_STORE).get(key);
    request.onsuccess = () => resolve(request.result?.file || null);
    request.onerror = () => reject(request.error || new Error('브라우저 보관 파일을 읽지 못했습니다.'));
  });
}

async function deleteFileFromLocalCache(key) {
  const database = await openLocalFileDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(LOCAL_FILE_STORE, 'readwrite');
    const request = transaction.objectStore(LOCAL_FILE_STORE).delete(key);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error || new Error('브라우저 보관 파일을 삭제하지 못했습니다.'));
  });
}

function getLocalCertificateFileMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_CERTIFICATE_FILE_MAP_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setLocalCertificateFileMap(map) {
  localStorage.setItem(LOCAL_CERTIFICATE_FILE_MAP_KEY, JSON.stringify(map));
}

function hasLocalCertificateFile(certificateId) {
  return Boolean(getLocalCertificateFileMap()[String(certificateId)]);
}

function registerLocalCertificateFile(certificateId, fileKey) {
  const map = getLocalCertificateFileMap();
  map[String(certificateId)] = fileKey;
  setLocalCertificateFileMap(map);
}

async function clearLocalCertificateFile(certificateId) {
  const map = getLocalCertificateFileMap();
  const fileKey = map[String(certificateId)];
  if (!fileKey) return;
  delete map[String(certificateId)];
  setLocalCertificateFileMap(map);
  try {
    await deleteFileFromLocalCache(fileKey);
  } catch (error) {
    console.warn('로컬 성적서 파일 정리 실패:', error);
  }
}

async function downloadLocalCertificateFile(certificateId) {
  const fileKey = getLocalCertificateFileMap()[String(certificateId)];
  if (!fileKey) {
    showToast('이 브라우저에 보관된 성적서 파일을 찾지 못했습니다.', 'error');
    return;
  }
  try {
    const file = await getFileFromLocalCache(fileKey);
    if (!file) throw new Error('파일이 없습니다.');
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name || '성적서.pdf';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error('로컬 성적서 다운로드 실패:', error);
    showToast('이 브라우저에 보관된 성적서 파일을 열지 못했습니다.', 'error');
  }
}

function getHealthCertificateDownloadUrl(certificate) {
  return certificate?.fileUrl || '';
}

function downloadHealthFile(certificateId) {
  const certificate = appState.healthCerts.find(item => Number(item.id) === Number(certificateId));
  const url = getHealthCertificateDownloadUrl(certificate);
  if (url) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  showToast('보관된 보건증 PDF 파일이 없습니다. 파일을 다시 업로드해 주세요.', 'error');
}

function getCertificateFileUrl(certificate) {
  const rawUrl = String(certificate?.fileUrl || '').trim();
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl, window.location.href);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch (error) {
    console.warn('성적서 파일 URL 형식 오류:', error);
    return '';
  }
}

function getCertificateDownloadUrl(certificate) {
  const fileUrl = getCertificateFileUrl(certificate);
  if (!fileUrl) return '';
  try {
    const url = new URL(fileUrl);
    if (certificate?.fileName) url.searchParams.set('download', certificate.fileName);
    return url.href;
  } catch (error) {
    return fileUrl;
  }
}

function getCertificateFileKind(certificate) {
  const name = String(certificate?.fileName || getCertificateFileUrl(certificate)).toLowerCase().split('?')[0];
  if (/\.pdf$/.test(name)) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image';
  return 'other';
}

function getCertificateById(certificateId) {
  return appState.certificates.find(item => Number(item.id) === Number(certificateId));
}

function openCertificateViewer(certificateId) {
  const certificate = getCertificateById(certificateId);
  const fileUrl = getCertificateFileUrl(certificate);
  if (certificate && !fileUrl && hasLocalCertificateFile(certificateId)) {
    void downloadLocalCertificateFile(certificateId);
    return;
  }
  if (!certificate || !fileUrl) {
    showToast('첨부 파일이 보관되지 않은 기존 성적서입니다. 파일 보완을 눌러 다시 첨부하세요.', 'error');
    return;
  }

  const fileName = certificate.fileName || '성적서 파일';
  const preview = document.getElementById('cert-preview-content');
  const title = document.getElementById('cert-preview-title');
  const meta = document.getElementById('cert-preview-meta');
  const openLink = document.getElementById('cert-preview-new-tab');
  if (!preview || !title || !meta || !openLink) return;

  title.textContent = certificate.certNumber || '검사 성적서 열람';
  meta.textContent = fileName;
  openLink.href = fileUrl;
  const escapedUrl = escapeHtml(fileUrl);
  const kind = getCertificateFileKind(certificate);
  if (kind === 'pdf') {
    preview.innerHTML = `<iframe src="${escapedUrl}" title="${escapeHtml(fileName)}" class="h-[65vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" loading="lazy"></iframe>`;
  } else if (kind === 'image') {
    preview.innerHTML = `<div class="flex h-[65vh] items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950"><img src="${escapedUrl}" alt="${escapeHtml(fileName)}" class="max-h-full max-w-full rounded object-contain"></div>`;
  } else {
    preview.innerHTML = `<div class="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"><i data-lucide="file" class="h-8 w-8 text-blue-500"></i><p>이 파일 형식은 앱에서 미리 볼 수 없습니다.</p><a href="${escapedUrl}" target="_blank" rel="noopener" class="font-semibold text-blue-600 hover:underline">새 탭에서 열기</a></div>`;
  }
  openModal('modal-cert-preview');
}

function downloadCertFile(certificateId) {
  const certificate = getCertificateById(certificateId);
  const downloadUrl = getCertificateDownloadUrl(certificate);
  if (certificate && !downloadUrl && hasLocalCertificateFile(certificateId)) {
    void downloadLocalCertificateFile(certificateId);
    return;
  }
  if (!certificate || !downloadUrl) {
    showToast('첨부 파일이 보관되지 않은 기존 성적서입니다. 파일 보완을 눌러 다시 첨부하세요.', 'error');
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = certificate.fileName || '성적서 파일';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function certificateFileActionMarkup(certificate, mobile = false) {
  const buttonClass = mobile
    ? 'mobile-certificate-primary'
    : 'inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300';
  const compactClass = mobile
    ? 'mobile-certificate-primary bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
    : 'inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200';
  const id = Number(certificate.id);
  if (hasLocalCertificateFile(id)) {
    return `<button type="button" onclick="downloadLocalCertificateFile(${id})" class="${buttonClass}" title="이 브라우저에만 보관된 성적서 파일"><i data-lucide="download" class="w-3.5 h-3.5"></i><span>이 브라우저 파일</span></button>`;
  }
  if (!getCertificateFileUrl(certificate)) {
    return `<button type="button" onclick="openReplaceCertFileModal(${id})" class="${compactClass}" title="파일 보완"><i data-lucide="paperclip" class="w-3.5 h-3.5"></i><span>파일 보완</span></button>`;
  }
  return `<button type="button" onclick="openCertificateViewer(${id})" class="${buttonClass}" title="성적서 열람"><i data-lucide="eye" class="w-3.5 h-3.5"></i><span>열람</span></button><button type="button" onclick="downloadCertFile(${id})" class="${compactClass}" title="성적서 다운로드"><i data-lucide="download" class="w-3.5 h-3.5"></i><span>다운로드</span></button>`;
}

function certificateAssignmentActionMarkup(certificate, mobile = false) {
  const classification = getCertificateClassification(certificate);
  const completed = Boolean(classification.product && classification.type && classification.manufactureDate);
  const className = mobile
    ? 'mobile-certificate-primary bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200'
    : 'inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300';
  const label = completed ? '정보 수정' : '제품·유형 입력';
  return `<button type="button" onclick="openCertificateAssignmentModal(${Number(certificate.id)})" class="${className}" title="제품·식품유형·제조일 입력"><i data-lucide="link-2" class="w-3.5 h-3.5"></i><span>${label}</span></button>`;
}


// ==================== 성적서 유형·제조일 메타데이터 및 이력 시각화 ====================
const CERTIFICATE_METADATA_KEY = 'certificate_metadata_v1';
let certificateCalendarMonth = '';

function getCertificateMetadataMap() {
  const raw = appState.settings?.[CERTIFICATE_METADATA_KEY];
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const records = parsed?.records || parsed;
    return records && typeof records === 'object' ? records : {};
  } catch (error) {
    console.warn('성적서 분류 메타데이터를 읽지 못했습니다.', error);
    return {};
  }
}

function getCertificateMeta(certificateId) {
  return getCertificateMetadataMap()[String(certificateId)] || {};
}

function getCertificateClassification(certificate) {
  const meta = getCertificateMeta(certificate?.id);
  const product = appState.products.find(item => Number(item.id) === Number(certificate?.productId));
  const typeId = Number(meta.typeId || product?.typeId || 0);
  const type = appState.types.find(item => Number(item.id) === typeId) || null;
  const manufactureDate = meta.manufactureDate || product?.lastManufactureDate || '';
  const source = meta.source || (product ? '제품 연동' : '미분류');
  return { typeId, type, manufactureDate, source, product };
}

function getCertificateTypeLabel(certificate) {
  const classification = getCertificateClassification(certificate);
  return classification.type?.name || '미분류';
}

function getCertificateManufactureDate(certificate) {
  return getCertificateClassification(certificate).manufactureDate || '';
}

function getCertificateScheduledInspectionDate(certificate) {
  const metadata = getCertificateMeta(certificate?.id);
  const classification = getCertificateClassification(certificate);
  // 저장된 날짜는 기록용이며, 화면·캘린더는 현재 유형 주기로 항상 다시 계산합니다.
  if (classification.type && classification.manufactureDate) {
    return calcNextDeadline(classification.manufactureDate, Number(classification.type.intervalMonths || 0));
  }
  return metadata.scheduledInspectionDate || '';
}

function suggestCertificateTypeId(certificate) {
  const normalizedName = String(certificate?.fileName || '').toLowerCase().replace(/[·\s]/g, '');
  const matchedType = appState.types.find(type => {
    const normalizedType = String(type.name || '').toLowerCase().replace(/[·\s]/g, '');
    return normalizedType && normalizedName.includes(normalizedType);
  });
  if (matchedType) return Number(matchedType.id);
  if (normalizedName.includes('과채주스')) return Number(appState.types.find(type => String(type.name).includes('과·채'))?.id || 0);
  return 0;
}

function updateCertificateSchedulePreview(certificateId) {
  const typeId = Number(document.getElementById(`cert-schedule-type-${certificateId}`)?.value || 0);
  const manufactureDate = document.getElementById(`cert-schedule-manufacture-${certificateId}`)?.value || '';
  const output = document.getElementById(`cert-schedule-due-${certificateId}`);
  const type = appState.types.find(item => Number(item.id) === typeId);
  const scheduledDate = type && manufactureDate ? calcNextDeadline(manufactureDate, Number(type.intervalMonths || 0)) : '';
  if (output) output.value = scheduledDate || '';
  const state = document.getElementById(`cert-schedule-state-${certificateId}`);
  if (state) state.textContent = scheduledDate ? `${type.name} · ${type.intervalMonths}개월 주기` : '식품유형과 제조일을 입력하세요.';
}

function buildCertificateScheduleRows() {
  const rows = document.getElementById('bulk-cert-schedule-list');
  if (!rows) return;
  const typeOptions = appState.types.map(type => `<option value="${type.id}">${escapeHtml(type.name)} · ${type.intervalMonths}개월</option>`).join('');
  rows.innerHTML = appState.certificates.map(certificate => {
    const classification = getCertificateClassification(certificate);
    const typeId = classification.typeId || suggestCertificateTypeId(certificate) || '';
    const manufactureDate = classification.manufactureDate || '';
    const scheduledDate = getCertificateScheduledInspectionDate(certificate);
    const description = `${certificate.certNumber || '번호 미입력'} · 검사일 ${formatCertificateDate(certificate.inspectionDate)}`;
    return `<article class="certificate-schedule-row">
      <div class="certificate-schedule-title"><strong>${escapeHtml(description)}</strong><span title="${escapeHtml(certificate.fileName || '')}">${escapeHtml(certificate.fileName || '파일명 없음')}</span></div>
      <label><span>식품유형 *</span><select id="cert-schedule-type-${certificate.id}" onchange="updateCertificateSchedulePreview(${certificate.id})"><option value="">선택</option>${typeOptions}</select></label>
      <label><span>제조일 *</span><input id="cert-schedule-manufacture-${certificate.id}" type="date" value="${manufactureDate}" oninput="updateCertificateSchedulePreview(${certificate.id})" onchange="updateCertificateSchedulePreview(${certificate.id})"></label>
      <label><span>검사 예정일 (자동)</span><input id="cert-schedule-due-${certificate.id}" type="text" value="${scheduledDate}" readonly></label>
      <p id="cert-schedule-state-${certificate.id}">${scheduledDate && classification.type ? `${escapeHtml(classification.type.name)} · ${classification.type.intervalMonths}개월 주기` : '파일명 기준 유형이 제안될 수 있으며, 제조기록 기준으로 확인하세요.'}</p>
    </article>`;
  }).join('');
  appState.certificates.forEach(certificate => {
    const select = document.getElementById(`cert-schedule-type-${certificate.id}`);
    if (select) select.value = String(getCertificateClassification(certificate).typeId || suggestCertificateTypeId(certificate) || '');
    updateCertificateSchedulePreview(certificate.id);
  });
}

async function saveCertificateMetadataMap(nextMap) {
  const value = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), records: nextMap });
  appState.settings = { ...appState.settings, [CERTIFICATE_METADATA_KEY]: value };
  saveLocalState();

  if (!supabaseClient || !isCloudConnected) return;
  const { data: existing, error: lookupError } = await supabaseClient
    .from('quality_settings')
    .select('key')
    .eq('key', CERTIFICATE_METADATA_KEY)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const { error } = existing
    ? await supabaseClient.from('quality_settings').update({ value }).eq('key', CERTIFICATE_METADATA_KEY)
    : await supabaseClient.from('quality_settings').insert([{ key: CERTIFICATE_METADATA_KEY, value }]);
  if (error) throw error;
}

async function updateCertificateMetadata(certificateId, patch) {
  const map = getCertificateMetadataMap();
  const current = map[String(certificateId)] || {};
  map[String(certificateId)] = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await saveCertificateMetadataMap(map);
}

async function removeCertificateMetadata(certificateIds) {
  const map = getCertificateMetadataMap();
  certificateIds.forEach(id => delete map[String(id)]);
  await saveCertificateMetadataMap(map);
}

function getMissingFileCertificates() {
  return appState.certificates.filter(certificate => !getCertificateFileUrl(certificate));
}

function normalizeFileName(fileName) {
  return String(fileName || '').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ');
}

function getTypeInspectionSummaries() {
  return appState.types.map(type => {
    const products = appState.products.filter(product => Number(product.typeId) === Number(type.id));
    const activeProducts = products.filter(product => product.productionStatus !== 'stopped');
    const productDates = (activeProducts.length ? activeProducts : products)
      .map(product => product.lastManufactureDate)
      .filter(Boolean);
    const certificates = appState.certificates
      .filter(certificate => Number(getCertificateClassification(certificate).typeId) === Number(type.id))
      .sort((a, b) => String(b.inspectionDate || '').localeCompare(String(a.inspectionDate || '')));
    const certificateManufactureDates = certificates.map(getCertificateManufactureDate).filter(Boolean);
    const manufactureDate = [...productDates, ...certificateManufactureDates].sort().at(-1) || '';
    const latestInspectionDate = certificates.map(certificate => certificate.inspectionDate).filter(Boolean).sort().at(-1) || '';
    const nextInspectionDate = manufactureDate ? calcNextDeadline(manufactureDate, Number(type.intervalMonths || 0)) : '';
    return {
      type,
      products,
      certificates,
      manufactureDate,
      latestInspectionDate,
      nextInspectionDate,
      intervalMonths: Number(type.intervalMonths || 0),
      source: productDates.includes(manufactureDate) ? '제품 최근 제조일' : (manufactureDate ? '성적서 기준 제조일' : '기준일 미입력')
    };
  });
}

function getCertificateCalendarMonth() {
  const inputValue = document.getElementById('cert-calendar-month')?.value;
  const defaultValue = getTodayKstStr().slice(0, 7);
  return inputValue || certificateCalendarMonth || defaultValue;
}

function formatCertificateDate(dateValue) {
  if (!dateValue) return '미입력';
  return String(dateValue).replaceAll('-', '.');
}

function renderCertificateCalendar(monthValue) {
  const calendar = document.getElementById('cert-inspection-calendar');
  if (!calendar) return;
  const normalizedMonth = /^\d{4}-\d{2}$/.test(String(monthValue || '')) ? monthValue : getTodayKstStr().slice(0, 7);
  certificateCalendarMonth = normalizedMonth;
  const [year, month] = normalizedMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const summaries = getTypeInspectionSummaries();
  const eventsByDate = {};
  const addEvent = (date, event) => {
    if (!date || !String(date).startsWith(normalizedMonth)) return;
    if (!eventsByDate[date]) eventsByDate[date] = [];
    eventsByDate[date].push(event);
  };

  summaries.forEach(summary => {
    if (summary.nextInspectionDate) addEvent(summary.nextInspectionDate, { kind: 'due', label: `${summary.type.name} 검사 예정` });
    summary.certificates.forEach(certificate => {
      if (certificate.inspectionDate) addEvent(certificate.inspectionDate, { kind: 'done', label: `${summary.type.name} 성적서` });
      const scheduledDate = getCertificateScheduledInspectionDate(certificate);
      if (scheduledDate) addEvent(scheduledDate, { kind: 'due', label: `${summary.type.name} 예정 · ${certificate.certNumber || '성적서'}` });
    });
  });

  const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const headers = weekdayLabels.map((label, index) => `<div class="certificate-calendar-weekday ${index === 0 ? 'is-sunday' : ''}">${label}</div>`).join('');
  const blanks = Array.from({ length: firstDay }, () => '<div class="certificate-calendar-cell is-blank"></div>').join('');
  const days = Array.from({ length: lastDate }, (_, index) => {
    const day = index + 1;
    const date = `${normalizedMonth}-${String(day).padStart(2, '0')}`;
    const events = eventsByDate[date] || [];
    return `<div class="certificate-calendar-cell"><div class="certificate-calendar-date">${day}</div>${events.slice(0, 3).map(event => `<span class="certificate-calendar-event is-${event.kind}" title="${escapeHtml(event.label)}">${escapeHtml(event.label)}</span>`).join('')}${events.length > 3 ? `<span class="certificate-calendar-more">+${events.length - 3}</span>` : ''}</div>`;
  }).join('');
  calendar.innerHTML = `<div class="certificate-calendar-grid">${headers}${blanks}${days}</div>`;
}

function renderCertificateWorkspace() {
  const target = document.getElementById('certificate-workspace');
  if (!target) return;
  const summaries = getTypeInspectionSummaries();
  const missingFiles = getMissingFileCertificates();
  const unclassified = appState.certificates.filter(certificate => !getCertificateClassification(certificate).typeId).length;
  const calendarMonth = getCertificateCalendarMonth();

  target.innerHTML = `
    <section class="certificate-workspace-card">
      <div class="certificate-workspace-head">
        <div>
          <h3><i data-lucide="chart-no-axes-combined" class="w-4 h-4"></i>유형별 검사 기준 현황</h3>
          <p>기준 제조일에 유형별 검사주기를 적용해 검사 예정일을 계산합니다. 실제 검사 계획은 공정 운영 및 내부 기준을 함께 확인하세요.</p>
        </div>
        <div class="certificate-workspace-status"><span>파일 보완 ${missingFiles.length}건</span><span>유형 미분류 ${unclassified}건</span></div>
      </div>
      <div class="certificate-type-summary-grid">
        ${summaries.map(summary => {
          const dueClass = !summary.nextInspectionDate ? 'is-empty' : (calcDDay(summary.nextInspectionDate) < 0 ? 'is-overdue' : (calcDDay(summary.nextInspectionDate) <= 14 ? 'is-soon' : ''));
          return `<article class="certificate-type-summary ${dueClass}">
            <div class="certificate-type-summary-top"><strong>${escapeHtml(summary.type.name)}</strong><span>${summary.intervalMonths || '-'}개월</span></div>
            <dl>
              <div><dt>기준 제조일</dt><dd>${formatCertificateDate(summary.manufactureDate)}</dd></div>
              <div><dt>검사 예정일</dt><dd>${formatCertificateDate(summary.nextInspectionDate)}</dd></div>
              <div><dt>최근 성적서</dt><dd>${formatCertificateDate(summary.latestInspectionDate)}</dd></div>
            </dl>
            <p>${summary.products.length}개 품목 · 성적서 ${summary.certificates.length}건 · ${summary.source}</p>
          </article>`;
        }).join('')}
      </div>
    </section>
    <section class="certificate-workspace-card">
      <div class="certificate-workspace-head">
        <div><h3><i data-lucide="calendar-days" class="w-4 h-4"></i>월간 검사 캘린더</h3><p>파란색은 성적서 검사일, 주황색은 유형별 검사 예정일입니다.</p></div>
        <label class="certificate-calendar-control"><span>조회 월</span><input id="cert-calendar-month" type="month" value="${calendarMonth}" onchange="renderCertificateCalendar(this.value)"></label>
      </div>
      <div id="cert-inspection-calendar"></div>
    </section>`;
  renderCertificateCalendar(calendarMonth);
  lucide.createIcons();
}

function handleCertificateProductChange() {
  const product = appState.products.find(item => Number(item.id) === Number(document.getElementById('cert-product-id')?.value));
  const typeSelect = document.getElementById('cert-type-id');
  const manufactureInput = document.getElementById('cert-manufacture-date');
  if (!product) return;
  if (typeSelect) typeSelect.value = String(product.typeId || '');
  if (manufactureInput) manufactureInput.value = product.lastManufactureDate || '';
}

function updateCertificateAssignmentPreview() {
  const typeId = Number(document.getElementById('certificate-assignment-type')?.value || 0);
  const manufactureDate = document.getElementById('certificate-assignment-manufacture-date')?.value || '';
  const type = appState.types.find(item => Number(item.id) === typeId);
  const output = document.getElementById('certificate-assignment-scheduled-date');
  const note = document.getElementById('certificate-assignment-preview-note');
  const scheduledDate = type && manufactureDate ? calcNextDeadline(manufactureDate, Number(type.intervalMonths || 0)) : '';
  if (output) output.value = scheduledDate || '';
  if (note) note.textContent = scheduledDate ? `${type.name} · ${type.intervalMonths}개월 주기 기준` : '제품과 식품유형, 제조일을 입력하세요.';
}

function handleCertificateAssignmentProductChange() {
  const productValue = String(document.getElementById('certificate-assignment-product')?.value || '');
  const newProductWrap = document.getElementById('certificate-assignment-new-product-wrap');
  const newProductInput = document.getElementById('certificate-assignment-new-product-name');
  const isNewProduct = productValue === '__new__';
  if (newProductWrap) newProductWrap.classList.toggle('hidden', !isNewProduct);
  if (newProductInput) {
    newProductInput.required = isNewProduct;
    if (!isNewProduct) newProductInput.value = '';
  }
  if (isNewProduct) {
    updateCertificateAssignmentPreview();
    return;
  }
  const product = appState.products.find(item => Number(item.id) === Number(productValue));
  if (!product) return;
  const typeSelect = document.getElementById('certificate-assignment-type');
  const manufactureInput = document.getElementById('certificate-assignment-manufacture-date');
  if (typeSelect) typeSelect.value = String(product.typeId || '');
  if (manufactureInput && !manufactureInput.value) manufactureInput.value = product.lastManufactureDate || '';
  updateCertificateAssignmentPreview();
}

function openCertificateAssignmentModal(certificateId) {
  const certificate = getCertificateById(certificateId);
  if (!certificate) return;
  const classification = getCertificateClassification(certificate);
  document.getElementById('certificate-assignment-id').value = String(certificate.id);
  document.getElementById('certificate-assignment-number').textContent = certificate.certNumber || '성적서 번호 미입력';
  document.getElementById('certificate-assignment-file').textContent = certificate.fileName || '파일명 없음';
  const productSelect = document.getElementById('certificate-assignment-product');
  productSelect.innerHTML = `<option value="">제품 선택</option>${appState.products.map(product => `<option value="${product.id}">${escapeHtml(product.name)} · ${escapeHtml(appState.types.find(type => Number(type.id) === Number(product.typeId))?.name || '유형 미지정')}</option>`).join('')}<option value="__new__">＋ 목록에 없는 새 제품 직접 등록</option>`;
  productSelect.value = classification.product ? String(classification.product.id) : '';
  document.getElementById('certificate-assignment-new-product-name').value = '';
  document.getElementById('certificate-assignment-new-product-wrap').classList.add('hidden');
  document.getElementById('certificate-assignment-new-product-name').required = false;
  const typeSelect = document.getElementById('certificate-assignment-type');
  typeSelect.innerHTML = `<option value="">식품유형 선택</option>${appState.types.map(type => `<option value="${type.id}">${escapeHtml(type.name)} · ${type.intervalMonths}개월</option>`).join('')}`;
  typeSelect.value = classification.typeId ? String(classification.typeId) : '';
  document.getElementById('certificate-assignment-manufacture-date').value = classification.manufactureDate || '';
  updateCertificateAssignmentPreview();
  openModal('modal-certificate-assignment');
}

async function handleSaveCertificateAssignment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const certificateId = Number(document.getElementById('certificate-assignment-id').value || 0);
  const productValue = String(document.getElementById('certificate-assignment-product').value || '');
  const typeId = Number(document.getElementById('certificate-assignment-type').value || 0);
  const manufactureDate = document.getElementById('certificate-assignment-manufacture-date').value || '';
  const newProductName = document.getElementById('certificate-assignment-new-product-name').value.trim();
  const certificate = getCertificateById(certificateId);
  let product = appState.products.find(item => Number(item.id) === Number(productValue));
  const type = appState.types.find(item => Number(item.id) === typeId);
  if (!certificate) return showToast('성적서 정보를 찾지 못했습니다. 목록을 새로고침하세요.', 'error');
  if (productValue === '__new__' && !newProductName) return showToast('새 제품명을 입력하세요.', 'error');
  if (productValue !== '__new__' && !product) return showToast('연결할 제품을 선택하세요.', 'error');
  if (!type || !manufactureDate) return showToast('식품유형과 실제 제조일을 모두 입력하세요.', 'error');

  setCertificateSaveInProgress(form, true, '정보 저장 중...');
  try {
    if (productValue === '__new__') {
      const sameName = appState.products.find(item => String(item.name || '').trim().toLocaleLowerCase('ko-KR') === newProductName.toLocaleLowerCase('ko-KR'));
      if (sameName) {
        product = sameName;
      } else if (supabaseClient && isCloudConnected) {
        const { data, error } = await retryCloudMutation(() => insertCloudProductWithIdRecovery({ name: newProductName, type_id: Number(type.id), interval_months: Number(type.intervalMonths || 2), last_manufacture_date: manufactureDate, memo: '성적서 직접 등록으로 추가' }));
        if (error || !data) throw error || new Error('새 제품 등록 결과를 확인하지 못했습니다.');
        product = toAppProduct(data);
        appState.products.push(product);
      } else {
        const nextId = appState.products.length ? Math.max(...appState.products.map(item => Number(item.id) || 0)) + 1 : 1;
        product = { id: nextId, name: newProductName, typeId: Number(type.id), intervalMonths: Number(type.intervalMonths || 2), lastManufactureDate: manufactureDate, memo: '성적서 직접 등록으로 추가', productionStatus: 'active', stopReason: '', alertStatus: 'active' };
        appState.products.push(product);
        saveLocalState();
      }
    }
    if (supabaseClient && isCloudConnected) {
      const { data, error } = await retryCloudMutation(() => supabaseClient
        .from('quality_certificates')
        .update({ product_id: Number(product.id) })
        .eq('id', Number(certificate.id))
        .select()
        .single());
      if (error || !data) throw error || new Error('성적서의 제품 연결 결과를 확인하지 못했습니다.');
      syncSavedCertificate(data);
    } else {
      certificate.productId = Number(product.id);
      saveLocalState();
    }
    await retryCloudMutation(() => updateCertificateMetadata(certificate.id, {
      typeId: Number(type.id),
      manufactureDate,
      scheduledInspectionDate: calcNextDeadline(manufactureDate, Number(type.intervalMonths || 0)),
      source: '성적서 직접 등록'
    }));
    if (supabaseClient && isCloudConnected) await loadCloudState();
    else renderCertificates();
    closeModal('modal-certificate-assignment');
    showToast(`${certificate.certNumber || '성적서'}에 ${product.name} · ${type.name} 정보를 저장했습니다.`, 'success');
  } catch (error) {
    console.error('성적서 직접 정보 저장 실패:', error);
    showToast(getCertificateSaveErrorMessage(error), 'error');
  } finally {
    setCertificateSaveInProgress(form, false, '정보 저장 중...');
  }
}

function openCertificateMaintenanceModal() {
  const missing = getMissingFileCertificates();
  const list = document.getElementById('bulk-cert-list');
  if (!list) return;
  const typeSelect = document.getElementById('bulk-cert-type-id');
  typeSelect.innerHTML = `<option value="">유형 선택 안 함</option>${appState.types.map(type => `<option value="${type.id}">${escapeHtml(type.name)} (${type.intervalMonths}개월)</option>`).join('')}`;
  document.getElementById('bulk-cert-manufacture-date').value = '';
  document.getElementById('bulk-cert-files').value = '';
  document.getElementById('bulk-cert-action').value = 'attach';
  list.innerHTML = missing.length
    ? missing.map(certificate => `<label class="bulk-cert-row"><input type="checkbox" name="bulk-cert-id" value="${certificate.id}" checked onchange="updateBulkCertificateSelection()"><span><strong>${escapeHtml(certificate.certNumber || '번호 미입력')}</strong><small>${escapeHtml(certificate.fileName || '파일명 없음')} · 검사일 ${formatCertificateDate(certificate.inspectionDate)}</small></span></label>`).join('')
    : '<div class="bulk-cert-empty">파일 주소가 누락된 성적서가 없습니다.</div>';
  updateBulkCertificateSelection();
  openModal('modal-bulk-cert-maintenance');
}

function updateBulkCertificateSelection() {
  const selected = document.querySelectorAll('input[name="bulk-cert-id"]:checked').length;
  const count = document.getElementById('bulk-cert-selected-count');
  if (count) count.textContent = `${selected}건 선택`;
}

function updateBulkCertificateActionHelp() {
  const action = document.getElementById('bulk-cert-action')?.value;
  const fileWrap = document.getElementById('bulk-cert-file-wrap');
  const classificationWrap = document.getElementById('bulk-cert-classification-wrap');
  const selectionToolbar = document.getElementById('bulk-cert-selection-toolbar');
  const list = document.getElementById('bulk-cert-list');
  const scheduleWrap = document.getElementById('bulk-cert-schedule-wrap');
  const submit = document.getElementById('bulk-cert-submit');
  const scheduleMode = action === 'schedule';
  if (fileWrap) fileWrap.classList.toggle('hidden', action !== 'attach');
  if (classificationWrap) classificationWrap.classList.toggle('hidden', action === 'delete' || scheduleMode);
  if (selectionToolbar) selectionToolbar.classList.toggle('hidden', scheduleMode);
  if (list) list.classList.toggle('hidden', scheduleMode);
  if (scheduleWrap) scheduleWrap.classList.toggle('hidden', !scheduleMode);
  if (scheduleMode) buildCertificateScheduleRows();
  if (submit) submit.textContent = action === 'delete' ? '선택 성적서 삭제' : (action === 'classify' ? '유형·제조일 저장' : (scheduleMode ? '7건 검사 예정일 저장' : '파일 일괄 연결'));
}

async function saveCertificateSchedules() {
  if (!supabaseClient || !isCloudConnected) throw new Error('클라우드 연결 후 검사 예정일을 저장하세요.');
  const metadata = getCertificateMetadataMap();
  const invalidRecords = [];
  appState.certificates.forEach(certificate => {
    const typeId = Number(document.getElementById(`cert-schedule-type-${certificate.id}`)?.value || 0);
    const manufactureDate = document.getElementById(`cert-schedule-manufacture-${certificate.id}`)?.value || '';
    const type = appState.types.find(item => Number(item.id) === typeId);
    if (!type || !manufactureDate) {
      invalidRecords.push(certificate.certNumber || `ID ${certificate.id}`);
      return;
    }
    metadata[String(certificate.id)] = {
      ...(metadata[String(certificate.id)] || {}),
      typeId,
      manufactureDate,
      scheduledInspectionDate: calcNextDeadline(manufactureDate, Number(type.intervalMonths || 0)),
      source: '건별 제조일 입력',
      updatedAt: new Date().toISOString()
    };
  });
  if (invalidRecords.length) throw new Error(`식품유형 또는 제조일이 비어 있는 성적서가 ${invalidRecords.length}건 있습니다: ${invalidRecords.join(', ')}`);
  await saveCertificateMetadataMap(metadata);
  return appState.certificates.length;
}

async function handleBulkCertificateMaintenance(event) {
  event.preventDefault();
  if (isSavingCertificate) return;
  const form = event.currentTarget;
  const selectedIds = [...document.querySelectorAll('input[name="bulk-cert-id"]:checked')].map(input => Number(input.value));
  const action = document.getElementById('bulk-cert-action').value;
  const typeId = Number(document.getElementById('bulk-cert-type-id').value || 0);
  const manufactureDate = document.getElementById('bulk-cert-manufacture-date').value;
  const files = [...document.getElementById('bulk-cert-files').files];
  if (action !== 'schedule' && !selectedIds.length) return showToast('처리할 성적서를 하나 이상 선택하세요.', 'error');
  if (!supabaseClient || !isCloudConnected) return showToast('클라우드 연결 후 일괄 정리를 실행하세요.', 'error');
  if (action === 'delete' && !confirm(`선택한 ${selectedIds.length}건의 성적서 정보를 삭제하시겠습니까? 파일은 저장소에 남을 수 있습니다.`)) return;
  if (action === 'classify' && (!typeId || !manufactureDate)) return showToast('유형과 기준 제조일을 모두 입력하세요.', 'error');
  if (action === 'attach' && !files.length) return showToast('재첨부할 원본 성적서 파일을 선택하세요.', 'error');

  isSavingCertificate = true;
  setCertificateSaveInProgress(form, true, '일괄 처리 중...');
  try {
    if (action === 'schedule') {
      const savedCount = await saveCertificateSchedules();
      renderCertificates();
      await loadCloudState();
      closeModal('modal-bulk-cert-maintenance');
      showToast(`${savedCount}건의 제조일 기준 검사 예정일을 저장했습니다.`, 'success');
      return;
    }
    if (action === 'delete') {
      const { error } = await supabaseClient.from('quality_certificates').delete().in('id', selectedIds);
      if (error) throw error;
      await removeCertificateMetadata(selectedIds);
      await loadCloudState();
      closeModal('modal-bulk-cert-maintenance');
      showToast(`${selectedIds.length}건의 성적서 정보를 삭제했습니다.`, 'success');
      return;
    }

    const selectedCertificates = appState.certificates.filter(certificate => selectedIds.includes(Number(certificate.id)));
    const metadata = getCertificateMetadataMap();
    let mappedCount = 0;
    let unmatchedCount = 0;
    const resultIds = [];
    if (action === 'attach') {
      const filesByName = new Map(files.map(file => [normalizeFileName(file.name), file]));
      for (const certificate of selectedCertificates) {
        const file = filesByName.get(normalizeFileName(certificate.fileName));
        if (!file) { unmatchedCount += 1; continue; }
        const uploadRes = await uploadFileToCloud(file, 'certs');
        if (!uploadRes.url) throw new Error(`${file.name} 파일의 업로드 주소를 받지 못했습니다.`);
        const { data, error } = await supabaseClient
          .from('quality_certificates')
          .update({ file_url: uploadRes.url, file_name: uploadRes.name, file_size: file.size })
          .eq('id', Number(certificate.id))
          .select()
          .single();
        if (error || !data) throw error || new Error(`${certificate.certNumber || file.name} 저장 결과를 확인하지 못했습니다.`);
        syncSavedCertificate(data);
        resultIds.push(Number(certificate.id));
        mappedCount += 1;
      }
      if (!mappedCount) throw new Error('선택한 파일명과 성적서 파일명이 일치하지 않습니다. 파일명은 기존 성적서 목록과 같아야 합니다.');
    } else {
      resultIds.push(...selectedIds);
    }

    if (typeId && manufactureDate) {
      resultIds.forEach(id => {
        metadata[String(id)] = { ...(metadata[String(id)] || {}), typeId, manufactureDate, source: '일괄 분류', updatedAt: new Date().toISOString() };
      });
      await saveCertificateMetadataMap(metadata);
    }
    renderCertificates();
    await loadCloudState();
    closeModal('modal-bulk-cert-maintenance');
    const suffix = unmatchedCount ? ` 파일명 불일치 ${unmatchedCount}건은 제외됐습니다.` : '';
    const actionLabel = action === 'attach' ? `파일 ${mappedCount}건을 연결했습니다.` : `성적서 ${resultIds.length}건의 유형·제조일을 저장했습니다.`;
    showToast(`${actionLabel}${suffix}`, 'success');
  } catch (error) {
    console.error('성적서 일괄 정리 실패:', error);
    showToast(getCertificateSaveErrorMessage(error), 'error');
  } finally {
    isSavingCertificate = false;
    setCertificateSaveInProgress(form, false);
  }
}

// ==================== 2. Supabase Client Setup ====================
const SUPABASE_URL = 'https://hooaeqywrdihninxnvtb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3iDGX80MZlMhAPCthcBKDA_TDUHDwhz';

let supabaseClient = null;
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (err) {
  console.warn('Supabase 초기화 경고:', err);
}

// ==================== 2. State & Fallback Data ====================
const STORAGE_KEY = 'koenf_quality_data_v3';
// 텔레그램 인증값은 일반 업무 데이터와 분리해 백업·초기화 후에도 현재 브라우저에 유지합니다.
const TELEGRAM_SETTINGS_KEY = 'koenf_telegram_settings_v1';
const TELEGRAM_CLOUD_KEY = 'telegram_sync_v1';
const TELEGRAM_ENCRYPTION_VERSION = 1;
const TELEGRAM_PBKDF2_ITERATIONS = 150000;

const DEFAULT_DATA = {
  types: [
    { id: 1, name: '액상차', intervalMonths: 2, testItems: '세균수, 대장균군, 타르색소, 보존료' },
    { id: 2, name: '음료베이스', intervalMonths: 2, testItems: '세균수, 대장균군, 보존료, 납' },
    { id: 3, name: '기타가공품', intervalMonths: 3, testItems: '세균수, 대장균군, 이물' },
    { id: 4, name: '복합조미식품', intervalMonths: 3, testItems: '타르색소, 보존료, 대장균' },
    { id: 5, name: '과·채가공품', intervalMonths: 2, testItems: '세균수, 대장균군' },
    { id: 6, name: '혼합음료', intervalMonths: 2, testItems: '세균수, 대장균군, 보존료' }
  ],
  products: [
    { id: 1, typeId: 1, name: '코엔에프 포션 유자차 30g', intervalMonths: 2, lastManufactureDate: '2026-06-25', memo: '주력 수출용 포션 라인', productionStatus: 'active', alertStatus: 'active' },
    { id: 2, typeId: 2, name: '코엔에프 자몽에이드 베이스 1kg', intervalMonths: 2, lastManufactureDate: '2026-06-10', memo: '카페 납품용 벌크', productionStatus: 'active', alertStatus: 'active' },
    { id: 3, typeId: 3, name: '코엔에프 레몬밤 추출분말 500g', intervalMonths: 3, lastManufactureDate: '2026-07-01', memo: 'OEM 수탁 생산', productionStatus: 'active', alertStatus: 'active' },
    { id: 4, typeId: 4, name: '코엔에프 만능간장 베이스 2kg', intervalMonths: 3, lastManufactureDate: '2026-08-01', memo: '소스 라인 1호기', productionStatus: 'active', alertStatus: 'active' },
    { id: 5, typeId: 1, name: '코엔에프 헛개수 농축액 1.2kg', intervalMonths: 2, lastManufactureDate: '2026-05-15', memo: '원료 수급 비수기 생산 일시 중단', productionStatus: 'stopped', stopReason: '원료 수급 조정', alertStatus: 'active' },
    { id: 6, typeId: 2, name: '코엔에프 유기농 석류베이스 1kg', intervalMonths: 2, lastManufactureDate: '2026-07-20', memo: '친환경 인증 원료', productionStatus: 'active', alertStatus: 'active' }
  ],
  history: [
    { id: 1, productId: 1, productName: '코엔에프 포션 유자차 30g', manufactureDate: '2026-06-25', previousDate: '2026-04-20', memo: '정기 검사 적합', createdAt: '2026-06-25T09:00:00Z' },
    { id: 2, productId: 2, productName: '코엔에프 자몽에이드 베이스 1kg', manufactureDate: '2026-06-10', previousDate: '2026-04-10', memo: '정기 검사 적합', createdAt: '2026-06-10T09:00:00Z' }
  ],
  healthCerts: [
    { id: 1, employeeName: '김품질', department: '품질관리팀', issuedAt: '2025-09-10', expiresAt: '2026-09-10', warningDays: 30, memo: '팀장 정기 검진', fileUrl: '', fileName: '', employmentStatus: 'active', alertStatus: 'active' },
    { id: 2, employeeName: '이생산', department: '생산1팀', issuedAt: '2025-08-15', expiresAt: '2026-08-15', warningDays: 30, memo: '포장 라인 반장', fileUrl: '', fileName: '', employmentStatus: 'active', alertStatus: 'active' },
    { id: 3, employeeName: '박공정', department: '생산2팀', issuedAt: '2025-09-01', expiresAt: '2026-09-01', warningDays: 30, memo: '살균 공정 담당', fileUrl: '', fileName: '', employmentStatus: 'active', alertStatus: 'active' },
    { id: 4, employeeName: '최개발', department: '연구소', issuedAt: '2026-03-20', expiresAt: '2027-03-20', warningDays: 30, memo: '신제품 개발실', fileUrl: '', fileName: '', employmentStatus: 'active', alertStatus: 'active' }
  ],
  certificates: [
    { id: 1, certNumber: 'CONF-QC-2026-001', productId: 1, inspectionDate: '2026-06-25', fileUrl: '', fileName: '2026_06_유자차_시험성적서.pdf', fileSize: 1048576, memo: '한국식품연구원 (적합)', createdAt: '2026-06-25T10:00:00Z' }
  ],
  settings: {
    warningDays: 14,
    healthWarningDays: 30,
    healthAlertDays: '30,7,1',
    telegramBotToken: '',
    telegramChatId: '',
    certPrefix: 'CONF-QC',
    certSequence: 2
  }
};

let appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
let isCloudConnected = false;
let isSavingHealthCert = false;
let isSavingProduct = false;
let isSavingCertificate = false;
let healthListFilter = 'all';
let healthListSort = 'expires_asc';
const healthManagementPendingIds = new Set();
const HEALTH_ALERT_DAYS_KEY = 'health_alert_days';
const DEFAULT_HEALTH_ALERT_DAYS = [30, 7, 1];

function normalizeHealthAlertDays(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;/]+/);
  const days = source
    .map(item => Number(item))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 365);
  return [...new Set(days.length ? days : DEFAULT_HEALTH_ALERT_DAYS)].sort((a, b) => b - a);
}

function getHealthAlertDays() {
  return normalizeHealthAlertDays(appState.settings?.healthAlertDays || appState.settings?.healthWarningDays || DEFAULT_HEALTH_ALERT_DAYS);
}

function getHealthAlertDaysLabel() {
  return getHealthAlertDays().map(day => `D-${day}`).join(' · ');
}

function isHealthAlertDue(dDay) {
  return dDay !== null && (dDay < 0 || getHealthAlertDays().includes(dDay));
}

function getPinnedTelegramSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(TELEGRAM_SETTINGS_KEY) || '{}');
    return {
      telegramBotToken: typeof saved.telegramBotToken === 'string' ? saved.telegramBotToken.trim() : '',
      telegramChatId: typeof saved.telegramChatId === 'string' ? saved.telegramChatId.trim() : ''
    };
  } catch (error) {
    console.warn('저장된 텔레그램 설정을 읽지 못했습니다.', error);
    return { telegramBotToken: '', telegramChatId: '' };
  }
}

function pinTelegramSettings({ telegramBotToken, telegramChatId }) {
  const pinned = {
    telegramBotToken: String(telegramBotToken || '').trim(),
    telegramChatId: String(telegramChatId || '').trim(),
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(TELEGRAM_SETTINGS_KEY, JSON.stringify(pinned));
  return pinned;
}

function applyPinnedTelegramSettings() {
  appState.settings = { ...DEFAULT_DATA.settings, ...(appState.settings || {}) };
  const pinned = getPinnedTelegramSettings();
  if (pinned.telegramBotToken) appState.settings.telegramBotToken = pinned.telegramBotToken;
  if (pinned.telegramChatId) appState.settings.telegramChatId = pinned.telegramChatId;
  return pinned;
}

function migrateTelegramSettingsToPinned() {
  const pinned = getPinnedTelegramSettings();
  const current = appState.settings || {};
  if ((!pinned.telegramBotToken && current.telegramBotToken) || (!pinned.telegramChatId && current.telegramChatId)) {
    pinTelegramSettings({
      telegramBotToken: pinned.telegramBotToken || current.telegramBotToken,
      telegramChatId: pinned.telegramChatId || current.telegramChatId
    });
  }
  return applyPinnedTelegramSettings();
}

function updateTelegramSettingsStatus() {
  const status = document.getElementById('telegram-settings-status');
  if (!status) return;
  const hasToken = Boolean(appState.settings?.telegramBotToken);
  const hasChatId = Boolean(appState.settings?.telegramChatId);
  if (hasToken && hasChatId) {
    status.className = 'inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300';
    status.innerHTML = '<i data-lucide="lock-keyhole" class="w-3.5 h-3.5"></i><span>이 기기에 고정 저장됨</span>';
  } else {
    status.className = 'inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400';
    status.innerHTML = '<i data-lucide="circle-alert" class="w-3.5 h-3.5"></i><span>Bot Token과 Chat ID를 모두 입력해 저장하세요</span>';
  }
  lucide.createIcons();
}

function updateTelegramCloudStatus(message, type = 'info') {
  const status = document.getElementById('telegram-cloud-status');
  if (!status) return;
  const styles = {
    success: 'text-emerald-700 dark:text-emerald-300',
    error: 'text-red-600 dark:text-red-300',
    info: 'text-slate-500 dark:text-slate-400'
  };
  const icons = { success: 'cloud-check', error: 'cloud-off', info: 'cloud' };
  status.className = `inline-flex items-center gap-1.5 text-xs font-medium ${styles[type] || styles.info}`;
  status.innerHTML = `<i data-lucide="${icons[type] || icons.info}" class="w-3.5 h-3.5 shrink-0"></i><span>${escapeHtml(message)}</span>`;
  lucide.createIcons();
}

function toBase64(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function deriveTelegramEncryptionKey(passphrase, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: TELEGRAM_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptTelegramCloudPayload(payload, passphrase) {
  if (!window.crypto?.subtle) throw new Error('이 브라우저는 암호화 동기화를 지원하지 않습니다.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveTelegramEncryptionKey(passphrase, salt);
  const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  return JSON.stringify({
    version: TELEGRAM_ENCRYPTION_VERSION,
    algorithm: 'AES-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted))
  });
}

async function decryptTelegramCloudPayload(value, passphrase) {
  const envelope = JSON.parse(value);
  if (envelope.version !== TELEGRAM_ENCRYPTION_VERSION || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
    throw new Error('지원하지 않는 동기화 데이터 형식입니다.');
  }
  const key = await deriveTelegramEncryptionKey(passphrase, fromBase64(envelope.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.ciphertext));
  const payload = JSON.parse(new TextDecoder().decode(plain));
  if (!payload.telegramBotToken || !payload.telegramChatId) throw new Error('동기화 데이터가 완전하지 않습니다.');
  return payload;
}

function getTelegramSyncPassphrase() {
  return document.getElementById('setting-tg-sync-password')?.value.trim() || '';
}

async function getTelegramCloudRecord() {
  if (!supabaseClient || !isCloudConnected) throw new Error('클라우드 연결 후 다시 시도하세요.');
  const { data, error } = await supabaseClient
    .from('quality_settings')
    .select('key,value')
    .eq('key', TELEGRAM_CLOUD_KEY)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveTelegramCloudRecord(value) {
  const existing = await getTelegramCloudRecord();
  if (existing) {
    const { error } = await supabaseClient.from('quality_settings').update({ value }).eq('key', TELEGRAM_CLOUD_KEY);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('quality_settings').insert([{ key: TELEGRAM_CLOUD_KEY, value }]);
    if (error) throw error;
  }
}

function updateCloudBadge(connected) {
  isCloudConnected = connected;
  const badge = document.getElementById('cloud-status-badge');
  if (!badge) return;
  if (connected) {
    badge.className = 'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>실시간 클라우드 연결됨</span>`;
  } else {
    badge.className = 'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>로컬 스토리지 모드</span>`;
  }
}

async function loadCloudState(showToastNotice = false) {
  if (!supabaseClient) {
    loadLocalState();
    return;
  }

  try {
    const [resTypes, resProds, resHistory, resHealth, resCerts, resSettings] = await Promise.all([
      supabaseClient.from('quality_types').select('*').order('id'),
      supabaseClient.from('quality_products').select('*').order('id'),
      supabaseClient.from('quality_history').select('*').order('id', { ascending: false }),
      supabaseClient.from('quality_health_certs').select('*').order('id'),
      supabaseClient.from('quality_certificates').select('*').order('id', { ascending: false }),
      supabaseClient.from('quality_settings').select('*')
    ]);

    const cloudLoadError = [resTypes, resProds, resHistory, resHealth, resCerts, resSettings]
      .map(result => result.error)
      .find(Boolean);
    if (cloudLoadError) {
      console.warn('Supabase 테이블 조회 실패 (로컬 모드 유지):', cloudLoadError);
      loadLocalState();
      updateCloudBadge(false);
      return;
    }

    // 매핑 (snake_case -> camelCase)
    appState.types = (resTypes.data || []).map(t => ({
      id: t.id,
      name: t.name,
      intervalMonths: t.interval_months,
      testItems: t.test_items || ''
    }));

    appState.products = (resProds.data || []).map(p => ({
      id: p.id,
      typeId: p.type_id,
      name: p.name,
      intervalMonths: p.interval_months,
      lastManufactureDate: p.last_manufacture_date,
      memo: p.memo || '',
      productionStatus: p.production_status || 'active',
      stopReason: p.stop_reason || '',
      alertStatus: p.alert_status || 'active'
    }));

    appState.history = (resHistory.data || []).map(h => ({
      id: h.id,
      productId: h.product_id,
      productName: h.product_name,
      manufactureDate: h.manufacture_date,
      previousDate: h.previous_date,
      memo: h.memo || '',
      createdAt: h.created_at
    }));

    appState.healthCerts = (resHealth.data || []).map(c => ({
      id: c.id,
      employeeName: c.employee_name,
      department: c.department || '',
      issuedAt: c.issued_at,
      expiresAt: c.expires_at,
      warningDays: c.warning_days || 30,
      memo: c.memo || '',
      fileUrl: c.file_url || '',
      fileName: c.file_name || '',
      hasFile: !!(c.file_url || c.file_name),
      employmentStatus: c.employment_status || 'active',
      alertStatus: c.alert_status || 'active'
    }));

    appState.certificates = (resCerts.data || []).map(c => ({
      id: c.id,
      certNumber: c.cert_number,
      productId: c.product_id,
      inspectionDate: c.inspection_date,
      fileUrl: c.file_url || '',
      fileName: c.file_name || '',
      fileSize: c.file_size || 0,
      memo: c.memo || '',
      createdAt: c.created_at
    }));

    if (resSettings.data && resSettings.data.length > 0) {
      resSettings.data.forEach(s => {
        if (s.key && s.value) appState.settings[s.key] = s.value;
      });
    }

    migrateTelegramSettingsToPinned();
    saveLocalState();
    updateCloudBadge(true);
    if (showToastNotice) showToast('클라우드 실시간 데이터가 동기화되었습니다.', 'success');
    renderCurrentTab();
  } catch (err) {
    console.error('클라우드 동기화 중 오류:', err);
    loadLocalState();
    updateCloudBadge(false);
  }
}

let realtimeReconnectAttempts = 0;
let realtimeReconnectTimer = null;
let realtimePollingTimer = null;
const REALTIME_POLL_INTERVAL_MS = 60000;

function startRealtimePollingFallback() {
  if (realtimePollingTimer) return;
  realtimePollingTimer = setInterval(() => {
    loadCloudState(false);
  }, REALTIME_POLL_INTERVAL_MS);
}

function stopRealtimePollingFallback() {
  if (realtimePollingTimer) {
    clearInterval(realtimePollingTimer);
    realtimePollingTimer = null;
  }
}

function initRealtimeSubscription() {
  if (!supabaseClient) return;
  try {
    supabaseClient.channel('quality_realtime_all')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        console.log('⚡ 실시간 변경 감지 (팀원 업데이트):', payload.table, payload.eventType);
        loadCloudState(false);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeReconnectAttempts = 0;
          stopRealtimePollingFallback();
          if (realtimeReconnectTimer) {
            clearTimeout(realtimeReconnectTimer);
            realtimeReconnectTimer = null;
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Realtime 구독 상태 이상:', status, '- 재연결 시도 및 폴링 백업 활성화');
          startRealtimePollingFallback();
          if (!realtimeReconnectTimer) {
            const delay = Math.min(30000, 2000 * Math.pow(2, realtimeReconnectAttempts));
            realtimeReconnectAttempts += 1;
            realtimeReconnectTimer = setTimeout(() => {
              realtimeReconnectTimer = null;
              try { supabaseClient.removeAllChannels(); } catch (e) { /* noop */ }
              initRealtimeSubscription();
            }, delay);
          }
        }
      });
  } catch (e) {
    console.warn('Realtime 구독 설정 실패:', e);
    startRealtimePollingFallback();
  }
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && !raw.includes('????') && !raw.includes('??')) {
      appState = JSON.parse(raw);
      if (!appState.types || !appState.products) appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
    } else {
      appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  } catch (e) {
    appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  migrateTelegramSettingsToPinned();
  saveLocalState();
  updateCloudBadge(false);
  renderCurrentTab();
}

function saveLocalState() {
  // 인증값은 별도 키에만 보관하여 일반 JSON 백업·복원·초기화 과정에서 지워지지 않게 합니다.
  const localSnapshot = JSON.parse(JSON.stringify(appState));
  localSnapshot.settings = {
    ...(localSnapshot.settings || {}),
    telegramBotToken: '',
    telegramChatId: ''
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localSnapshot));
}

// ==================== 3. Date & Calculation Engine ====================
function getTodayKstStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calcNextDeadline(lastDateStr, intervalMonths) {
  if (!lastDateStr) return '';
  const parts = lastDateStr.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1 + Number(intervalMonths), parts[2]);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calcDDay(targetDateStr) {
  if (!targetDateStr) return null;
  const today = new Date(getTodayKstStr()).getTime();
  const target = new Date(targetDateStr).getTime();
  const diffTime = target - today;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function formatDDay(dDay) {
  if (dDay === null) return '-';
  if (dDay < 0) return `${Math.abs(dDay)}일 초과`;
  if (dDay === 0) return '오늘 마감';
  return `D-${dDay}`;
}

function getProductComputed(p) {
  const type = appState.types.find(t => t.id === Number(p.typeId)) || { name: '미분류', intervalMonths: p.intervalMonths || 2 };
  const interval = Number(p.intervalMonths || type.intervalMonths || 2);
  const nextDeadline = calcNextDeadline(p.lastManufactureDate, interval);
  const dDay = calcDDay(nextDeadline);

  let status = 'safe';
  if (p.productionStatus === 'stopped') {
    status = 'stopped';
  } else if (p.alertStatus === 'paused') {
    status = 'paused';
  } else if (dDay !== null) {
    if (dDay < 0) status = 'overdue';
    else if (dDay <= (appState.settings.warningDays || 14)) status = 'urgent';
    else status = 'safe';
  }

  return { ...p, typeName: type.name, intervalMonths: interval, nextDeadline, dDay, status };
}

function getHealthCertComputed(c) {
  const dDay = calcDDay(c.expiresAt);
  let status = 'safe';
  if (c.employmentStatus === 'inactive') {
    status = 'inactive';
  } else if (c.alertStatus === 'paused') {
    status = 'paused';
  } else if (dDay !== null) {
    if (dDay < 0) status = 'overdue';
    else if (dDay <= Math.max(...getHealthAlertDays())) status = 'urgent';
    else status = 'safe';
  }
  return { ...c, dDay, status };
}

const STATUS_CONFIG = {
  overdue: { label: '기간 초과', class: 'badge-overdue', dotColor: 'bg-red-500' },
  urgent: { label: '사전 알림', class: 'badge-urgent', dotColor: 'bg-amber-500' },
  safe: { label: '여유 있음', class: 'badge-safe', dotColor: 'bg-emerald-500' },
  stopped: { label: '생산 중단', class: 'badge-stopped', dotColor: 'bg-slate-400' },
  paused: { label: '알림 일시중지', class: 'badge-paused', dotColor: 'bg-purple-500' },
  inactive: { label: '재직 제외', class: 'badge-stopped', dotColor: 'bg-slate-400' }
};

function renderStatusBadge(status, dDayText) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.safe;
  return `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.class}">
      <span class="w-1.5 h-1.5 rounded-full ${cfg.dotColor}"></span>
      <span>${cfg.label}</span>
      ${dDayText ? `<span class="opacity-75 font-normal">(${dDayText})</span>` : ''}
    </span>
  `;
}

// ==================== 4. UI Navigation & Rendering ====================
let currentTab = 'dashboard';
let dashboardFilter = 'all';
let mobileSelectedProductIds = new Set();
let dashboardFilteredProducts = [];
let dashboardQuickFilter = 'all';
let healthMonthlyStatsScope = 'active';
let typeMatrixYear = Number(getTodayKstStr().slice(0, 4));

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.toggle('hidden', view.id !== `view-${tabId}`);
  });

  renderCurrentTab();
  lucide.createIcons();
}

function getTabFromHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'certs-register') return 'certs';
  return ['dashboard', 'products', 'types', 'health', 'certs', 'settings'].includes(hash) ? hash : 'dashboard';
}

function openRequestedRoute() {
  const hash = window.location.hash.replace('#', '');
  switchTab(getTabFromHash());
  if (hash === 'certs-register') {
    window.setTimeout(() => openUploadCertModal(), 0);
  }
}

function renderCurrentTab() {
  if (currentTab === 'dashboard') renderDashboard();
  else if (currentTab === 'products') renderProducts();
  else if (currentTab === 'types') renderTypes();
  else if (currentTab === 'health') renderHealthCerts();
  else if (currentTab === 'certs') renderCertificates();
  else if (currentTab === 'settings') renderSettings();
  lucide.createIcons();
}

function setDashboardFilter(filter) {
  dashboardFilter = filter;
  const select = document.getElementById('dash-status-select');
  if (select) select.value = filter;
  renderDashboard();
}

function getRemainingDaysThisWeek() {
  const today = getTodayKstStr();
  const day = new Date(`${today}T12:00:00+09:00`).getUTCDay();
  return day === 0 ? 0 : 7 - day;
}

function getRemainingDaysThisMonth() {
  const [year, month, day] = getTodayKstStr().split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate() - day;
}

function hasCurrentCertificate(product) {
  const relatedCertificates = appState.certificates
    .filter(certificate => Number(certificate.productId) === Number(product.id) && certificate.inspectionDate)
    .sort((a, b) => String(b.inspectionDate).localeCompare(String(a.inspectionDate)));
  if (!relatedCertificates.length) return false;
  if (!product.lastManufactureDate) return true;
  return String(relatedCertificates[0].inspectionDate) >= String(product.lastManufactureDate);
}

function setDashboardQuickFilter(filter) {
  dashboardQuickFilter = dashboardQuickFilter === filter ? 'all' : filter;
  clearMobileSelection(false);
  renderDashboard();
}

function updateDashboardQuickFilters() {
  document.querySelectorAll('[data-dashboard-quick-filter]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.dashboardQuickFilter === dashboardQuickFilter);
  });
}

function resetDashboardFilters() {
  const values = {
    'dash-search-input': '',
    'dash-status-select': 'all',
    'dash-type-select': 'all',
    'dash-deadline-select': 'all',
    'dash-production-select': 'all'
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value;
  });
  dashboardFilter = 'all';
  dashboardQuickFilter = 'all';
  clearMobileSelection(false);
  renderDashboard();
}

function setHealthMonthlyStatsScope(scope) {
  healthMonthlyStatsScope = scope === 'all' ? 'all' : 'active';
  renderHealthMonthlyExpiryChart();
  lucide.createIcons();
}

function getHealthMonthlyExpiryStats(monthCount = 13, scope = healthMonthlyStatsScope) {
  const [year, month] = getTodayKstStr().split('-').map(Number);
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(year, month - 1 + index, 1);
    const monthNumber = String(date.getMonth() + 1).padStart(2, '0');
    return {
      key: `${date.getFullYear()}-${monthNumber}`,
      label: `${date.getMonth() + 1}월`,
      fullLabel: `${date.getFullYear()}년 ${date.getMonth() + 1}월`,
      overdue: 0,
      urgent: 0,
      safe: 0,
      paused: 0,
      inactive: 0,
      total: 0
    };
  });

  const overdueBucket = {
    key: 'overdue',
    label: '초과',
    fullLabel: '만료 초과',
    overdue: 0,
    urgent: 0,
    safe: 0,
    paused: 0,
    inactive: 0,
    total: 0
  };
  const allComputedHealth = appState.healthCerts.map(getHealthCertComputed);
  const activeEmployees = allComputedHealth.filter(item => item.employmentStatus !== 'inactive');
  const activeAlertEmployees = activeEmployees.filter(item => item.alertStatus !== 'paused');
  const computedHealth = scope === 'active' ? activeAlertEmployees : allComputedHealth;
  const excludedInactive = allComputedHealth.filter(item => item.employmentStatus === 'inactive').length;
  const excludedPaused = activeEmployees.filter(item => item.alertStatus === 'paused').length;
  const summary = {
    registered: computedHealth.length,
    totalRegistered: allComputedHealth.length,
    active: activeEmployees.length,
    alertEligible: activeAlertEmployees.length,
    excludedInactive,
    excludedPaused,
    overdue: computedHealth.filter(item => item.status === 'overdue').length,
    urgent: computedHealth.filter(item => item.status === 'urgent').length,
    paused: computedHealth.filter(item => item.status === 'paused').length,
    inactive: computedHealth.filter(item => item.status === 'inactive').length,
    noExpiryDate: computedHealth.filter(item => !item.expiresAt).length
  };

  computedHealth.forEach(item => {
    if (item.status === 'overdue') {
      overdueBucket.overdue += 1;
      overdueBucket.total += 1;
      return;
    }
    if (!item.expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(item.expiresAt)) return;
    const bucket = months.find(entry => entry.key === item.expiresAt.slice(0, 7));
    if (!bucket) return;
    const status = ['overdue', 'urgent', 'safe', 'paused', 'inactive'].includes(item.status) ? item.status : 'safe';
    bucket[status] += 1;
    bucket.total += 1;
  });

  return { entries: [overdueBucket, ...months], months, summary };
}

function setTypeMatrixYear(delta) {
  typeMatrixYear += delta;
  renderTypeMonthlyMatrix();
}

// 식품유형별 검사주기(기준일 + N개월 반복)를 해당 연도의 12개월에 투영해
// 완료(검정 원)/예정(빈 원) 상태를 계산한다.
function getTypeMatrixMonthStates(summary, year) {
  const states = Array(12).fill('');
  summary.certificates.forEach(certificate => {
    const inspectionDate = certificate.inspectionDate;
    if (!inspectionDate || !inspectionDate.startsWith(String(year))) return;
    const month = Number(inspectionDate.slice(5, 7)) - 1;
    if (month >= 0 && month < 12) states[month] = 'done';
  });

  const interval = Number(summary.intervalMonths || 0);
  if (summary.manufactureDate && interval > 0) {
    const anchor = new Date(summary.manufactureDate);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const cursor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    while (cursor > yearStart) cursor.setMonth(cursor.getMonth() - interval);
    let safety = 0;
    while (cursor <= yearEnd && safety < 200) {
      if (cursor.getFullYear() === year && states[cursor.getMonth()] !== 'done') {
        states[cursor.getMonth()] = 'due';
      }
      cursor.setMonth(cursor.getMonth() + interval);
      safety += 1;
    }
  }
  return states;
}

function renderTypeMonthlyMatrix() {
  const target = document.getElementById('type-monthly-matrix');
  if (!target) return;

  const summaries = getTypeInspectionSummaries();
  const monthLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

  if (summaries.length === 0) {
    target.innerHTML = `
      <div class="app-card p-5">
        <h2 class="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><i data-lucide="table-2" class="h-5 w-5 text-blue-500"></i><span>식품유형별 월간 검사 현황</span></h2>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">등록된 식품유형이 없습니다.</p>
      </div>`;
    return;
  }

  const rows = summaries.map(summary => {
    const states = getTypeMatrixMonthStates(summary, typeMatrixYear);
    const cells = states.map((state, index) => {
      if (state === 'done') return `<td class="py-2 px-1 text-center" title="${monthLabels[index]} 검사 완료"><span class="inline-block h-3.5 w-3.5 rounded-full bg-slate-900 dark:bg-white"></span></td>`;
      if (state === 'due') return `<td class="py-2 px-1 text-center" title="${monthLabels[index]} 검사 예정"><span class="inline-block h-3.5 w-3.5 rounded-full border-2 border-slate-400 dark:border-slate-500"></span></td>`;
      return `<td class="py-2 px-1 text-center"><span class="inline-block h-1 w-1 rounded-full bg-slate-200 dark:bg-slate-700"></span></td>`;
    }).join('');
    return `<tr class="border-t border-slate-100 dark:border-slate-800">
      <th scope="row" class="py-2 px-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">${escapeHtml(summary.type.name)}<span class="ml-1 text-[10px] font-normal text-slate-400">${summary.intervalMonths || '-'}개월</span></th>
      ${cells}
    </tr>`;
  }).join('');

  target.innerHTML = `
    <div class="app-card p-5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><i data-lucide="table-2" class="h-5 w-5 text-blue-500"></i><span>식품유형별 월간 검사 현황</span></h2>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><span class="inline-block h-3 w-3 rounded-full bg-slate-900 dark:bg-white"></span>완료</span>
          <span class="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"><span class="inline-block h-3 w-3 rounded-full border-2 border-slate-400 dark:border-slate-500"></span>예정</span>
          <div class="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-1 py-0.5">
            <button type="button" onclick="setTypeMatrixYear(-1)" class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="이전 연도"><i data-lucide="chevron-left" class="h-3.5 w-3.5"></i></button>
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-200 px-1">${typeMatrixYear}년</span>
            <button type="button" onclick="setTypeMatrixYear(1)" class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="다음 연도"><i data-lucide="chevron-right" class="h-3.5 w-3.5"></i></button>
          </div>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-xs">
          <thead>
            <tr class="text-[10px] text-slate-400 dark:text-slate-500">
              <th class="py-1 px-3 text-left">식품유형</th>
              ${monthLabels.map(label => `<th class="py-1 px-1 text-center font-medium">${label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderHealthMonthlyExpiryChart() {
  const chart = document.getElementById('health-expiry-monthly-chart');
  if (!chart) return;

  const isActiveScope = healthMonthlyStatsScope === 'active';
  const { entries, summary } = getHealthMonthlyExpiryStats();
  const maxCount = Math.max(1, ...entries.map(item => item.total));
  const scopeLabel = isActiveScope ? '재직·알림 활성 직원만' : '전체 등록 직원';
  const scopeDescription = isActiveScope
    ? `퇴직·제외 ${summary.excludedInactive}명 · 알림 중지 ${summary.excludedPaused}명 제외`
    : `재직 ${summary.active}명 · 퇴직·제외 ${summary.inactive}명`;
  const scopeButtonClass = active => active
    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700';
  const statusMeta = [
    { key: 'overdue', label: '만료 초과', color: 'bg-red-500', text: 'text-red-700 dark:text-red-300' },
    { key: 'urgent', label: '알림 구간', color: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
    { key: 'safe', label: '정상', color: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
    { key: 'paused', label: '알림 중지', color: 'bg-violet-500', text: 'text-violet-700 dark:text-violet-300' },
    { key: 'inactive', label: '퇴직·제외', color: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-300' }
  ];

  const metricCard = (label, value, accentClass, description) => `
    <div class="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
      <div class="flex items-center justify-between gap-2 text-[11px] font-semibold ${accentClass}">
        <span>${label}</span><span class="text-base leading-none">${value}명</span>
      </div>
      <p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">${description}</p>
    </div>`;

  chart.innerHTML = `
    <div class="app-card p-5 space-y-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
            <i data-lucide="chart-column-big" class="h-5 w-5 text-blue-500"></i>
            <span>보건증 월별 만료 현황</span>
          </h2>
          <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">${scopeLabel}의 만료일을 기준으로 이번 달을 포함한 향후 12개월을 집계했습니다. 상태는 오늘 기준으로 계산됩니다.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" aria-label="보건증 통계 대상 필터">
            <button type="button" onclick="setHealthMonthlyStatsScope('active')" class="rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${scopeButtonClass(isActiveScope)}">재직자만</button>
            <button type="button" onclick="setHealthMonthlyStatsScope('all')" class="rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${scopeButtonClass(!isActiveScope)}">전체 등록</button>
          </div>
          <button type="button" onclick="switchTab('health')" class="inline-flex w-fit items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/50">
            <i data-lucide="clipboard-check" class="h-3.5 w-3.5"></i><span>보건증 관리</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        ${metricCard(isActiveScope ? '통계 대상' : '등록 인원', summary.registered, 'text-slate-700 dark:text-slate-200', scopeDescription)}
        ${metricCard('만료 초과', summary.overdue, 'text-red-700 dark:text-red-300', '즉시 갱신 확인 필요')}
        ${metricCard('알림 구간', summary.urgent, 'text-amber-700 dark:text-amber-300', `${getHealthAlertDaysLabel()} 기준`)}
        ${metricCard(isActiveScope ? '제외된 인원' : '알림 중지', isActiveScope ? summary.excludedInactive + summary.excludedPaused : summary.paused, 'text-violet-700 dark:text-violet-300', isActiveScope ? '퇴직·제외 및 알림 중지' : '상태 전환으로 재개 가능')}
        ${metricCard('만료일 미입력', summary.noExpiryDate, 'text-slate-700 dark:text-slate-300', '등록 정보 확인 필요')}
      </div>

      <div class="rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900/35">
        <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
          ${statusMeta.map(meta => `<span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full ${meta.color}"></span>${meta.label}</span>`).join('')}
          <span class="ml-auto text-slate-400 dark:text-slate-500">${scopeLabel} · 만료 초과 + 향후 12개월</span>
        </div>
        <div class="flex min-h-48 items-end gap-1.5 sm:gap-3" role="img" aria-label="${scopeLabel} 보건증 월별 만료 상태 통계 차트">
          ${entries.map(item => {
            const segments = statusMeta.filter(meta => item[meta.key] > 0).map(meta => {
              const height = Math.max(8, Math.round((item[meta.key] / maxCount) * 128));
              return `<div class="w-full ${meta.color} first:rounded-t-md last:rounded-b-md" style="height:${height}px" title="${item.fullLabel} · ${meta.label} ${item[meta.key]}명"></div>`;
            }).join('');
            const details = statusMeta.filter(meta => item[meta.key] > 0).map(meta => `${meta.label} ${item[meta.key]}명`).join(', ') || '만료 예정 없음';
            return `
              <div class="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div class="flex h-36 w-full max-w-10 flex-col-reverse justify-start overflow-hidden rounded-md bg-slate-200/80 dark:bg-slate-800" title="${item.fullLabel}: ${details}">
                  ${segments || '<div class="m-auto h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700"></div>'}
                </div>
                <span class="text-[10px] font-semibold text-slate-600 dark:text-slate-300">${item.label}</span>
                <span class="-mt-1 text-[10px] text-slate-400 dark:text-slate-500">${item.total}명</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// 식품유형별로 검사주기를 관리하기 때문에, 같은 유형에 속한 제품이 여러 개라도
// 대시보드에는 최근 제조(검사)일이 가장 늦은 대표 제품 1건만 표시한다.
// 유형이 지정되지 않은 제품은 그룹화하지 않고 모두 표시한다.
function selectLatestPerType(products) {
  const byType = new Map();
  const withoutType = [];
  products.forEach(product => {
    if (!product.typeId) { withoutType.push(product); return; }
    const existing = byType.get(product.typeId);
    if (!existing || String(product.lastManufactureDate || '') > String(existing.lastManufactureDate || '')) {
      byType.set(product.typeId, product);
    }
  });
  return [...byType.values(), ...withoutType];
}

function renderDashboard() {
  const tbody = document.getElementById('dashboard-table-body');
  const mobileList = document.getElementById('dashboard-mobile-list');
  if (!tbody || !mobileList) return;

  const searchKeyword = (document.getElementById('dash-search-input')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('dash-status-select')?.value || dashboardFilter || 'all';
  const typeSelect = document.getElementById('dash-type-select');
  const selectedType = typeSelect?.value || 'all';
  const deadlineFilter = document.getElementById('dash-deadline-select')?.value || 'all';
  const productionFilter = document.getElementById('dash-production-select')?.value || 'all';

  const computedProducts = selectLatestPerType(appState.products.map(product => {
    const computed = getProductComputed(product);
    return {
      ...computed,
      certificateMissing: computed.productionStatus === 'active' && !hasCurrentCertificate(computed)
    };
  }));
  if (typeSelect) {
    const previousType = selectedType;
    typeSelect.innerHTML = `<option value="all">전체 식품유형</option>${appState.types.map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join('')}`;
    typeSelect.value = Array.from(typeSelect.options).some(option => option.value === previousType) ? previousType : 'all';
  }
  const computedHealth = appState.healthCerts.map(getHealthCertComputed);
  renderHealthMonthlyExpiryChart();
  renderTypeMonthlyMatrix();
  updateDashboardQuickFilters();

  const totalCount = computedProducts.length;
  const overdueCount = computedProducts.filter(p => p.status === 'overdue').length;
  const urgentCount = computedProducts.filter(p => p.status === 'urgent').length;
  const safeCount = computedProducts.filter(p => p.status === 'safe').length;
  const healthWarningCount = computedHealth.filter(h => h.status === 'overdue' || h.status === 'urgent').length;

  document.getElementById('kpi-total').textContent = totalCount;
  document.getElementById('kpi-overdue').textContent = overdueCount;
  document.getElementById('kpi-urgent').textContent = urgentCount;
  document.getElementById('kpi-safe').textContent = safeCount;
  document.getElementById('kpi-health-warning').textContent = healthWarningCount;

  const banner = document.getElementById('dashboard-urgent-banner');
  const bannerText = document.getElementById('urgent-banner-text');
  if (overdueCount > 0) {
    banner.classList.remove('hidden');
    banner.className = 'rounded-xl p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
    bannerText.textContent = `현재 법정 자가품질검사 기한을 초과한 품목이 ${overdueCount}건 있습니다. 즉시 생산 및 검사 일정을 확인하세요.`;
  } else if (urgentCount > 0) {
    banner.classList.remove('hidden');
    banner.className = 'rounded-xl p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200';
    bannerText.textContent = `14일 이내 자가품질검사 마감 예정 품목이 ${urgentCount}건 있습니다. 검사 성적서 의뢰를 준비하세요.`;
  } else {
    banner.classList.add('hidden');
  }

  let filtered = computedProducts.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (selectedType !== 'all' && String(p.typeId) !== selectedType) return false;
    if (productionFilter !== 'all' && p.productionStatus !== productionFilter) return false;
    if (deadlineFilter === 'overdue' && !(p.dDay < 0)) return false;
    if (deadlineFilter === 'today_7' && !(p.dDay >= 0 && p.dDay <= 7)) return false;
    if (deadlineFilter === 'days_8_30' && !(p.dDay >= 8 && p.dDay <= 30)) return false;
    if (deadlineFilter === 'over_30' && !(p.dDay > 30)) return false;
    if (dashboardQuickFilter === 'week' && !(p.dDay >= 0 && p.dDay <= getRemainingDaysThisWeek())) return false;
    if (dashboardQuickFilter === 'month' && !(p.dDay >= 0 && p.dDay <= getRemainingDaysThisMonth())) return false;
    if (dashboardQuickFilter === 'missing_certificate' && !p.certificateMissing) return false;
    if (searchKeyword && !p.name.toLowerCase().includes(searchKeyword) && !p.typeName.toLowerCase().includes(searchKeyword)) return false;
    return true;
  });

  const sortPriority = { overdue: 1, urgent: 2, safe: 3, paused: 4, stopped: 5 };
  filtered.sort((a, b) => {
    const pDiff = (sortPriority[a.status] || 99) - (sortPriority[b.status] || 99);
    if (pDiff !== 0) return pDiff;
    return (a.dDay ?? 999) - (b.dDay ?? 999);
  });

  dashboardFilteredProducts = filtered;
  mobileSelectedProductIds = new Set([...mobileSelectedProductIds].filter(id => filtered.some(product => product.id === id)));
  updateMobileBulkToolbar();
  document.getElementById('dash-filtered-count').textContent = `${filtered.length}건`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">조건에 맞는 품목이 없습니다.</td></tr>`;
    mobileList.innerHTML = `
      <div class="mobile-empty-state">
        <i data-lucide="clipboard-list" class="w-5 h-5"></i>
        <span>조건에 맞는 품목이 없습니다.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  mobileList.innerHTML = filtered.map(p => `
    <article class="mobile-schedule-card ${mobileSelectedProductIds.has(p.id) ? 'is-selected' : ''}">
      <div class="mobile-schedule-head">
        <label class="mobile-card-select" aria-label="${escapeHtml(p.name)} 선택">
          <input type="checkbox" ${mobileSelectedProductIds.has(p.id) ? 'checked' : ''} onchange="toggleMobileProductSelection(${p.id}, this.checked)">
          <span></span>
        </label>
        ${renderStatusBadge(p.status, formatDDay(p.dDay))}
        <div class="mobile-schedule-actions">
          <button onclick="viewHistory(${p.id})" class="mobile-icon-button" aria-label="${escapeHtml(p.name)} 검사 이력" title="검사 이력">
            <i data-lucide="history" class="w-4 h-4"></i>
          </button>
          <button onclick="openEditProductModal(${p.id})" class="mobile-icon-button" aria-label="${escapeHtml(p.name)} 수정" title="수정">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
      <h3 class="mobile-schedule-title" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</h3>
      <div class="mobile-schedule-type">${escapeHtml(p.typeName)} · ${p.intervalMonths}개월 주기</div>
      ${p.certificateMissing ? `<div class="mobile-certificate-missing"><i data-lucide="file-warning" class="w-3.5 h-3.5"></i><span>최신 성적서 미등록</span></div>` : ''}
      <dl class="mobile-schedule-meta">
        <div><dt>최근 제조일</dt><dd>${p.lastManufactureDate || '-'}</dd></div>
        <div><dt>검사 마감일</dt><dd>${p.nextDeadline || '-'}</dd></div>
      </dl>
      <button onclick="openQuickRenewModal(${p.id})" class="mobile-renew-button">
        <i data-lucide="check" class="w-4 h-4"></i><span>검사 완료 · 일정 갱신</span>
      </button>
    </article>
  `).join('');

  tbody.innerHTML = filtered.map(p => `
    <tr class="table-row-hover transition">
      <td class="py-3 px-4">${renderStatusBadge(p.status, formatDDay(p.dDay))}</td>
      <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white">${escapeHtml(p.name)}</td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">${escapeHtml(p.typeName)}</span></td>
      <td class="py-3 px-4 font-medium">${p.intervalMonths}개월</td>
      <td class="py-3 px-4 text-slate-500 dark:text-slate-400">${p.lastManufactureDate || '-'}</td>
      <td class="py-3 px-4 font-medium text-slate-900 dark:text-white">${p.nextDeadline || '-'}</td>
      <td class="py-3 px-4 text-center">
        <button onclick="openQuickRenewModal(${p.id})" class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition shadow-sm">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          <span>검사완료</span>
        </button>
      </td>
      <td class="py-3 px-4 text-right action-column">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="viewHistory(${p.id})" class="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="검사 이력">
            <i data-lucide="history" class="w-4 h-4"></i>
          </button>
          <button onclick="openEditProductModal(${p.id})" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="수정">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function updateProductManagementFilters() {
  renderProducts();
}

function resetProductManagementFilters() {
  const query = document.getElementById('product-manager-query');
  const type = document.getElementById('product-manager-type');
  const status = document.getElementById('product-manager-status');
  if (query) query.value = '';
  if (type) type.value = 'all';
  if (status) status.value = 'all';
  renderProducts();
}

// 제품 검색/식품유형/상태 필터를 카드 목록과 아래 표에서 함께 사용한다.
function getFilteredManagedProducts() {
  const typeFilter = document.getElementById('product-manager-type');
  const statusFilter = document.getElementById('product-manager-status');
  const queryInput = document.getElementById('product-manager-query');
  if (!typeFilter || !statusFilter || !queryInput) return appState.products.map(getProductComputed);

  const selectedType = typeFilter.value || 'all';
  typeFilter.innerHTML = `<option value="all">전체 유형</option>${appState.types.map(type => `<option value="${type.id}">${escapeHtml(type.name)}</option>`).join('')}`;
  typeFilter.value = [...typeFilter.options].some(option => option.value === selectedType) ? selectedType : 'all';
  const query = normalizeDataExcelText(queryInput.value).toLocaleLowerCase('ko-KR');
  return appState.products.map(getProductComputed).filter(product => {
    const matchesQuery = !query || normalizeDataExcelText(product.name).toLocaleLowerCase('ko-KR').includes(query);
    const matchesType = typeFilter.value === 'all' || Number(product.typeId) === Number(typeFilter.value);
    const matchesStatus = statusFilter.value === 'all' || product.productionStatus === statusFilter.value;
    return matchesQuery && matchesType && matchesStatus;
  }).sort((left, right) => String(left.nextDeadline || '9999-12-31').localeCompare(String(right.nextDeadline || '9999-12-31')));
}

function renderProductManagementWorkspace() {
  const target = document.getElementById('product-manager-list');
  const count = document.getElementById('product-manager-count');
  if (!target) return;

  const products = getFilteredManagedProducts();

  if (count) count.textContent = `총 ${appState.products.length}건 중 ${products.length}건 표시`;
  if (!products.length) {
    target.innerHTML = '<div class="product-manager-empty">조건에 맞는 제품이 없습니다.</div>';
    return;
  }
  target.innerHTML = products.map(product => {
    const statusLabel = product.productionStatus === 'stopped' ? '생산중단' : '생산중';
    const statusClass = product.productionStatus === 'stopped' ? 'is-stopped' : 'is-active';
    return `<article class="product-manager-card">
      <div class="product-manager-card-head"><div class="min-w-0"><strong title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</strong><span>${escapeHtml(product.typeName)} · ${product.intervalMonths}개월</span></div><span class="product-manager-status ${statusClass}">${statusLabel}</span></div>
      <dl><div><dt>최근 제조일</dt><dd>${product.lastManufactureDate || '미입력'}</dd></div><div><dt>다음 검사일</dt><dd>${product.nextDeadline || '미입력'}</dd></div></dl>
      <div class="product-manager-card-actions"><button type="button" onclick="openEditProductModal(${Number(product.id)})"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>수정</button><button type="button" onclick="viewHistory(${Number(product.id)})"><i data-lucide="history" class="w-3.5 h-3.5"></i>이력</button></div>
    </article>`;
  }).join('');
  lucide.createIcons();
}

function checkProductNameAvailability() {
  const input = document.getElementById('prod-name');
  const status = document.getElementById('prod-name-status');
  const editId = Number(document.getElementById('prod-id')?.value || 0);
  if (!input || !status) return;
  const name = normalizeDataExcelText(input.value);
  if (!name) {
    status.textContent = '제품명은 공백을 제외하고 비교합니다.';
    status.className = 'mt-1 min-h-4 text-[11px] text-slate-400';
    return;
  }
  const same = appState.products.find(product => Number(product.id) !== editId && getProductExcelKey(product) === name.toLocaleLowerCase('ko-KR'));
  if (same) {
    status.textContent = `'${same.name}' 제품이 이미 등록되어 있습니다. 제품 목록 관리에서 수정하세요.`;
    status.className = 'mt-1 min-h-4 text-[11px] font-medium text-red-600 dark:text-red-300';
  } else {
    status.textContent = '등록 가능한 제품명입니다.';
    status.className = 'mt-1 min-h-4 text-[11px] font-medium text-emerald-600 dark:text-emerald-300';
  }
}

function renderProducts() {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  renderProductManagementWorkspace();
  const computedProducts = getFilteredManagedProducts();
  if (computedProducts.length === 0) {
    const message = appState.products.length === 0 ? '등록된 제품이 없습니다. 새 제품을 추가하세요.' : '조건에 맞는 제품이 없습니다.';
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">${message}</td></tr>`;
    return;
  }

  tbody.innerHTML = computedProducts.map(p => `
    <tr class="table-row-hover transition">
      <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white"><span class="table-text-two-lines" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span></td>
      <td class="py-3 px-4"><span class="table-text-one-line px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" title="${escapeHtml(p.typeName)}">${escapeHtml(p.typeName)}</span></td>
      <td class="py-3 px-4">${p.intervalMonths}개월</td>
      <td class="py-3 px-4">${p.lastManufactureDate || '-'}</td>
      <td class="py-3 px-4 font-medium">${p.nextDeadline || '-'}</td>
      <td class="py-3 px-4">
        ${p.productionStatus === 'stopped' 
          ? `<button onclick="openStopStatusModal(${p.id}, 'resume')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:border-emerald-500"><span>생산중단</span><i data-lucide="play" class="w-3 h-3 text-emerald-600"></i></button>`
          : `<button onclick="openStopStatusModal(${p.id}, 'stop')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:border-red-400"><span>생산중</span><i data-lucide="pause" class="w-3 h-3 text-red-500"></i></button>`
        }
      </td>
      <td class="py-3 px-4">
        <button onclick="toggleAlertPause(${p.id})" class="text-xs ${p.alertStatus === 'paused' ? 'text-purple-600 font-semibold' : 'text-slate-400 hover:text-slate-600'}">
          ${p.alertStatus === 'paused' ? '🔕 알림중지' : '🔔 활성'}
        </button>
      </td>
      <td class="py-3 px-4 text-slate-500 text-xs"><span class="table-text-two-lines" title="${escapeHtml(p.memo || '-')}">${escapeHtml(p.memo || '-')}</span></td>
      <td class="py-3 px-4 text-right action-column">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="viewHistory(${p.id})" class="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="이력">
            <i data-lucide="history" class="w-4 h-4"></i>
          </button>
          <button onclick="openEditProductModal(${p.id})" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="수정">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteProduct(${p.id})" class="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="삭제">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function renderTypes() {
  const tbody = document.getElementById('types-table-body');
  if (!tbody) return;

  if (appState.types.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400">등록된 식품유형이 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = appState.types.map(t => {
    const prodCount = appState.products.filter(p => p.typeId === t.id).length;
    return `
      <tr class="table-row-hover transition">
        <td class="py-3 px-4 font-bold text-slate-900 dark:text-white"><span class="table-text-two-lines" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span></td>
        <td class="py-3 px-4 font-semibold text-blue-600 dark:text-blue-400">${t.intervalMonths}개월</td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-300"><span class="table-text-two-lines" title="${escapeHtml(t.testItems || '-')}">${escapeHtml(t.testItems || '-')}</span></td>
        <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">${prodCount}개 제품</span></td>
        <td class="py-3 px-4 text-right action-column">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="openEditTypeModal(${t.id})" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="수정">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteType(${t.id})" class="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="삭제">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function getTypeIntervalPreview(typeId, intervalMonths) {
  const typeProducts = appState.products.filter(product => Number(product.typeId) === Number(typeId));
  const activeProducts = typeProducts.filter(product => product.productionStatus !== 'stopped');
  const productDates = (activeProducts.length ? activeProducts : typeProducts).map(product => product.lastManufactureDate).filter(Boolean);
  const certificateDates = appState.certificates
    .filter(certificate => Number(getCertificateClassification(certificate).typeId) === Number(typeId))
    .map(getCertificateManufactureDate)
    .filter(Boolean);
  const referenceDate = [...productDates, ...certificateDates].sort().at(-1) || '';
  return {
    productCount: typeProducts.length,
    referenceDate,
    dueDate: referenceDate && intervalMonths ? calcNextDeadline(referenceDate, Number(intervalMonths)) : ''
  };
}

function updateTypeIntervalSettingPreview(typeId) {
  const input = document.getElementById(`type-interval-setting-${typeId}`);
  const preview = document.getElementById(`type-interval-preview-${typeId}`);
  const intervalMonths = Number(input?.value || 0);
  const detail = getTypeIntervalPreview(typeId, intervalMonths);
  if (preview) preview.textContent = detail.dueDate ? `기준 제조일 ${detail.referenceDate} → 검사 예정일 ${detail.dueDate}` : '기준 제조일이 없어 예정일을 계산할 수 없습니다.';
}

function renderTypeIntervalSettings() {
  const list = document.getElementById('type-interval-settings-list');
  if (!list) return;
  list.innerHTML = appState.types.map(type => {
    const preview = getTypeIntervalPreview(type.id, type.intervalMonths);
    const text = preview.dueDate ? `기준 제조일 ${preview.referenceDate} → 검사 예정일 ${preview.dueDate}` : '기준 제조일이 없어 예정일을 계산할 수 없습니다.';
    return `<article class="type-interval-setting-row">
      <div><strong>${escapeHtml(type.name)}</strong><span>연결 제품 ${preview.productCount}개</span></div>
      <label for="type-interval-setting-${type.id}"><span>내부 검사 주기 (개월)</span><input id="type-interval-setting-${type.id}" type="number" min="1" max="24" step="1" value="${Number(type.intervalMonths) || 1}" required oninput="updateTypeIntervalSettingPreview(${type.id})" onchange="updateTypeIntervalSettingPreview(${type.id})"></label>
      <p id="type-interval-preview-${type.id}">${text}</p>
    </article>`;
  }).join('');
}

function openTypeIntervalSettingsModal() {
  renderTypeIntervalSettings();
  openModal('modal-type-interval-settings');
  lucide.createIcons();
}

async function handleSaveTypeIntervalSettings(event) {
  event.preventDefault();
  const updates = appState.types.map(type => ({
    type,
    intervalMonths: Number(document.getElementById(`type-interval-setting-${type.id}`)?.value || 0)
  })).filter(update => update.intervalMonths !== Number(update.type.intervalMonths));
  if (!updates.length) return showToast('변경된 검사 주기가 없습니다.', 'info');
  const invalid = updates.filter(update => !Number.isInteger(update.intervalMonths) || update.intervalMonths < 1 || update.intervalMonths > 24);
  if (invalid.length) return showToast('검사 주기는 1~24개월의 정수로 입력하세요.', 'error');

  const submit = document.getElementById('type-interval-settings-submit');
  const originalText = submit?.textContent;
  if (submit) { submit.disabled = true; submit.textContent = '저장 및 재계산 중...'; }
  try {
    if (supabaseClient && isCloudConnected) {
      for (const update of updates) {
        const { error: typeError } = await supabaseClient.from('quality_types').update({ interval_months: update.intervalMonths }).eq('id', Number(update.type.id));
        if (typeError) throw typeError;
        const productIds = appState.products.filter(product => Number(product.typeId) === Number(update.type.id)).map(product => Number(product.id));
        if (productIds.length) {
          const { error: productError } = await supabaseClient.from('quality_products').update({ interval_months: update.intervalMonths }).in('id', productIds);
          if (productError) throw productError;
        }
      }
      await loadCloudState();
    } else {
      updates.forEach(update => {
        update.type.intervalMonths = update.intervalMonths;
        appState.products.filter(product => Number(product.typeId) === Number(update.type.id)).forEach(product => { product.intervalMonths = update.intervalMonths; });
      });
      saveLocalState();
    }
    renderDashboard();
    renderProducts();
    renderTypes();
    renderCertificates();
    closeModal('modal-type-interval-settings');
    showToast(`${updates.length}개 식품유형의 검사 주기를 저장하고 일정을 다시 계산했습니다.`, 'success');
  } catch (error) {
    console.error('식품유형 검사 주기 저장 실패:', error);
    showToast('검사 주기를 저장하지 못했습니다. 클라우드 연결 및 권한을 확인하세요.', 'error');
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = originalText || '주기 저장 및 일정 재계산'; }
  }
}

function setHealthListFilter(filter) {
  healthListFilter = ['all', 'overdue', 'urgent', 'inactive'].includes(filter) ? filter : 'all';
  renderHealthCerts();
}

function setHealthListSort(sort) {
  healthListSort = ['expires_asc', 'expires_desc'].includes(sort) ? sort : 'expires_asc';
  renderHealthCerts();
}

function renderHealthAlertSummary(computedHealth) {
  const summary = document.getElementById('health-alert-summary');
  if (!summary) return;

  const active = computedHealth.filter(c => c.employmentStatus !== 'inactive' && c.alertStatus !== 'paused' && c.dDay !== null);
  const overdue = active.filter(c => c.dDay < 0);
  const urgent = active.filter(c => c.dDay >= 0 && c.dDay <= Math.max(...getHealthAlertDays()));
  const inactive = computedHealth.filter(c => c.employmentStatus === 'inactive');
  const registeredCount = computedHealth.length;
  const activeCount = computedHealth.filter(c => c.employmentStatus !== 'inactive').length;
  const next = active.filter(c => c.dDay >= 0).sort((a, b) => a.dDay - b.dDay)[0];

  summary.innerHTML = `
    <button type="button" onclick="setHealthListFilter('all')" class="text-left rounded-xl border border-blue-200 bg-blue-50 p-3 transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:hover:bg-blue-950/50">
      <span class="block text-xs font-semibold text-blue-700 dark:text-blue-300">등록 인원</span>
      <strong class="mt-1 block text-2xl text-blue-700 dark:text-blue-200">${registeredCount}<small class="ml-1 text-xs font-medium">명</small></strong>
      <span class="mt-0.5 block text-xs text-blue-600/80 dark:text-blue-300/80">재직 ${activeCount}명</span>
    </button>
    <button type="button" onclick="setHealthListFilter('overdue')" class="text-left rounded-xl border border-red-200 bg-red-50 p-3 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:hover:bg-red-950/50">
      <span class="block text-xs font-semibold text-red-700 dark:text-red-300">기간 초과</span>
      <strong class="mt-1 block text-2xl text-red-700 dark:text-red-200">${overdue.length}<small class="ml-1 text-xs font-medium">명</small></strong>
    </button>
    <button type="button" onclick="setHealthListFilter('urgent')" class="text-left rounded-xl border border-amber-200 bg-amber-50 p-3 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50">
      <span class="block text-xs font-semibold text-amber-700 dark:text-amber-300">만료 알림 (${getHealthAlertDaysLabel()})</span>
      <strong class="mt-1 block text-2xl text-amber-700 dark:text-amber-200">${urgent.length}<small class="ml-1 text-xs font-medium">명</small></strong>
    </button>
    <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
      <span class="block text-xs font-semibold text-slate-600 dark:text-slate-300">다음 갱신 예정</span>
      <strong class="mt-1 block truncate text-sm text-slate-900 dark:text-white">${next ? `${escapeHtml(next.employeeName)} · ${formatDDay(next.dDay)}` : '확인 대상 없음'}</strong>
      <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">${next?.expiresAt || '만료일이 등록된 대상자가 없습니다.'}</span>
    </div>
    <button type="button" onclick="setHealthListFilter('inactive')" class="text-left rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/70 dark:hover:bg-slate-800">
      <span class="block text-xs font-semibold text-slate-600 dark:text-slate-300">퇴직·제외</span>
      <strong class="mt-1 block text-2xl text-slate-700 dark:text-slate-200">${inactive.length}<small class="ml-1 text-xs font-medium">명</small></strong>
      <span class="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">알림 발송 제외</span>
    </button>
  `;

  document.querySelectorAll('[data-health-filter]').forEach(button => {
    const activeFilter = button.dataset.healthFilter === healthListFilter;
    button.classList.toggle('ring-2', activeFilter);
    button.classList.toggle('ring-blue-400', activeFilter);
  });
  const sortSelect = document.getElementById('health-sort-select');
  if (sortSelect) sortSelect.value = healthListSort;
}

function renderHealthCerts() {
  const tbody = document.getElementById('health-table-body');
  if (!tbody) return;

  const computedHealth = appState.healthCerts.map(getHealthCertComputed);
  renderHealthAlertSummary(computedHealth);
  const filteredHealth = healthListFilter === 'all'
    ? computedHealth
    : healthListFilter === 'inactive'
      ? computedHealth.filter(c => c.employmentStatus === 'inactive')
      : computedHealth.filter(c => c.status === healthListFilter);

  filteredHealth.sort((a, b) => {
    if (!a.expiresAt && !b.expiresAt) return String(a.employeeName || '').localeCompare(String(b.employeeName || ''), 'ko');
    if (!a.expiresAt) return 1;
    if (!b.expiresAt) return -1;
    const byExpiry = String(a.expiresAt).localeCompare(String(b.expiresAt));
    const byName = String(a.employeeName || '').localeCompare(String(b.employeeName || ''), 'ko');
    return healthListSort === 'expires_desc'
      ? (byExpiry === 0 ? byName : -byExpiry)
      : (byExpiry === 0 ? byName : byExpiry);
  });

  if (filteredHealth.length === 0) {
    const message = computedHealth.length === 0 ? '등록된 보건증 대상자가 없습니다.' : '선택한 상태의 보건증 대상자가 없습니다.';
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">${message}</td></tr>`;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = filteredHealth.map(c => {
    const healthFileUrl = getHealthCertificateDownloadUrl(c);
    const isManagementPending = healthManagementPendingIds.has(Number(c.id));
    const alertPaused = c.alertStatus === 'paused';
    const employmentInactive = c.employmentStatus === 'inactive';
    const alertTitle = alertPaused ? '만료 알림 다시 켜기' : '만료 알림 일시중지';
    const employmentTitle = employmentInactive ? '재직 대상으로 복원' : '퇴직·제외 처리';
    const pendingAttribute = isManagementPending ? 'disabled aria-busy="true"' : '';
    const pendingClass = isManagementPending ? 'opacity-50 cursor-wait' : '';
    return `
    <tr class="table-row-hover transition">
      <td class="py-3 px-4">${renderStatusBadge(c.status, formatDDay(c.dDay))}</td>
      <td class="py-3 px-4 font-bold text-slate-900 dark:text-white"><span class="table-text-one-line" title="${escapeHtml(c.employeeName)}">${escapeHtml(c.employeeName)}</span></td>
      <td class="py-3 px-4 text-slate-600 dark:text-slate-300"><span class="table-text-one-line" title="${escapeHtml(c.department || '-')}">${escapeHtml(c.department || '-')}</span></td>
      <td class="py-3 px-4">${c.issuedAt || '-'}</td>
      <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white">${c.expiresAt || '-'}</td>
      <td class="py-3 px-4">
        ${c.fileUrl || c.hasFile
          ? `<a href="${healthFileUrl || '#'}" target="_blank" onclick="${!healthFileUrl ? `downloadHealthFile(${c.id}); return false;` : ''}" class="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><i data-lucide="paperclip" class="w-3.5 h-3.5"></i><span>사본 열람</span></a>`
          : `<span class="text-slate-400 text-xs">미등록</span>`
        }
      </td>
      <td class="py-3 px-4 text-slate-500 text-xs"><span class="table-text-two-lines" title="${escapeHtml(c.memo || '-')}">${escapeHtml(c.memo || '-')}</span></td>
      <td class="py-3 px-4 text-right action-column">
        <div class="flex items-center justify-end gap-1.5">
          <button type="button" onclick="toggleHealthAlertStatus(${c.id})" ${pendingAttribute} class="p-1.5 rounded-md ${alertPaused ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'} hover:bg-slate-100 dark:hover:bg-slate-800 ${pendingClass}" title="${alertTitle}" aria-label="${alertTitle}">
            <i data-lucide="${alertPaused ? 'bell-off' : 'bell-ring'}" class="w-4 h-4"></i><span class="sr-only">${alertPaused ? '알림 중지됨' : '알림 켜짐'}</span>
          </button>
          <button type="button" onclick="toggleHealthEmploymentStatus(${c.id})" ${pendingAttribute} class="p-1.5 rounded-md ${employmentInactive ? 'text-red-600 bg-red-50 dark:bg-red-950/40' : 'text-blue-600 bg-blue-50 dark:bg-blue-950/40'} hover:bg-slate-100 dark:hover:bg-slate-800 ${pendingClass}" title="${employmentTitle}" aria-label="${employmentTitle}">
            <i data-lucide="${employmentInactive ? 'user-round-x' : 'user-round-check'}" class="w-4 h-4"></i><span class="sr-only">${employmentInactive ? '퇴직·제외' : '재직'}</span>
          </button>
          <button onclick="openEditHealthCertModal(${c.id})" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="수정/갱신">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteHealthCert(${c.id})" class="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="삭제">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function renderCertificates() {
  const tbody = document.getElementById('certs-table-body');
  const mobileList = document.getElementById('certificates-mobile-list');
  if (!tbody) return;
  renderCertificateWorkspace();

  const typeFilterSelect = document.getElementById('certs-type-filter');
  if (typeFilterSelect) {
    const previousValue = typeFilterSelect.value || 'all';
    typeFilterSelect.innerHTML = `<option value="all">전체 식품유형</option>${appState.types.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}<option value="unclassified">유형 미분류</option>`;
    typeFilterSelect.value = Array.from(typeFilterSelect.options).some(option => option.value === previousValue) ? previousValue : 'all';
  }
  const selectedTypeFilter = typeFilterSelect?.value || 'all';
  const searchKeyword = (document.getElementById('certs-search-input')?.value || '').trim().toLowerCase();

  const certificates = appState.certificates.filter(c => {
    const classification = getCertificateClassification(c);
    const typeId = classification.type?.id;
    if (selectedTypeFilter === 'unclassified' && typeId) return false;
    if (selectedTypeFilter !== 'all' && selectedTypeFilter !== 'unclassified' && String(typeId || '') !== selectedTypeFilter) return false;
    if (searchKeyword) {
      const productName = classification.product ? classification.product.name : '';
      const typeName = classification.type?.name || '';
      const haystack = `${c.certNumber || ''} ${productName} ${typeName}`.toLowerCase();
      if (!haystack.includes(searchKeyword)) return false;
    }
    return true;
  });
  const filteredCountEl = document.getElementById('certs-filtered-count');
  if (filteredCountEl) filteredCountEl.textContent = `${certificates.length}건`;

  if (certificates.length === 0) {
    const message = appState.certificates.length === 0 ? '보관된 성적서가 없습니다.' : '조건에 맞는 성적서가 없습니다.';
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">${message}</td></tr>`;
    if (mobileList) mobileList.innerHTML = `<div class="mobile-empty-state"><i data-lucide="file-search" class="w-5 h-5"></i><span>${message}</span></div>`;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = certificates.map(c => {
    const classification = getCertificateClassification(c);
    const productName = classification.product ? classification.product.name : '유형 공통 / 제품 미연결';
    const typeName = classification.type?.name || '유형 미분류';
    const manufactureDate = classification.manufactureDate || '기준일 미입력';
    const scheduledInspectionDate = getCertificateScheduledInspectionDate(c) || '자동 설정 대기';
    return `
      <tr class="table-row-hover transition">
        <td class="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400"><span class="table-text-one-line" title="${escapeHtml(c.certNumber || '-')}">${escapeHtml(c.certNumber || '-')}</span></td>
        <td class="py-3 px-4 font-medium text-slate-900 dark:text-white"><span class="table-text-two-lines" title="${escapeHtml(productName)}">${escapeHtml(productName)}</span></td>
        <td class="py-3 px-4"><span class="table-text-one-line" title="${escapeHtml(typeName)}">${escapeHtml(typeName)}</span><span class="block mt-0.5 text-[10px] text-slate-400">제조 ${manufactureDate}</span><span class="block mt-0.5 text-[10px] font-semibold text-blue-500">예정 ${scheduledInspectionDate}</span></td>
        <td class="py-3 px-4">${c.inspectionDate || '-'}</td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium"><span class="table-text-one-line" title="${escapeHtml(c.fileName || '성적서.pdf')}">${escapeHtml(c.fileName || '성적서.pdf')}</span></td>
        <td class="py-3 px-4 text-slate-400 text-xs">${c.createdAt ? c.createdAt.slice(0, 10) : '-'}</td>
        <td class="py-3 px-4 text-right action-column"><div class="flex flex-wrap items-center justify-end gap-1.5">${certificateAssignmentActionMarkup(c)}${certificateFileActionMarkup(c)}<button type="button" onclick="deleteCert(${Number(c.id)})" class="p-1 text-slate-400 hover:text-red-600" title="성적서 삭제" aria-label="성적서 삭제"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div></td>
      </tr>
    `;
  }).join('');

  if (mobileList) {
    mobileList.innerHTML = certificates.map(c => {
      const classification = getCertificateClassification(c);
      const productName = classification.product ? classification.product.name : '유형 공통 / 제품 미연결';
      const typeName = classification.type?.name || '유형 미분류';
      const manufactureDate = classification.manufactureDate || '기준일 미입력';
      const scheduledInspectionDate = getCertificateScheduledInspectionDate(c) || '자동 설정 대기';
      const fileName = c.fileName || '성적서.pdf';
      const createdAt = c.createdAt ? c.createdAt.slice(0, 10) : '-';
      return `
        <article class="mobile-certificate-card">
          <div class="mobile-certificate-head"><span class="mobile-certificate-number" title="${escapeHtml(c.certNumber || '-')}">${escapeHtml(c.certNumber || '-')}</span><span class="mobile-certificate-date">등록 ${createdAt}</span></div>
          <h3 class="mobile-certificate-product" title="${escapeHtml(productName)}">${escapeHtml(productName)}</h3>
          <p class="mobile-certificate-file" title="${escapeHtml(fileName)}"><i data-lucide="paperclip" class="w-3.5 h-3.5"></i><span>${escapeHtml(fileName)}</span></p>
          <div class="mobile-certificate-meta"><span>${escapeHtml(typeName)}</span><span>제조 ${manufactureDate}</span><span>검사 ${c.inspectionDate || '-'}</span><span>예정 ${scheduledInspectionDate}</span></div>
          <div class="mobile-certificate-actions">${certificateAssignmentActionMarkup(c, true)}${certificateFileActionMarkup(c, true)}<button type="button" onclick="deleteCert(${Number(c.id)})" class="mobile-certificate-delete" aria-label="성적서 삭제"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>
        </article>`;
    }).join('');
  }
  lucide.createIcons();
}

function renderSettings() {
  document.getElementById('setting-tg-token').value = appState.settings.telegramBotToken || '';
  document.getElementById('setting-tg-chatid').value = appState.settings.telegramChatId || '';
  document.getElementById('setting-warning-days').value = appState.settings.warningDays || 14;
  document.getElementById('setting-health-alert-days').value = getHealthAlertDays().join(', ');
  updateTelegramSettingsStatus();
  updateTelegramCloudStatus(isCloudConnected ? '암호화 암호를 입력한 뒤 다른 기기와 동기화할 수 있습니다.' : '클라우드 연결을 확인한 뒤 동기화할 수 있습니다.');
}

// ==================== 5. Modals & Cloud Mutations ====================
function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
  lucide.createIcons();
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function openAddProductModal() {
  if (!appState.types.length) {
    showToast('제품을 등록하려면 먼저 식품유형을 1개 이상 등록하세요.', 'error');
    switchTab('types');
    return;
  }

  document.getElementById('modal-product-title').textContent = '새 제품 등록';
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-last-date').value = getTodayKstStr();
  document.getElementById('prod-memo').value = '';

  const typeSelect = document.getElementById('prod-type-id');
  typeSelect.innerHTML = appState.types.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.intervalMonths}개월)</option>`).join('');
  document.getElementById('prod-interval').value = appState.types[0].intervalMonths;
  checkProductNameAvailability();
  openModal('modal-product');
}

function handleProductTypeChange() {
  const typeId = Number(document.getElementById('prod-type-id').value);
  const type = appState.types.find(t => t.id === typeId);
  if (type) {
    document.getElementById('prod-interval').value = type.intervalMonths;
  }
}

function openEditProductModal(id) {
  const p = appState.products.find(x => x.id === id);
  if (!p) return;

  document.getElementById('modal-product-title').textContent = '제품 정보 수정';
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-last-date').value = p.lastManufactureDate || '';
  document.getElementById('prod-interval').value = p.intervalMonths || 2;
  document.getElementById('prod-memo').value = p.memo || '';

  const typeSelect = document.getElementById('prod-type-id');
  typeSelect.innerHTML = appState.types.map(t => `<option value="${t.id}" ${t.id === p.typeId ? 'selected' : ''}>${t.name} (${t.intervalMonths}개월)</option>`).join('');
  checkProductNameAvailability();
  openModal('modal-product');
}

function isProductIdSequenceConflict(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return error?.code === '23505' && (message.includes('quality_products_pkey') || /key\s*\(id\)/.test(message));
}

function getProductSaveErrorMessage(error) {
  const message = String(error?.message || error?.details || error || '알 수 없는 오류');
  const normalized = message.toLowerCase();
  if (normalized.includes('row-level security') || normalized.includes('permission denied')) {
    return '클라우드 쓰기 권한이 없습니다. 관리자에게 제품 등록 권한 설정을 요청하세요.';
  }
  if (normalized.includes('foreign key') || normalized.includes('type_id')) {
    return '선택한 식품유형 정보를 찾을 수 없습니다. 식품유형을 새로고침한 뒤 다시 시도하세요.';
  }
  if (isProductIdSequenceConflict(error)) {
    return '제품명 중복이 아니라 내부 번호 충돌입니다. 잠시 후 다시 시도하거나 목록을 새로고침하세요.';
  }
  if (normalized.includes('duplicate key') || normalized.includes('unique')) {
    return '같은 식품유형에 동일한 제품명이 이미 등록되어 있습니다. 제품 목록을 새로고침해 확인하세요.';
  }
  return `클라우드에 저장하지 못했습니다. ${message}`;
}

async function insertCloudProductWithIdRecovery(productPayload) {
  let response = await supabaseClient
    .from('quality_products')
    .insert([{ ...productPayload, production_status: 'active', alert_status: 'active' }])
    .select()
    .single();
  if (!response.error || !isProductIdSequenceConflict(response.error)) return { ...response, recoveredIdConflict: false };

  const { data: latestRows, error: latestError } = await supabaseClient
    .from('quality_products')
    .select('id')
    .order('id', { ascending: false })
    .limit(1);
  if (latestError) return { ...response, recoveredIdConflict: false };
  const maxId = Math.max(0, ...(latestRows || []).map(item => Number(item.id) || 0));
  const retry = await supabaseClient
    .from('quality_products')
    .insert([{ id: maxId + 1, ...productPayload, production_status: 'active', alert_status: 'active' }])
    .select()
    .single();
  return { ...retry, recoveredIdConflict: !retry.error };
}

function setProductSaveInProgress(form, saving) {
  const saveButton = form?.querySelector('button[type="submit"]');
  if (!saveButton) return;
  saveButton.disabled = saving;
  saveButton.classList.toggle('opacity-60', saving);
  saveButton.classList.toggle('cursor-not-allowed', saving);
  saveButton.textContent = saving ? '저장 중...' : '저장';
}

function toAppProduct(cloudProduct) {
  return {
    id: cloudProduct.id,
    typeId: cloudProduct.type_id,
    name: cloudProduct.name,
    intervalMonths: cloudProduct.interval_months,
    lastManufactureDate: cloudProduct.last_manufacture_date,
    memo: cloudProduct.memo || '',
    productionStatus: cloudProduct.production_status || 'active',
    stopReason: cloudProduct.stop_reason || '',
    alertStatus: cloudProduct.alert_status || 'active'
  };
}

async function handleSaveProduct(e) {
  e.preventDefault();
  if (isSavingProduct) return;

  const form = e.currentTarget;
  const id = document.getElementById('prod-id').value;
  const name = document.getElementById('prod-name').value.trim();
  const typeId = Number(document.getElementById('prod-type-id').value);
  const intervalMonths = Number(document.getElementById('prod-interval').value);
  const lastManufactureDate = document.getElementById('prod-last-date').value;
  const memo = document.getElementById('prod-memo').value.trim();
  const selectedType = appState.types.find(type => Number(type.id) === typeId);

  if (!name || !lastManufactureDate) {
    showToast('제품명과 최근 제조일을 입력하세요.', 'error');
    return;
  }
  if (!selectedType) {
    showToast('등록된 식품유형을 선택하세요.', 'error');
    return;
  }
  const sameNameProduct = appState.products.find(product => Number(product.id) !== Number(id || 0) && getProductExcelKey(product) === name.toLocaleLowerCase('ko-KR'));
  if (sameNameProduct) {
    showToast(`'${sameNameProduct.name}' 제품이 이미 등록되어 있습니다. 제품 목록 관리에서 수정하세요.`, 'error');
    return;
  }
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > 24) {
    showToast('검사 주기는 1~24개월 사이의 정수로 입력하세요.', 'error');
    return;
  }

  isSavingProduct = true;
  setProductSaveInProgress(form, true);
  try {
    let savedProduct;
    let historySaveFailed = false;

    if (supabaseClient && isCloudConnected) {
      const productPayload = {
        name,
        type_id: typeId,
        interval_months: intervalMonths,
        last_manufacture_date: lastManufactureDate,
        memo
      };

      if (id) {
        const { data, error } = await supabaseClient
          .from('quality_products')
          .update(productPayload)
          .eq('id', Number(id))
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('수정할 제품을 찾을 수 없거나 저장 결과를 확인할 수 없습니다.');
        savedProduct = data;
      } else {
        const { data, error, recoveredIdConflict } = await insertCloudProductWithIdRecovery(productPayload);
        if (error) throw error;
        if (!data) throw new Error('등록 결과를 확인할 수 없습니다.');
        savedProduct = data;
        if (recoveredIdConflict) console.info('제품 내부 번호 충돌을 자동 보정해 등록했습니다.');

        const { error: historyError } = await supabaseClient.from('quality_history').insert([{
          product_id: savedProduct.id,
          product_name: name,
          manufacture_date: lastManufactureDate,
          previous_date: null,
          memo: '초기 제품 등록'
        }]);
        if (historyError) {
          historySaveFailed = true;
          console.warn('초기 제품 이력 저장 실패:', historyError);
        }
      }

      const normalizedProduct = toAppProduct(savedProduct);
      const existingIndex = appState.products.findIndex(product => Number(product.id) === Number(normalizedProduct.id));
      if (existingIndex >= 0) appState.products[existingIndex] = normalizedProduct;
      else appState.products.push(normalizedProduct);
      saveLocalState();
      renderCurrentTab();
      closeModal('modal-product');
      showToast(historySaveFailed ? '제품은 등록됐지만 초기 검사 이력 저장에 실패했습니다.' : (id ? '제품 정보가 클라우드에 저장되었습니다.' : '새 제품이 클라우드에 등록되었습니다.'), historySaveFailed ? 'error' : 'success');
      loadCloudState(false);
      return;
    }

    if (id) {
      const product = appState.products.find(item => Number(item.id) === Number(id));
      if (!product) throw new Error('수정할 제품을 찾을 수 없습니다.');
      Object.assign(product, { name, typeId, intervalMonths, lastManufactureDate, memo });
    } else {
      const newId = appState.products.length ? Math.max(...appState.products.map(product => Number(product.id))) + 1 : 1;
      appState.products.push({ id: newId, name, typeId, intervalMonths, lastManufactureDate, memo, productionStatus: 'active', alertStatus: 'active' });
    }
    saveLocalState();
    renderCurrentTab();
    closeModal('modal-product');
    showToast(id ? '제품 정보가 이 브라우저에 저장되었습니다.' : '새 제품이 이 브라우저에 저장되었습니다.', 'success');
  } catch (error) {
    console.error('제품 저장 실패:', error);
    showToast(supabaseClient && isCloudConnected ? getProductSaveErrorMessage(error) : `제품을 저장하지 못했습니다. ${String(error?.message || error)}`, 'error');
  } finally {
    isSavingProduct = false;
    setProductSaveInProgress(form, false);
  }
}

async function deleteProduct(id) {
  const p = appState.products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`'${p.name}' 제품을 삭제하시겠습니까?`)) return;

  if (supabaseClient && isCloudConnected) {
    try {
      const { error } = await supabaseClient.from('quality_products').delete().eq('id', id);
      if (error) throw error;
      showToast('클라우드에서 제품이 삭제되었습니다.', 'info');
      await loadCloudState();
    } catch (e) {
      console.error(e);
      showToast(getCloudDeleteErrorMessage(e, '제품'), 'error');
    }
  } else {
    appState.products = appState.products.filter(x => x.id !== id);
    saveLocalState();
    renderCurrentTab();
  }
}

function getSelectedMobileProducts() {
  return appState.products.filter(product => mobileSelectedProductIds.has(product.id));
}

function toggleMobileProductSelection(productId, selected) {
  if (selected) mobileSelectedProductIds.add(productId);
  else mobileSelectedProductIds.delete(productId);
  renderDashboard();
}

function selectAllFilteredProducts() {
  dashboardFilteredProducts.forEach(product => mobileSelectedProductIds.add(product.id));
  renderDashboard();
}

function clearMobileSelection(render = true) {
  mobileSelectedProductIds.clear();
  if (render) renderDashboard();
}

function updateMobileBulkToolbar() {
  const toolbar = document.getElementById('mobile-bulk-toolbar');
  const count = document.getElementById('mobile-bulk-count');
  if (!toolbar || !count) return;
  const size = mobileSelectedProductIds.size;
  count.textContent = `${size}개 선택`;
  toolbar.classList.toggle('hidden', size === 0);
}

function openBulkQuickRenewModal() {
  const selected = getSelectedMobileProducts();
  if (!selected.length) {
    showToast('먼저 일괄 처리할 품목을 선택하세요.', 'error');
    return;
  }
  document.getElementById('bulk-renew-count').textContent = `${selected.length}개`;
  document.getElementById('bulk-renew-date').value = getTodayKstStr();
  document.getElementById('bulk-renew-memo').value = `${getTodayKstStr()} 정기검사/생산 완료`;
  openModal('modal-bulk-renew');
}

async function handleBulkQuickRenew(e) {
  e.preventDefault();
  const selected = getSelectedMobileProducts();
  const newDate = document.getElementById('bulk-renew-date').value;
  const memo = document.getElementById('bulk-renew-memo').value.trim() || '일괄 검사 완료 갱신';
  if (!selected.length || !newDate) return;
  if (!confirm(`${selected.length}개 품목의 최근 제조(검사)일을 ${newDate}로 일괄 갱신하시겠습니까?`)) return;

  try {
    if (supabaseClient && isCloudConnected) {
      await Promise.all(selected.map(async product => {
        await supabaseClient.from('quality_products').update({ last_manufacture_date: newDate }).eq('id', product.id);
        await supabaseClient.from('quality_history').insert([{
          product_id: product.id,
          product_name: product.name,
          manufacture_date: newDate,
          previous_date: product.lastManufactureDate,
          memo
        }]);
      }));
      await loadCloudState();
    } else {
      selected.forEach((product, index) => {
        const previousDate = product.lastManufactureDate;
        product.lastManufactureDate = newDate;
        appState.history.push({
          id: Date.now() + index,
          productId: product.id,
          productName: product.name,
          manufactureDate: newDate,
          previousDate,
          memo,
          createdAt: new Date().toISOString()
        });
      });
      saveLocalState();
    }
    clearMobileSelection(false);
    closeModal('modal-bulk-renew');
    renderDashboard();
    showToast(`${selected.length}개 품목의 일정이 일괄 갱신되었습니다.`, 'success');
  } catch (error) {
    console.error('일괄 일정 갱신 실패:', error);
    showToast('일괄 일정 갱신에 실패했습니다. 다시 시도하세요.', 'error');
  }
}

async function bulkSetAlertStatus(status) {
  const selected = getSelectedMobileProducts();
  if (!selected.length) {
    showToast('먼저 일괄 처리할 품목을 선택하세요.', 'error');
    return;
  }
  const label = status === 'paused' ? '중지' : '재개';
  if (!confirm(`${selected.length}개 품목의 알림을 일괄 ${label}하시겠습니까?`)) return;

  try {
    if (supabaseClient && isCloudConnected) {
      const { error } = await supabaseClient.from('quality_products').update({ alert_status: status }).in('id', selected.map(product => product.id));
      if (error) throw error;
      await loadCloudState();
    } else {
      selected.forEach(product => { product.alertStatus = status; });
      saveLocalState();
    }
    clearMobileSelection(false);
    renderDashboard();
    showToast(`${selected.length}개 품목의 알림을 일괄 ${label}했습니다.`, 'success');
  } catch (error) {
    console.error('일괄 알림 상태 변경 실패:', error);
    showToast('일괄 알림 상태 변경에 실패했습니다. 다시 시도하세요.', 'error');
  }
}

function openQuickRenewModal(id) {
  const p = appState.products.find(x => x.id === id);
  if (!p) return;

  document.getElementById('renew-prod-id').value = p.id;
  document.getElementById('renew-prod-name').textContent = p.name;
  document.getElementById('renew-prod-info').textContent = `기존 최근제조일: ${p.lastManufactureDate || '없음'} • 주기: ${p.intervalMonths || 2}개월`;
  document.getElementById('renew-date').value = getTodayKstStr();
  document.getElementById('renew-memo').value = `${getTodayKstStr()} 정기검사/생산 완료`;

  openModal('modal-quick-renew');
}

async function handleQuickRenew(e) {
  e.preventDefault();
  const id = Number(document.getElementById('renew-prod-id').value);
  const newDate = document.getElementById('renew-date').value;
  const memo = document.getElementById('renew-memo').value.trim();

  const p = appState.products.find(x => x.id === id);
  if (!p) return;

  const prevDate = p.lastManufactureDate;

  if (supabaseClient && isCloudConnected) {
    try {
      await supabaseClient.from('quality_products').update({ last_manufacture_date: newDate }).eq('id', id);
      await supabaseClient.from('quality_history').insert([{
        product_id: p.id,
        product_name: p.name,
        manufacture_date: newDate,
        previous_date: prevDate,
        memo: memo || '검사 완료 갱신'
      }]);
      showToast(`${p.name} 검사 일정이 클라우드에 갱신되었습니다.`, 'success');
      await loadCloudState();
    } catch (err) {
      console.error(err);
    }
  } else {
    p.lastManufactureDate = newDate;
    appState.history.push({
      id: Date.now(),
      productId: p.id,
      productName: p.name,
      manufactureDate: newDate,
      previousDate: prevDate,
      memo: memo || '검사 완료 갱신',
      createdAt: new Date().toISOString()
    });
    saveLocalState();
    renderCurrentTab();
  }

  closeModal('modal-quick-renew');
}

function viewHistory(productId) {
  const p = appState.products.find(x => x.id === productId);
  if (!p) return;

  document.getElementById('history-modal-title').textContent = `${p.name} - 검사 이력`;
  document.getElementById('history-modal-subtitle').textContent = '자가품질검사 및 제조일 갱신 기록';

  const records = appState.history.filter(h => h.productId === productId).sort((a, b) => new Date(b.manufactureDate) - new Date(a.manufactureDate));
  const container = document.getElementById('history-timeline-content');

  if (records.length === 0) {
    container.innerHTML = `<p class="text-center py-6 text-slate-400">등록된 검사 이력이 없습니다.</p>`;
  } else {
    container.innerHTML = records.map((r, i) => `
      <div class="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start gap-3">
        <div class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
          ${records.length - i}
        </div>
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-900 dark:text-white">제조(검사)일: ${r.manufactureDate}</span>
            <span class="text-[11px] text-slate-400">${r.createdAt ? r.createdAt.slice(0, 10) : ''}</span>
          </div>
          ${r.previousDate ? `<div class="text-[11px] text-slate-500 mt-0.5">이전 기록: ${r.previousDate}</div>` : ''}
          <div class="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium">${escapeHtml(r.memo || '정기 검사')}</div>
        </div>
      </div>
    `).join('');
  }

  openModal('modal-history');
}

function openStopStatusModal(productId, actionType) {
  const p = appState.products.find(x => x.id === productId);
  if (!p) return;

  document.getElementById('stop-prod-id').value = p.id;
  document.getElementById('stop-action-type').value = actionType;

  if (actionType === 'stop') {
    document.getElementById('stop-modal-title').textContent = `${p.name} 생산 중단 처리`;
    document.getElementById('stop-modal-desc').textContent = '생산 중단 처리 시 다음 마감일 계산 및 자동 알림이 제외됩니다.';
    document.getElementById('stop-reason-box').classList.remove('hidden');
    document.getElementById('resume-date-box').classList.add('hidden');
    document.getElementById('stop-submit-btn').className = 'px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold';
    document.getElementById('stop-submit-btn').textContent = '생산 중단';
  } else {
    document.getElementById('stop-modal-title').textContent = `${p.name} 재생산 시작 (재개)`;
    document.getElementById('stop-modal-desc').textContent = '재생산 제조일자를 입력하면 새로운 검사 주기 및 마감일이 계산됩니다.';
    document.getElementById('stop-reason-box').classList.add('hidden');
    document.getElementById('resume-date-box').classList.remove('hidden');
    document.getElementById('resume-date-input').value = getTodayKstStr();
    document.getElementById('stop-submit-btn').className = 'px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold';
    document.getElementById('stop-submit-btn').textContent = '생산 재개';
  }

  openModal('modal-stop');
}

async function handleSaveStopStatus(e) {
  e.preventDefault();
  const id = Number(document.getElementById('stop-prod-id').value);
  const actionType = document.getElementById('stop-action-type').value;
  const p = appState.products.find(x => x.id === id);
  if (!p) return;

  const isStop = actionType === 'stop';
  const stopReason = isStop ? (document.getElementById('stop-reason-input').value.trim() || '일시 생산 중단') : '';
  const newDate = isStop ? p.lastManufactureDate : document.getElementById('resume-date-input').value;

  if (supabaseClient && isCloudConnected) {
    try {
      await supabaseClient.from('quality_products').update({
        production_status: isStop ? 'stopped' : 'active',
        stop_reason: stopReason,
        last_manufacture_date: newDate
      }).eq('id', id);
      showToast(`${p.name} 생산 상태가 변경되었습니다.`, 'info');
      await loadCloudState();
    } catch (err) {
      console.error(err);
    }
  } else {
    p.productionStatus = isStop ? 'stopped' : 'active';
    p.stopReason = stopReason;
    p.lastManufactureDate = newDate;
    saveLocalState();
    renderCurrentTab();
  }

  closeModal('modal-stop');
}

async function toggleAlertPause(productId) {
  const p = appState.products.find(x => x.id === productId);
  if (!p) return;
  const newStatus = p.alertStatus === 'paused' ? 'active' : 'paused';

  if (supabaseClient && isCloudConnected) {
    await supabaseClient.from('quality_products').update({ alert_status: newStatus }).eq('id', productId);
    await loadCloudState();
  } else {
    p.alertStatus = newStatus;
    saveLocalState();
    renderCurrentTab();
  }
}

function openAddTypeModal() {
  document.getElementById('modal-type-title').textContent = '새 식품유형 등록';
  document.getElementById('type-id').value = '';
  document.getElementById('type-name').value = '';
  document.getElementById('type-interval').value = '2';
  document.getElementById('type-items').value = '';
  openModal('modal-type');
}

function openEditTypeModal(id) {
  const t = appState.types.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-type-title').textContent = '식품유형 수정';
  document.getElementById('type-id').value = t.id;
  document.getElementById('type-name').value = t.name;
  document.getElementById('type-interval').value = t.intervalMonths;
  document.getElementById('type-items').value = t.testItems || '';
  openModal('modal-type');
}

async function insertCloudTypeWithIdRecovery(payload) {
  let response = await retryCloudMutation(() => supabaseClient.from('quality_types').insert([payload]).select('id,name,interval_months').single());
  if (!response.error || response.error.code !== '23505') return response;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: maxRows, error: maxError } = await supabaseClient.from('quality_types').select('id').order('id', { ascending: false }).limit(1);
    if (maxError) return { data: null, error: maxError };
    const nextId = Number(maxRows?.[0]?.id || 0) + 1;
    response = await retryCloudMutation(() => supabaseClient.from('quality_types').insert([{ ...payload, id: nextId }]).select('id,name,interval_months').single());
    if (!response.error || response.error.code !== '23505') return response;
  }
  return response;
}

async function handleSaveType(e) {
  e.preventDefault();
  const id = document.getElementById('type-id').value;
  const name = document.getElementById('type-name').value.trim();
  const intervalMonths = Number(document.getElementById('type-interval').value);
  const testItems = document.getElementById('type-items').value.trim();

  if (!name || !intervalMonths) {
    showToast('유형명과 검사 주기를 입력하세요.', 'error');
    return;
  }
  if (!id && appState.types.some(type => String(type.name || '').replace(/\s+/g, '').toLowerCase() === name.replace(/\s+/g, '').toLowerCase())) {
    showToast(`'${name}' 식품유형이 이미 등록되어 있습니다.`, 'error');
    return;
  }

  if (supabaseClient && isCloudConnected) {
    try {
      if (id) {
        const { error: typeError } = await supabaseClient.from('quality_types').update({ name, interval_months: intervalMonths, test_items: testItems }).eq('id', Number(id));
        if (typeError) throw typeError;
        const productIds = appState.products.filter(product => Number(product.typeId) === Number(id)).map(product => Number(product.id));
        if (productIds.length) {
          const { error: productError } = await supabaseClient.from('quality_products').update({ interval_months: intervalMonths }).in('id', productIds);
          if (productError) throw productError;
        }
      } else {
        const { error: typeError } = await insertCloudTypeWithIdRecovery({ name, interval_months: intervalMonths, test_items: testItems });
        if (typeError) throw typeError;
      }
      showToast('식품유형이 클라우드에 저장되었습니다.', 'success');
      await loadCloudState();
    } catch (err) {
      console.error(err);
      showToast('식품유형과 검사 주기를 저장하지 못했습니다. 클라우드 연결 및 권한을 확인하세요.', 'error');
      return;
    }
  } else {
    if (id) {
      const t = appState.types.find(x => x.id === Number(id));
      if (t) {
        t.name = name;
        t.intervalMonths = intervalMonths;
        t.testItems = testItems;
        appState.products.filter(product => Number(product.typeId) === Number(id)).forEach(product => { product.intervalMonths = intervalMonths; });
      }
    } else {
      const newId = appState.types.length ? Math.max(...appState.types.map(t => t.id)) + 1 : 1;
      appState.types.push({ id: newId, name, intervalMonths, testItems });
    }
    saveLocalState();
    renderCurrentTab();
  }

  closeModal('modal-type');
}

async function deleteType(id) {
  const inUse = appState.products.some(p => p.typeId === id);
  if (inUse) {
    showToast('해당 식품유형에 속한 제품이 있어 삭제할 수 없습니다.', 'error');
    return;
  }
  if (!confirm('이 식품유형을 삭제하시겠습니까?')) return;

  if (supabaseClient && isCloudConnected) {
    try {
      const { error } = await supabaseClient.from('quality_types').delete().eq('id', id);
      if (error) throw error;
      showToast('식품유형이 삭제되었습니다.', 'info');
      await loadCloudState();
    } catch (e) {
      console.error(e);
      showToast(getCloudDeleteErrorMessage(e, '식품유형'), 'error');
    }
  } else {
    appState.types = appState.types.filter(t => t.id !== id);
    saveLocalState();
    renderCurrentTab();
  }
}

function openAddHealthCertModal() {
  document.getElementById('modal-health-title').textContent = '새 보건증 등록';
  document.getElementById('health-id').value = '';
  document.getElementById('health-name').value = '';
  document.getElementById('health-dept').value = '';
  const today = getTodayKstStr();
  document.getElementById('health-issued').value = today;
  document.getElementById('health-expires').value = calcNextDeadline(today, 12);
  document.getElementById('health-file').value = '';
  document.getElementById('health-memo').value = '';
  openModal('modal-health');
}

function handleHealthIssuedChange() {
  const issued = document.getElementById('health-issued').value;
  if (issued) {
    document.getElementById('health-expires').value = calcNextDeadline(issued, 12);
  }
}

function openEditHealthCertModal(id) {
  const c = appState.healthCerts.find(x => x.id === id);
  if (!c) return;

  document.getElementById('modal-health-title').textContent = '보건증 정보 수정 / 갱신';
  document.getElementById('health-id').value = c.id;
  document.getElementById('health-name').value = c.employeeName;
  document.getElementById('health-dept').value = c.department || '';
  document.getElementById('health-issued').value = c.issuedAt || '';
  document.getElementById('health-expires').value = c.expiresAt || '';
  document.getElementById('health-file').value = '';
  document.getElementById('health-memo').value = c.memo || '';
  openModal('modal-health');
}

// 일부 사내 네트워크 보안장비가 PDF 파일 업로드를 차단하는 사례가 있어(이미지 업로드는 정상),
// PDF는 업로드 전 각 페이지를 이미지(PNG)로 변환해 세로로 이어붙여 하나의 PNG로 저장한다.
// 열람/다운로드 시에는 이미지 형태 그대로 제공되며, 원본 PDF 텍스트 레이어는 유지되지 않는다.
async function convertPdfFileToPngFile(file) {
  if (!window.pdfjsLib) throw new Error('PDF 변환 라이브러리를 불러오지 못했습니다.');
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const scale = 2;
  const pageCanvases = [];
  let totalHeight = 0;
  let maxWidth = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;
    pageCanvases.push(canvas);
    totalHeight += canvas.height;
    maxWidth = Math.max(maxWidth, canvas.width);
  }

  const combined = document.createElement('canvas');
  combined.width = maxWidth;
  combined.height = totalHeight;
  const combinedContext = combined.getContext('2d');
  combinedContext.fillStyle = '#ffffff';
  combinedContext.fillRect(0, 0, combined.width, combined.height);
  let offsetY = 0;
  pageCanvases.forEach(canvas => {
    combinedContext.drawImage(canvas, 0, offsetY);
    offsetY += canvas.height;
  });

  const blob = await new Promise((resolve, reject) => {
    combined.toBlob(result => (result ? resolve(result) : reject(new Error('PDF를 이미지로 변환하지 못했습니다.'))), 'image/png', 0.92);
  });

  const baseName = String(file.name || '성적서').replace(/\.pdf$/i, '');
  return new File([blob], `${baseName}.png`, { type: 'image/png' });
}

async function uploadFileToCloud(file, folder = 'health') {
  if (!supabaseClient) throw new Error('클라우드 파일 저장소가 초기화되지 않았습니다.');
  if (!file || !file.name || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('선택한 파일이 비어 있거나 브라우저에서 읽을 수 없습니다. 파일을 다시 선택해 주세요.');
  }

  if (file.type === 'application/pdf') {
    try {
      file = await convertPdfFileToPngFile(file);
    } catch (conversionError) {
      console.error('PDF 이미지 변환 실패:', conversionError);
      throw new Error('PDF 파일을 이미지로 변환하지 못했습니다. 다른 파일로 다시 시도해 주세요.');
    }
  }

  const safeFolder = String(folder || 'files').replace(/[^a-z0-9_-]/gi, '') || 'files';
  const rawExtension = String(file.name).split('.').pop() || 'bin';
  const safeExtension = rawExtension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  const randomId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replaceAll('-', '')
    : Math.random().toString(36).slice(2);
  const storageName = `${safeFolder}_${Date.now()}_${randomId}.${safeExtension}`;
  const filePath = `${safeFolder}/${storageName}`;

  try {
    const uploadResult = await retryCloudMutation(() => supabaseClient.storage
      .from('quality-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        contentType: file.type || undefined,
        // 같은 경로로 재시도해 첫 요청의 응답만 유실된 경우에도 안전하게 완료합니다.
        upsert: true
      }));
    if (!uploadResult?.data?.path) {
      throw new Error('파일 업로드 완료 경로를 받지 못했습니다.');
    }

    const publicUrlResult = supabaseClient.storage.from('quality-files').getPublicUrl(filePath);
    const publicUrl = String(publicUrlResult?.data?.publicUrl || '').trim();
    if (!publicUrl) throw new Error('파일 업로드 결과 주소를 받지 못했습니다.');

    return { url: publicUrl, name: file.name, path: filePath };
  } catch (error) {
    if (error && typeof error === 'object') {
      error.uploadFileName = file.name;
      error.uploadFileSize = file.size;
    }
    console.error('파일 클라우드 업로드 실패:', error);
    throw error;
  }
}

async function stageCertificateFileWithFallback(file) {
  try {
    const uploadResult = await uploadFileToCloud(file, 'certs');
    return { url: uploadResult.url, name: uploadResult.name, localFileKey: '' };
  } catch (error) {
    if (!isTransientCloudError(error)) throw error;
    const randomId = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const localFileKey = `certificate:${Date.now()}:${randomId}`;
    await saveFileToLocalCache(localFileKey, file);
    console.warn('클라우드 파일 전송이 차단되어 성적서를 이 브라우저에만 보관합니다.', error);
    return { url: '', name: file.name, localFileKey };
  }
}

function mapHealthCertificateRow(c) {
  return {
    id: c.id,
    employeeName: c.employee_name,
    department: c.department || '',
    issuedAt: c.issued_at,
    expiresAt: c.expires_at,
    warningDays: c.warning_days || 30,
    memo: c.memo || '',
    fileUrl: c.file_url || '',
    fileName: c.file_name || '',
    hasFile: !!(c.file_url || c.file_name),
    employmentStatus: c.employment_status || 'active',
    alertStatus: c.alert_status || 'active'
  };
}

async function handleSaveHealthCert(e) {
  e.preventDefault();
  if (isSavingHealthCert) return;

  const id = document.getElementById('health-id').value;
  const employeeName = document.getElementById('health-name').value.trim();
  const department = document.getElementById('health-dept').value.trim();
  const issuedAt = document.getElementById('health-issued').value;
  const expiresAt = document.getElementById('health-expires').value;
  const memo = document.getElementById('health-memo').value.trim();
  const fileInput = document.getElementById('health-file');

  if (!employeeName || !issuedAt || !expiresAt) {
    showToast('담당자명, 발급일, 만료일을 입력하세요.', 'error');
    return;
  }

  isSavingHealthCert = true;
  showToast('보건증 정보를 저장하는 중...', 'info');

  try {
    let fileUrl = '';
    let fileName = '';
    if (fileInput.files.length > 0) {
      const uploadRes = await uploadFileToCloud(fileInput.files[0], 'health');
      if (!uploadRes.url) throw new Error('첨부 파일을 클라우드 저장소에 업로드하지 못했습니다. 파일을 다시 선택해 주세요.');
      fileUrl = uploadRes.url;
      fileName = uploadRes.name;
    }

    if (supabaseClient && isCloudConnected) {
      let response;
      if (id) {
        const updateData = {
          employee_name: employeeName,
          department,
          issued_at: issuedAt,
          expires_at: expiresAt,
          memo
        };
        if (fileUrl) {
          updateData.file_url = fileUrl;
          updateData.file_name = fileName;
        }
        response = await supabaseClient
          .from('quality_health_certs')
          .update(updateData)
          .eq('id', Number(id))
          .select()
          .single();
      } else {
        response = await supabaseClient
          .from('quality_health_certs')
          .insert([{
            employee_name: employeeName,
            department,
            issued_at: issuedAt,
            expires_at: expiresAt,
            warning_days: appState.settings.healthWarningDays || 30,
            memo,
            file_url: fileUrl,
            file_name: fileName,
            employment_status: 'active',
            alert_status: 'active'
          }])
          .select()
          .single();
      }

      if (response.error) throw response.error;
      if (!response.data) throw new Error('저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');

      const saved = mapHealthCertificateRow(response.data);
      const existingIndex = appState.healthCerts.findIndex(item => Number(item.id) === Number(saved.id));
      if (existingIndex >= 0) appState.healthCerts.splice(existingIndex, 1, saved);
      else appState.healthCerts.push(saved);
      appState.healthCerts.sort((a, b) => Number(a.id) - Number(b.id));
      saveLocalState();
      renderCurrentTab();
      closeModal('modal-health');
      showToast('보건증 정보와 첨부 파일이 저장되었습니다.', 'success');
      void loadCloudState();
      return;
    }

    if (id) {
      const c = appState.healthCerts.find(x => x.id === Number(id));
      if (c) {
        c.employeeName = employeeName;
        c.department = department;
        c.issuedAt = issuedAt;
        c.expiresAt = expiresAt;
        c.memo = memo;
        if (fileName) { c.fileName = fileName; c.fileUrl = fileUrl; c.hasFile = true; }
      }
    } else {
      const targetId = appState.healthCerts.length ? Math.max(...appState.healthCerts.map(c => c.id)) + 1 : 1;
      appState.healthCerts.push({
        id: targetId,
        employeeName,
        department,
        issuedAt,
        expiresAt,
        warningDays: appState.settings.healthWarningDays || 30,
        memo,
        hasFile: !!fileName,
        fileUrl,
        fileName,
        employmentStatus: 'active',
        alertStatus: 'active'
      });
    }
    saveLocalState();
    renderCurrentTab();
    closeModal('modal-health');
    showToast('보건증 정보가 이 브라우저에 저장되었습니다.', 'success');
  } catch (err) {
    console.error('보건증 저장 실패:', err);
    showToast(`보건증 저장에 실패했습니다: ${err?.message || '클라우드 연결 또는 권한을 확인해 주세요.'}`, 'error');
  } finally {
    isSavingHealthCert = false;
  }
}

async function deleteHealthCert(id) {
  const c = appState.healthCerts.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`'${c.employeeName}' 담당자의 보건증 기록을 삭제하시겠습니까?`)) return;

  if (supabaseClient && isCloudConnected) {
    try {
      const { error } = await supabaseClient.from('quality_health_certs').delete().eq('id', id);
      if (error) throw error;
      showToast('보건증 기록이 삭제되었습니다.', 'info');
      await loadCloudState();
    } catch (e) {
      console.error(e);
      showToast(getCloudDeleteErrorMessage(e, '보건증 기록'), 'error');
    }
  } else {
    appState.healthCerts = appState.healthCerts.filter(x => x.id !== id);
    saveLocalState();
    renderCurrentTab();
  }
}

function openUploadCertModal() {
  const year = new Date().getFullYear();
  const seq = String(appState.settings.certSequence || 1).padStart(3, '0');
  document.getElementById('cert-number').value = `${appState.settings.certPrefix || 'CONF-QC'}-${year}-${seq}`;
  document.getElementById('cert-date').value = getTodayKstStr();
  document.getElementById('cert-file').value = '';
  document.getElementById('cert-memo').value = '';
  document.getElementById('cert-manufacture-date').value = '';

  const prodSelect = document.getElementById('cert-product-id');
  prodSelect.innerHTML = `<option value="">선택 안 함 (유형 공통)</option>` + appState.products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  const typeSelect = document.getElementById('cert-type-id');
  typeSelect.innerHTML = `<option value="">유형 선택</option>` + appState.types.map(type => `<option value="${type.id}">${escapeHtml(type.name)} (${type.intervalMonths}개월)</option>`).join('');
  openModal('modal-upload-cert');
}

function mapCertificateRow(certificate) {
  return {
    id: certificate.id,
    certNumber: certificate.cert_number || '',
    productId: certificate.product_id,
    inspectionDate: certificate.inspection_date,
    fileUrl: certificate.file_url || '',
    fileName: certificate.file_name || '',
    fileSize: certificate.file_size || 0,
    memo: certificate.memo || '',
    createdAt: certificate.created_at || new Date().toISOString()
  };
}

function setCertificateSaveInProgress(form, saving, savingLabel = '저장 중...') {
  const saveButton = form?.querySelector('button[type="submit"]');
  if (!saveButton) return;
  if (!saveButton.dataset.defaultLabel) saveButton.dataset.defaultLabel = saveButton.textContent.trim();
  saveButton.disabled = saving;
  saveButton.classList.toggle('opacity-60', saving);
  saveButton.classList.toggle('cursor-not-allowed', saving);
  saveButton.textContent = saving ? savingLabel : saveButton.dataset.defaultLabel;
}

function isTransientCloudError(error) {
  const message = [error?.message, error?.details, error?.error, error?.statusCode, error?.status, error]
    .filter(value => value !== undefined && value !== null)
    .join(' ')
    .toLowerCase();
  return error instanceof TypeError
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('too many requests')
    || message.includes('bad gateway')
    || message.includes('service unavailable')
    || message.includes('gateway timeout')
    || /\b(429|502|503|504)\b/.test(message);
}

async function retryCloudMutation(operation, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation();
      if (!result?.error) return result;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }
    if (!isTransientCloudError(lastError) || attempt === maxAttempts) break;
    await new Promise(resolve => setTimeout(resolve, 450 * attempt));
  }
  throw lastError || new Error('클라우드 저장 결과를 확인하지 못했습니다.');
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}

function getCloudDeleteErrorMessage(error, label = '항목') {
  const message = [error?.message, error?.details, error?.error]
    .filter(Boolean)
    .map(value => String(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ') || String(error || '알 수 없는 오류');
  const statusCode = Number(error?.statusCode || error?.status || 0);
  const normalized = `${message} ${statusCode}`.toLowerCase();
  if (normalized.includes('row-level security') || normalized.includes('permission denied')) {
    return `${label} 삭제 권한이 없습니다. 관리자에게 클라우드 삭제 권한 설정을 요청하세요.`;
  }
  if (normalized.includes('jwt') || statusCode === 401 || statusCode === 403) {
    return '클라우드 인증이 만료되었습니다. 페이지를 새로고침한 뒤 다시 시도하세요.';
  }
  if (isTransientCloudError(error)) {
    return '클라우드 연결이 불안정합니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.';
  }
  return `${label}을(를) 삭제하지 못했습니다. ${message}`;
}

function getCertificateSaveErrorMessage(error) {
  const message = [error?.message, error?.details, error?.error]
    .filter(Boolean)
    .map(value => String(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ') || String(error || '알 수 없는 오류');
  const statusCode = Number(error?.statusCode || error?.status || 0);
  const normalized = `${message} ${statusCode}`.toLowerCase();
  if (isTransientCloudError(error)) {
    return '파일 전송을 3회 시도했지만 클라우드 연결이 끊겼습니다. 입력값은 유지됩니다. 인터넷 연결을 확인한 뒤 다시 저장하세요.';
  }
  if (statusCode === 413 || normalized.includes('payload too large') || normalized.includes('maximum allowed size') || normalized.includes('file size limit')) {
    const sizeText = Number(error?.uploadFileSize) > 0 ? ` (선택 파일 ${formatFileSize(error.uploadFileSize)})` : '';
    return `파일 용량이 클라우드 저장 한도를 초과했습니다${sizeText}. PDF 용량을 줄인 뒤 다시 첨부하세요.`;
  }
  if (normalized.includes('row-level security') || normalized.includes('permission denied')) {
    return '성적서 등록 권한이 없습니다. 관리자에게 클라우드 쓰기 권한 설정을 요청하세요.';
  }
  if (normalized.includes('mime type') || normalized.includes('content type') || normalized.includes('invalid file type')) {
    return '허용되지 않은 파일 형식입니다. PDF 또는 이미지 파일로 다시 첨부하세요.';
  }
  if (normalized.includes('bucket not found') || normalized.includes('nosuchbucket')) {
    return '성적서 파일 저장소 설정을 찾지 못했습니다. 관리자에게 quality-files 버킷 설정 확인을 요청하세요.';
  }
  if (normalized.includes('jwt') || statusCode === 401 || statusCode === 403) {
    return '클라우드 인증 또는 파일 업로드 권한이 만료되었습니다. 페이지를 새로고침한 뒤 다시 시도하세요.';
  }
  return `성적서를 저장하지 못했습니다. ${message}`;
}

function syncSavedCertificate(savedCertificate) {
  const normalized = mapCertificateRow(savedCertificate);
  const existingIndex = appState.certificates.findIndex(certificate => Number(certificate.id) === Number(normalized.id));
  if (existingIndex >= 0) appState.certificates.splice(existingIndex, 1, normalized);
  else appState.certificates.unshift(normalized);
  appState.certificates.sort((a, b) => Number(b.id) - Number(a.id));
  saveLocalState();
  renderCurrentTab();
}

function openReplaceCertFileModal(certificateId) {
  const certificate = getCertificateById(certificateId);
  if (!certificate) {
    showToast('성적서 정보를 찾을 수 없습니다.', 'error');
    return;
  }
  document.getElementById('replace-cert-id').value = certificate.id;
  document.getElementById('replace-cert-number').textContent = certificate.certNumber || '성적서 번호 미입력';
  document.getElementById('replace-cert-filename').textContent = certificate.fileName || '기존 파일명 없음';
  document.getElementById('replace-cert-file').value = '';
  openModal('modal-replace-cert-file');
}

async function handleReplaceCertFile(e) {
  e.preventDefault();
  if (isSavingCertificate) return;

  const form = e.currentTarget;
  const certificateId = Number(document.getElementById('replace-cert-id').value);
  const fileInput = document.getElementById('replace-cert-file');
  if (!certificateId || !fileInput.files.length) {
    showToast('다시 첨부할 성적서 파일을 선택하세요.', 'error');
    return;
  }
  if (!supabaseClient || !isCloudConnected) {
    showToast('성적서 파일은 클라우드 연결 후에 보관할 수 있습니다.', 'error');
    return;
  }

  isSavingCertificate = true;
  setCertificateSaveInProgress(form, true, '파일 저장 중...');
  try {
    const file = fileInput.files[0];
    const stagedFile = await stageCertificateFileWithFallback(file);
    const updatePayload = { file_url: stagedFile.url, file_name: stagedFile.name, file_size: file.size };

    const { data, error } = await supabaseClient
      .from('quality_certificates')
      .update(updatePayload)
      .eq('id', certificateId)
      .select()
      .single();
    if (error || !data) {
      if (stagedFile.localFileKey) await deleteFileFromLocalCache(stagedFile.localFileKey);
      if (error) throw error;
      throw new Error('파일 보완 결과를 확인하지 못했습니다.');
    }

    if (stagedFile.localFileKey) registerLocalCertificateFile(certificateId, stagedFile.localFileKey);
    else await clearLocalCertificateFile(certificateId);
    syncSavedCertificate(data);
    closeModal('modal-replace-cert-file');
    showToast(stagedFile.localFileKey
      ? '클라우드 전송이 차단되어 파일을 이 브라우저에만 보관했습니다. 성적서 정보는 저장되었습니다.'
      : '성적서 파일이 보관되었습니다. 이제 열람과 다운로드가 가능합니다.', stagedFile.localFileKey ? 'info' : 'success');
    void loadCloudState();
  } catch (error) {
    console.error('성적서 파일 보완 실패:', error);
    showToast(getCertificateSaveErrorMessage(error), 'error');
  } finally {
    isSavingCertificate = false;
    setCertificateSaveInProgress(form, false);
  }
}

async function handleSaveCert(e) {
  e.preventDefault();
  if (isSavingCertificate) return;

  const form = e.currentTarget;
  const certNumber = document.getElementById('cert-number').value.trim();
  const productId = document.getElementById('cert-product-id').value;
  const typeId = Number(document.getElementById('cert-type-id').value || 0);
  const manufactureDate = document.getElementById('cert-manufacture-date').value;
  const inspectionDate = document.getElementById('cert-date').value;
  const memo = document.getElementById('cert-memo').value.trim();
  const fileInput = document.getElementById('cert-file');

  if (!inspectionDate || fileInput.files.length === 0) return showToast('검사 일자와 성적서 파일을 첨부하세요.', 'error');
  if (!typeId || !manufactureDate) return showToast('성적서 정리를 위해 식품유형과 기준 제조일을 입력하세요.', 'error');
  if (!supabaseClient || !isCloudConnected) return showToast('성적서 파일은 클라우드 연결 후에 보관할 수 있습니다.', 'error');

  isSavingCertificate = true;
  setCertificateSaveInProgress(form, true, '성적서 저장 중...');
  try {
    const file = fileInput.files[0];
    const stagedFile = await stageCertificateFileWithFallback(file);

    const { data, error } = await supabaseClient
      .from('quality_certificates')
      .insert([{ cert_number: certNumber, product_id: productId ? Number(productId) : null, inspection_date: inspectionDate, file_url: stagedFile.url, file_name: stagedFile.name, file_size: file.size, memo }])
      .select()
      .single();
    if (error || !data) {
      if (stagedFile.localFileKey) await deleteFileFromLocalCache(stagedFile.localFileKey);
      if (error) throw error;
      throw new Error('성적서 등록 결과를 확인하지 못했습니다.');
    }

    await updateCertificateMetadata(data.id, { typeId, manufactureDate, source: productId ? '제품 연동' : '직접 입력' });
    appState.settings.certSequence = (appState.settings.certSequence || 1) + 1;
    if (stagedFile.localFileKey) registerLocalCertificateFile(data.id, stagedFile.localFileKey);
    syncSavedCertificate(data);
    renderCertificates();
    closeModal('modal-upload-cert');
    showToast(stagedFile.localFileKey
      ? '성적서 정보는 저장되었고, 원본 파일은 이 브라우저에만 보관되었습니다.'
      : '성적서가 유형·제조일 정보와 함께 클라우드에 등록되었습니다.', stagedFile.localFileKey ? 'info' : 'success');
    void loadCloudState();
  } catch (error) {
    console.error('성적서 등록 실패:', error);
    showToast(getCertificateSaveErrorMessage(error), 'error');
  } finally {
    isSavingCertificate = false;
    setCertificateSaveInProgress(form, false);
  }
}

async function deleteCert(id) {
  const c = appState.certificates.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`성적서 '${c.certNumber || c.fileName}'을(를) 삭제하시겠습니까?`)) return;

  if (supabaseClient && isCloudConnected) {
    try {
      const { error } = await supabaseClient.from('quality_certificates').delete().eq('id', id);
      if (error) throw error;
      await removeCertificateMetadata([id]);
      await clearLocalCertificateFile(id);
      showToast('성적서가 삭제되었습니다.', 'info');
      await loadCloudState();
    } catch (e) {
      console.error(e);
      showToast(getCloudDeleteErrorMessage(e, '성적서'), 'error');
    }
  } else {
    appState.certificates = appState.certificates.filter(x => x.id !== id);
    await removeCertificateMetadata([id]);
    await clearLocalCertificateFile(id);
    saveLocalState();
    renderCurrentTab();
  }
}

// ==================== 6. Excel, Backup & Telegram ====================
function exportScheduleExcel() {
  const computedProducts = appState.products.map(getProductComputed);
  const prodRows = computedProducts.map(p => ({
    '상태': STATUS_CONFIG[p.status]?.label || '정상',
    'D-Day': formatDDay(p.dDay),
    '제품명': p.name,
    '식품유형': p.typeName,
    '검사주기(개월)': p.intervalMonths,
    '최근제조일': p.lastManufactureDate || '',
    '차기마감일': p.nextDeadline || '',
    '생산상태': p.productionStatus === 'stopped' ? `중단(${p.stopReason || '사유미기재'})` : '생산중',
    '알림상태': p.alertStatus === 'paused' ? '일시중지' : '정상',
    '비고': p.memo || ''
  }));

  const healthRows = appState.healthCerts.map(getHealthCertComputed).map(c => ({
    '상태': STATUS_CONFIG[c.status]?.label || '정상',
    'D-Day': formatDDay(c.dDay),
    '담당자명': c.employeeName,
    '소속부서': c.department || '',
    '발급일자': c.issuedAt,
    '만료일자': c.expiresAt,
    '성적서파일': c.fileUrl || c.fileName || '미등록',
    '재직상태': c.employmentStatus === 'inactive' ? '퇴사/제외' : '재직중',
    '메모': c.memo || ''
  }));

  const wb = XLSX.utils.book_new();
  const wsProd = XLSX.utils.json_to_sheet(prodRows);
  const wsHealth = XLSX.utils.json_to_sheet(healthRows);

  XLSX.utils.book_append_sheet(wb, wsProd, '자가품질검사 일정');
  XLSX.utils.book_append_sheet(wb, wsHealth, '보건증 관리대장');

  const today = getTodayKstStr();
  XLSX.writeFile(wb, `코엔에프_품질검사스케줄러_${today}.xlsx`);
  showToast('엑셀 보고서가 다운로드되었습니다.', 'success');
}

function normalizeDataExcelText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDataExcelDate(value) {
  return normalizeHealthExcelDate(value);
}

function getDataExcelValue(row, names) {
  for (const name of names) {
    const value = row?.[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function getProductExcelKey(product) {
  return normalizeDataExcelText(product?.name).toLocaleLowerCase('ko-KR');
}

function validateExcelCertificateProductMatching(certificateRows, productRows) {
  const currentProducts = appState.products.map(product => ({ id: Number(product.id), name: product.name, source: '현재 제품 목록' }));
  const incomingProducts = productRows.map((row, index) => ({
    id: Number(getDataExcelValue(row, ['제품ID', 'ID'])) || 0,
    name: normalizeDataExcelText(getDataExcelValue(row, ['제품명', '품목명', 'name'])),
    source: `제품 데이터 ${index + 2}행`
  })).filter(product => product.name);
  const productById = new Map(currentProducts.map(product => [Number(product.id), product]));
  const productByName = new Map();
  [...currentProducts, ...incomingProducts].forEach(product => {
    const key = getProductExcelKey(product);
    if (!key) return;
    const matches = productByName.get(key) || [];
    if (!matches.some(match => Number(match.id) === Number(product.id) && match.name === product.name)) matches.push(product);
    productByName.set(key, matches);
  });

  const errors = [];
  const summary = { matchedById: 0, matchedByName: 0, retainedUnlinked: 0, warnings: [] };
  certificateRows.forEach((row, index) => {
    const rowLabel = `성적서 데이터 ${index + 2}행`;
    const incomingCertificateId = Number(getDataExcelValue(row, ['성적서ID', 'ID'])) || 0;
    const incomingProductId = Number(getDataExcelValue(row, ['제품ID'])) || 0;
    const productName = normalizeDataExcelText(getDataExcelValue(row, ['제품명', '품목명']));
    const idProduct = incomingProductId ? productById.get(incomingProductId) : null;
    const nameMatches = productName ? (productByName.get(productName.toLocaleLowerCase('ko-KR')) || []) : [];
    const existingCertificate = incomingCertificateId ? appState.certificates.find(certificate => Number(certificate.id) === incomingCertificateId) : null;

    if (incomingProductId && !idProduct) {
      errors.push(`${rowLabel}: 제품ID ${incomingProductId}를 찾지 못했습니다. 제품 데이터 시트의 ID를 확인하거나 제품명을 정확히 입력하세요.`);
      return;
    }
    if (productName && !nameMatches.length) {
      errors.push(`${rowLabel}: 제품명 '${productName}'이(가) 현재 목록 또는 제품 데이터 시트와 일치하지 않습니다.`);
      return;
    }
    if (nameMatches.length > 1 && !idProduct) {
      errors.push(`${rowLabel}: 제품명 '${productName}'이(가) 여러 제품과 일치합니다. 제품ID를 지정하세요.`);
      return;
    }
    if (idProduct && productName && getProductExcelKey(idProduct) !== productName.toLocaleLowerCase('ko-KR')) {
      errors.push(`${rowLabel}: 제품ID ${incomingProductId}의 제품명 '${idProduct.name}'과 입력한 제품명 '${productName}'이(가) 다릅니다.`);
      return;
    }
    if (idProduct) summary.matchedById += 1;
    else if (nameMatches.length === 1) summary.matchedByName += 1;
    else if (existingCertificate && !existingCertificate.productId) {
      summary.retainedUnlinked += 1;
      summary.warnings.push(`${rowLabel}: 기존 미연결 성적서로 유지됩니다.`);
    } else {
      errors.push(`${rowLabel}: 제품ID 또는 제품명이 비어 있습니다. 성적서는 반드시 등록된 제품과 연결해야 합니다.`);
    }
  });
  return { errors, summary };
}

function getCertificateExcelKey(certificate) {
  return [
    normalizeDataExcelText(certificate?.certNumber).toLocaleLowerCase('ko-KR'),
    String(certificate?.inspectionDate || ''),
    Number(certificate?.productId || 0)
  ].join('|');
}

function buildDataExcelSheet(rows, widths) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  sheet['!cols'] = widths.map(wch => ({ wch }));
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  if (range.e.r >= 0) sheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  Object.keys(sheet).filter(key => /^[A-Z]+1$/.test(key)).forEach(key => {
    sheet[key].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F4E79' } }, alignment: { horizontal: 'center', vertical: 'center' } };
  });
  return sheet;
}

function exportProductsCertificatesExcel() {
  if (!window.XLSX) {
    showToast('엑셀 도구를 불러오는 중입니다. 잠시 후 다시 시도하세요.', 'error');
    return;
  }
  const productRows = appState.products.map(product => {
    const computed = getProductComputed(product);
    return {
      '제품ID': product.id,
      '제품명': product.name || '',
      '식품유형': computed.typeName || '',
      '검사주기(개월)': Number(product.intervalMonths || 0),
      '최근제조일': product.lastManufactureDate || '',
      '생산상태': product.productionStatus === 'stopped' ? '중단' : '생산중',
      '알림상태': product.alertStatus === 'paused' ? '일시중지' : '정상',
      '비고': product.memo || ''
    };
  });
  const certificateRows = appState.certificates.map(certificate => {
    const classification = getCertificateClassification(certificate);
    const product = appState.products.find(item => Number(item.id) === Number(certificate.productId));
    return {
      '성적서ID': certificate.id,
      '성적서번호': certificate.certNumber || '',
      '제품ID': certificate.productId || '',
      '제품명': product?.name || '',
      '식품유형': classification.type?.name || '',
      '검사일': certificate.inspectionDate || '',
      '제조일': classification.manufactureDate || '',
      '검사예정일(자동)': getCertificateScheduledInspectionDate(certificate) || '',
      '파일명': certificate.fileName || '',
      '파일URL': getCertificateFileUrl(certificate) || '',
      '비고': certificate.memo || ''
    };
  });
  const guideRows = [
    { '구분': '가져오기 원칙', '내용': '제품 데이터·성적서 데이터 시트를 유지하고 첫 행의 열 제목을 변경하지 마세요.' },
    { '구분': '병합 기준', '내용': '제품은 제품ID 우선(없으면 제품명), 성적서는 성적서ID 우선(없으면 성적서번호·검사일·제품ID)으로 기존 행을 갱신합니다.' },
    { '구분': '안전 규칙', '내용': '가져오기는 신규 추가 또는 기존 갱신만 수행하며, 파일에 없는 기존 데이터는 삭제하지 않습니다.' },
    { '구분': '날짜 형식', '내용': '최근제조일·검사일·제조일은 YYYY-MM-DD 형식으로 입력합니다.' },
    { '구분': '파일 정보', '내용': '파일URL은 원본 파일을 새로 업로드하지 않습니다. 기존 저장소 URL을 보존하거나 이미 접근 가능한 URL만 입력하세요.' },
    { '구분': '성적서 메타데이터', '내용': '식품유형과 제조일을 입력하면 현재 유형별 검사 주기로 검사예정일과 캘린더가 자동 재계산됩니다.' }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildDataExcelSheet(productRows, [10, 28, 18, 14, 15, 12, 12, 32]), '제품 데이터');
  XLSX.utils.book_append_sheet(workbook, buildDataExcelSheet(certificateRows, [11, 22, 10, 28, 18, 14, 14, 17, 38, 54, 32]), '성적서 데이터');
  XLSX.utils.book_append_sheet(workbook, buildDataExcelSheet(guideRows, [22, 96]), '작성 안내');
  XLSX.writeFile(workbook, `코엔에프_제품_성적서_통합_${getTodayKstStr()}.xlsx`);
  showToast(`제품 ${productRows.length}건 · 성적서 ${certificateRows.length}건을 Excel로 내보냈습니다.`, 'success');
}

function parseProductsCertificatesExcel(workbook) {
  const productsSheet = workbook.Sheets['제품 데이터'];
  const certificatesSheet = workbook.Sheets['성적서 데이터'];
  if (!productsSheet && !certificatesSheet) throw new Error('`제품 데이터` 또는 `성적서 데이터` 시트를 찾을 수 없습니다. 앱에서 내보낸 양식을 사용하세요.');
  return {
    products: productsSheet ? XLSX.utils.sheet_to_json(productsSheet, { defval: '', raw: false }) : [],
    certificates: certificatesSheet ? XLSX.utils.sheet_to_json(certificatesSheet, { defval: '', raw: false }) : []
  };
}

async function ensureDataExcelType(typeName, intervalMonths) {
  const name = normalizeDataExcelText(typeName) || '기타가공품';
  let type = appState.types.find(item => normalizeDataExcelText(item.name) === name);
  if (type) return type;
  const interval = Math.min(24, Math.max(1, Number(intervalMonths) || 2));
  if (supabaseClient && isCloudConnected) {
    const { data, error } = await supabaseClient.from('quality_types').insert([{ name, interval_months: interval, test_items: '' }]).select().single();
    if (error) throw error;
    type = { id: data.id, name: data.name, intervalMonths: data.interval_months, testItems: data.test_items || '' };
  } else {
    const nextId = appState.types.length ? Math.max(...appState.types.map(item => Number(item.id) || 0)) + 1 : 1;
    type = { id: nextId, name, intervalMonths: interval, testItems: '' };
  }
  appState.types.push(type);
  return type;
}

async function importProductsCertificatesExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const cloudMode = Boolean(supabaseClient && isCloudConnected);
  try {
    if (!window.XLSX) throw new Error('엑셀 도구를 불러오지 못했습니다.');
    const binary = await file.arrayBuffer();
    const workbook = XLSX.read(binary, { type: 'array', cellDates: true });
    const parsed = parseProductsCertificatesExcel(workbook);
    const productRows = parsed.products.filter(row => Object.values(row).some(value => normalizeDataExcelText(value)));
    const certificateRows = parsed.certificates.filter(row => Object.values(row).some(value => normalizeDataExcelText(value)));
    if (!productRows.length && !certificateRows.length) throw new Error('가져올 제품 또는 성적서 행이 없습니다.');
    const matchValidation = validateExcelCertificateProductMatching(certificateRows, productRows);
    if (matchValidation.errors.length) {
      throw new Error(`제품명 매칭 검증 실패 (${matchValidation.errors.length}건)\n${matchValidation.errors.slice(0, 5).join('\n')}${matchValidation.errors.length > 5 ? `\n외 ${matchValidation.errors.length - 5}건` : ''}`);
    }
    const matchSummary = `제품ID 일치 ${matchValidation.summary.matchedById}건 · 제품명 일치 ${matchValidation.summary.matchedByName}건${matchValidation.summary.retainedUnlinked ? ` · 기존 미연결 유지 ${matchValidation.summary.retainedUnlinked}건` : ''}`;
    if (!confirm(`제품 ${productRows.length}건 · 성적서 ${certificateRows.length}건을 검사합니다.\n제품명 매칭 검증: ${matchSummary}\n\n기존 ID 또는 동일 기준 행은 갱신하고, 나머지는 추가합니다. 파일에 없는 기존 데이터는 삭제하지 않습니다. 계속하시겠습니까?`)) return;

    let addedProducts = 0;
    let updatedProducts = 0;
    let addedCertificates = 0;
    let updatedCertificates = 0;
    const productById = new Map(appState.products.map(product => [Number(product.id), product]));
    const productByName = new Map(appState.products.map(product => [getProductExcelKey(product), product]));

    for (let index = 0; index < productRows.length; index += 1) {
      const row = productRows[index];
      const name = normalizeDataExcelText(getDataExcelValue(row, ['제품명', '품목명', 'name']));
      if (!name) throw new Error(`제품 데이터 ${index + 2}행: 제품명이 비어 있습니다.`);
      const type = await ensureDataExcelType(getDataExcelValue(row, ['식품유형', '유형']), getDataExcelValue(row, ['검사주기(개월)', '검사주기']));
      const interval = Math.min(24, Math.max(1, Number(getDataExcelValue(row, ['검사주기(개월)', '검사주기'])) || Number(type.intervalMonths) || 2));
      const manufactureDate = normalizeDataExcelDate(getDataExcelValue(row, ['최근제조일', '제조일', '최근제조검사일']));
      if (!manufactureDate) throw new Error(`제품 데이터 ${index + 2}행: 최근제조일을 YYYY-MM-DD 형식으로 입력하세요.`);
      const incomingId = Number(getDataExcelValue(row, ['제품ID', 'ID'])) || 0;
      const existing = productById.get(incomingId) || productByName.get(name.toLocaleLowerCase('ko-KR'));
      const payload = {
        name,
        type_id: Number(type.id),
        interval_months: interval,
        last_manufacture_date: manufactureDate,
        memo: normalizeDataExcelText(getDataExcelValue(row, ['비고', '메모'])),
        production_status: normalizeDataExcelText(getDataExcelValue(row, ['생산상태'])) === '중단' ? 'stopped' : 'active',
        alert_status: normalizeDataExcelText(getDataExcelValue(row, ['알림상태'])) === '일시중지' ? 'paused' : 'active'
      };
      let saved;
      if (cloudMode) {
        const request = existing
          ? supabaseClient.from('quality_products').update(payload).eq('id', Number(existing.id)).select().single()
          : supabaseClient.from('quality_products').insert([payload]).select().single();
        const { data, error } = await request;
        if (error) throw new Error(`제품 데이터 ${index + 2}행: ${error.message}`);
        saved = { id: data.id, typeId: data.type_id, name: data.name, intervalMonths: data.interval_months, lastManufactureDate: data.last_manufacture_date, memo: data.memo || '', productionStatus: data.production_status || 'active', stopReason: data.stop_reason || '', alertStatus: data.alert_status || 'active' };
      } else if (existing) {
        Object.assign(existing, { id: existing.id, typeId: payload.type_id, name, intervalMonths: interval, lastManufactureDate: manufactureDate, memo: payload.memo, productionStatus: payload.production_status, alertStatus: payload.alert_status });
        saved = existing;
      } else {
        const nextId = appState.products.length ? Math.max(...appState.products.map(product => Number(product.id) || 0)) + 1 : 1;
        saved = { id: nextId, typeId: payload.type_id, name, intervalMonths: interval, lastManufactureDate: manufactureDate, memo: payload.memo, productionStatus: payload.production_status, stopReason: '', alertStatus: payload.alert_status };
        appState.products.push(saved);
      }
      productById.set(Number(saved.id), saved);
      productByName.set(getProductExcelKey(saved), saved);
      if (existing) updatedProducts += 1; else addedProducts += 1;
    }
    if (cloudMode) await loadCloudState();

    const certificateById = new Map(appState.certificates.map(certificate => [Number(certificate.id), certificate]));
    const certificateByKey = new Map(appState.certificates.map(certificate => [getCertificateExcelKey(certificate), certificate]));
    const metadata = getCertificateMetadataMap();
    for (let index = 0; index < certificateRows.length; index += 1) {
      const row = certificateRows[index];
      const certNumber = normalizeDataExcelText(getDataExcelValue(row, ['성적서번호', '성적서 번호', 'certNumber']));
      const inspectionDate = normalizeDataExcelDate(getDataExcelValue(row, ['검사일', '검사일자', 'inspectionDate']));
      if (!certNumber || !inspectionDate) throw new Error(`성적서 데이터 ${index + 2}행: 성적서번호와 검사일은 필수입니다.`);
      const incomingProductId = Number(getDataExcelValue(row, ['제품ID'])) || 0;
      const productName = normalizeDataExcelText(getDataExcelValue(row, ['제품명', '품목명']));
      const product = appState.products.find(item => Number(item.id) === incomingProductId) || productByName.get(productName.toLocaleLowerCase('ko-KR')) || null;
      if ((incomingProductId || productName) && !product) throw new Error(`성적서 데이터 ${index + 2}행: 제품 매칭 검증 이후 제품 정보를 찾지 못했습니다. 파일을 다시 확인하세요.`);
      const incomingId = Number(getDataExcelValue(row, ['성적서ID', 'ID'])) || 0;
      const key = getCertificateExcelKey({ certNumber, inspectionDate, productId: product?.id || 0 });
      const existing = certificateById.get(incomingId) || certificateByKey.get(key);
      const fileUrl = normalizeDataExcelText(getDataExcelValue(row, ['파일URL', '파일주소']));
      const fileName = normalizeDataExcelText(getDataExcelValue(row, ['파일명']));
      const payload = { cert_number: certNumber, product_id: product ? Number(product.id) : null, inspection_date: inspectionDate, memo: normalizeDataExcelText(getDataExcelValue(row, ['비고', '메모'])) };
      if (fileUrl) payload.file_url = fileUrl;
      if (fileName) payload.file_name = fileName;
      let saved;
      if (cloudMode) {
        const request = existing
          ? supabaseClient.from('quality_certificates').update(payload).eq('id', Number(existing.id)).select().single()
          : supabaseClient.from('quality_certificates').insert([{ ...payload, file_url: payload.file_url || '', file_name: payload.file_name || '', file_size: 0 }]).select().single();
        const { data, error } = await request;
        if (error) throw new Error(`성적서 데이터 ${index + 2}행: ${error.message}`);
        saved = { id: data.id, certNumber: data.cert_number, productId: data.product_id, inspectionDate: data.inspection_date, fileUrl: data.file_url || '', fileName: data.file_name || '', fileSize: data.file_size || 0, memo: data.memo || '', createdAt: data.created_at };
      } else if (existing) {
        Object.assign(existing, { certNumber, productId: product?.id || null, inspectionDate, memo: payload.memo });
        if (fileUrl) existing.fileUrl = fileUrl;
        if (fileName) existing.fileName = fileName;
        saved = existing;
      } else {
        const nextId = appState.certificates.length ? Math.max(...appState.certificates.map(certificate => Number(certificate.id) || 0)) + 1 : 1;
        saved = { id: nextId, certNumber, productId: product?.id || null, inspectionDate, fileUrl, fileName, fileSize: 0, memo: payload.memo, createdAt: new Date().toISOString() };
        appState.certificates.push(saved);
      }
      const typeName = normalizeDataExcelText(getDataExcelValue(row, ['식품유형', '유형'])) || (product ? appState.types.find(item => Number(item.id) === Number(product.typeId))?.name : '');
      const type = typeName ? await ensureDataExcelType(typeName, product?.intervalMonths) : null;
      const manufactureDate = normalizeDataExcelDate(getDataExcelValue(row, ['제조일']));
      const existingMeta = metadata[String(saved.id)] || {};
      metadata[String(saved.id)] = {
        ...existingMeta,
        ...(type ? { typeId: Number(type.id) } : {}),
        ...(manufactureDate ? { manufactureDate } : {}),
        source: 'Excel 가져오기',
        updatedAt: new Date().toISOString()
      };
      if (type && manufactureDate) metadata[String(saved.id)].scheduledInspectionDate = calcNextDeadline(manufactureDate, Number(type.intervalMonths || 0));
      certificateById.set(Number(saved.id), saved);
      certificateByKey.set(getCertificateExcelKey(saved), saved);
      if (existing) updatedCertificates += 1; else addedCertificates += 1;
    }
    if (certificateRows.length) await saveCertificateMetadataMap(metadata);
    if (cloudMode) await loadCloudState();
    else { saveLocalState(); renderCurrentTab(); }
    showToast(`Excel 가져오기 완료: 제품 신규 ${addedProducts}건·갱신 ${updatedProducts}건, 성적서 신규 ${addedCertificates}건·갱신 ${updatedCertificates}건`, 'success');
  } catch (error) {
    console.error('제품·성적서 Excel 가져오기 실패:', error);
    showToast(`Excel 가져오기에 실패했습니다. ${error?.message || '파일 양식과 데이터를 확인하세요.'}`, 'error');
  } finally {
    event.target.value = '';
  }
}

function downloadHealthExcelTemplate() {
  if (!window.XLSX) {
    showToast('엑셀 양식 생성 도구를 불러오는 중입니다. 잠시 후 다시 시도하세요.', 'error');
    return;
  }

  const inputRows = [
    ['보건증 일괄 등록 양식'],
    ['아래 열 제목은 변경하지 말고, 한 사람당 한 줄씩 작성한 뒤 보건증 관리 화면에서 업로드하세요.'],
    ['이름·검진일은 필수이며, 만료일을 비워두면 검진일 기준 1년 후로 자동 계산됩니다.'],
    [],
    ['이름', '부서/직위', '검진일', '만료일', '결과'],
    ...Array.from({ length: 20 }, () => ['', '', '', '', ''])
  ];
  const guideRows = [
    ['항목', '작성 규칙'],
    ['이름', '필수 · 예: 홍길동'],
    ['부서/직위', '선택 · 예: 품질관리팀 / 팀장'],
    ['검진일', '필수 · 예: 2026-08-26'],
    ['만료일', '선택 · 비워두면 검진일 기준 1년 후로 자동 계산'],
    ['결과', '선택 · 예: 적합'],
    ['업로드', '보건증 관리 화면의 작성 양식 업로드 버튼으로 이 파일을 올리세요.'],
    ['주의', '열 제목과 순서는 유지하세요. 같은 이름은 발급·만료일을 갱신하고 첨부 파일은 유지합니다.']
  ];

  const workbook = XLSX.utils.book_new();
  const inputSheet = XLSX.utils.aoa_to_sheet(inputRows);
  const guideSheet = XLSX.utils.aoa_to_sheet(guideRows);
  inputSheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } }
  ];
  inputSheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 15 }, { wch: 15 }, { wch: 14 }];
  guideSheet['!cols'] = [{ wch: 18 }, { wch: 74 }];
  inputSheet['!autofilter'] = { ref: 'A5:E25' };
  inputSheet['A1'].s = { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center' } };
  inputSheet['A5'].s = { font: { bold: true } };

  XLSX.utils.book_append_sheet(workbook, inputSheet, '보건증 등록 양식');
  XLSX.utils.book_append_sheet(workbook, guideSheet, '작성 안내');
  XLSX.writeFile(workbook, '코엔에프_보건증_일괄등록_양식.xlsx');
  showToast('보건증 일괄 등록 엑셀 양식이 다운로드되었습니다.', 'success');
}

function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet);

      let addedCount = 0;
      for (const r of rows) {
        const name = r['제품명'] || r['품목명'] || r['name'];
        if (!name) continue;

        const typeName = r['식품유형'] || r['유형'] || '기타가공품';
        let type = appState.types.find(t => t.name === typeName);
        if (!type) {
          if (supabaseClient && isCloudConnected) {
            const { data: newType } = await supabaseClient.from('quality_types').insert([{
              name: typeName,
              interval_months: Number(r['검사주기'] || 2)
            }]).select();
            if (newType && newType.length > 0) type = { id: newType[0].id, name: typeName, intervalMonths: newType[0].interval_months };
          } else {
            const newTypeId = appState.types.length ? Math.max(...appState.types.map(t => t.id)) + 1 : 1;
            type = { id: newTypeId, name: typeName, intervalMonths: Number(r['검사주기'] || 2), testItems: '' };
            appState.types.push(type);
          }
        }

        const lastDate = r['최근제조일'] || r['제조일'] || r['검사일'] || getTodayKstStr();
        const intervalMonths = Number(r['검사주기(개월)'] || r['검사주기'] || type?.intervalMonths || 2);
        const memo = r['비고'] || r['메모'] || '';

        if (supabaseClient && isCloudConnected) {
          await supabaseClient.from('quality_products').insert([{
            name,
            type_id: type ? type.id : null,
            interval_months: intervalMonths,
            last_manufacture_date: String(lastDate).slice(0, 10),
            memo,
            production_status: 'active',
            alert_status: 'active'
          }]);
        } else {
          const newId = appState.products.length ? Math.max(...appState.products.map(p => p.id)) + 1 : 1;
          appState.products.push({
            id: newId,
            name,
            typeId: type ? type.id : 1,
            intervalMonths,
            lastManufactureDate: String(lastDate).slice(0, 10),
            memo,
            productionStatus: 'active',
            alertStatus: 'active'
          });
        }
        addedCount++;
      }

      showToast(`${addedCount}개 제품이 엑셀에서 등록되었습니다.`, 'success');
      if (supabaseClient && isCloudConnected) await loadCloudState();
      else { saveLocalState(); renderCurrentTab(); }
    } catch (err) {
      console.error(err);
      showToast('엑셀 파일을 읽는 중 오류가 발생했습니다.', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

function normalizeHealthExcelDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);

  const serial = typeof value === 'number' ? value : (/^\d+(?:\.\d+)?$/.test(String(value).trim()) ? Number(value) : null);
  if (serial !== null && serial > 20000 && serial < 80000 && window.XLSX?.SSF) {
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }

  const text = String(value).trim().replace(/\./g, '-').replace(/\//g, '-').replace(/\s+/g, '');
  const match = text.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  const first = match[1];
  const second = match[2];
  const third = match[3];
  // 첨부 양식처럼 2자리 연도가 마지막에 있으면 월/일/연도로 처리합니다.
  const usesMonthDayYear = first.length <= 2 && third.length <= 2;
  let year = Number(usesMonthDayYear ? third : first);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const month = Number(usesMonthDayYear ? first : second);
  const day = Number(usesMonthDayYear ? second : third);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addOneYear(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year + 1, month - 1, day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeHealthExcelHeader(value) {
  return String(value || '').replace(/\s+/g, '').replace(/[()]/g, '').trim();
}

function parseHealthExcelWorkbook(workbook) {
  const records = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    let headers = null;
    let departmentGroup = '';

    rows.forEach(row => {
      const values = row.map(value => String(value ?? '').trim());
      const normalized = values.map(normalizeHealthExcelHeader);
      const nameColumn = normalized.findIndex(value => value === '이름' || value === '성명' || value === '담당자명');
      const issuedColumn = normalized.findIndex(value => value === '검진일' || value === '발급일자' || value === '발급일');
      const expiryColumn = normalized.findIndex(value => value === '검진예정일' || value === '만료일자' || value === '만료일');

      if (nameColumn >= 0 && issuedColumn >= 0) {
        headers = { nameColumn, issuedColumn, expiryColumn, departmentColumn: normalized.findIndex(value => value.includes('부서') || value.includes('직위')), resultColumn: normalized.findIndex(value => value === '결과' || value === '판정') };
        return;
      }

      const filled = values.filter(Boolean);
      const isTemplateGuideText = /^(보건증|작성|현재\s*날짜\s*기준|아래\s*열\s*제목|이름·검진일|필수|주의)/.test(filled[0] || '');
      if (filled.length === 1 && !headers && !isTemplateGuideText) {
        departmentGroup = filled[0];
        return;
      }
      if (filled.length === 1 && headers && /생산부서|관리부|연구소|사무/.test(filled[0])) {
        departmentGroup = filled[0];
        return;
      }
      if (!headers) return;

      const employeeName = values[headers.nameColumn] || '';
      const issuedAt = normalizeHealthExcelDate(values[headers.issuedColumn]);
      if (!employeeName || !issuedAt || employeeName === '이름') return;
      const plannedDate = headers.expiryColumn >= 0 ? normalizeHealthExcelDate(values[headers.expiryColumn]) : '';
      const departmentValue = headers.departmentColumn >= 0 ? values[headers.departmentColumn] : '';
      const department = [departmentGroup, departmentValue].filter((value, index, list) => value && list.indexOf(value) === index).join(' / ');
      const result = headers.resultColumn >= 0 ? values[headers.resultColumn] : '';
      records.push({
        employeeName,
        department,
        issuedAt,
        expiresAt: plannedDate || addOneYear(issuedAt),
        memo: result ? `엑셀 일괄등록 · 판정: ${result}` : '엑셀 일괄등록'
      });
    });
  }
  return records;
}

function normalizeHealthExcelText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getHealthExcelNameKey(value) {
  return normalizeHealthExcelText(value).toLocaleLowerCase('ko-KR');
}

function getHealthExcelRecordSignature(record) {
  return [
    getHealthExcelNameKey(record.employeeName),
    normalizeHealthExcelText(record.department),
    String(record.issuedAt || ''),
    String(record.expiresAt || ''),
    normalizeHealthExcelText(record.memo)
  ].join('\u0001');
}

function pickPreferredHealthExcelRecord(current, candidate) {
  const useCandidate = String(candidate.expiresAt || '') > String(current.expiresAt || '')
    || (String(candidate.expiresAt || '') === String(current.expiresAt || '')
      && String(candidate.issuedAt || '') >= String(current.issuedAt || ''));
  const preferred = useCandidate ? candidate : current;
  const fallback = useCandidate ? current : candidate;
  return {
    ...preferred,
    employeeName: normalizeHealthExcelText(preferred.employeeName),
    department: normalizeHealthExcelText(preferred.department) || normalizeHealthExcelText(fallback.department),
    memo: normalizeHealthExcelText(preferred.memo) || normalizeHealthExcelText(fallback.memo)
  };
}

function consolidateHealthExcelRecords(records) {
  const exactSignatures = new Set();
  const byName = new Map();
  let duplicateRows = 0;
  let mergedNames = 0;

  records.forEach(record => {
    const normalizedRecord = {
      ...record,
      employeeName: normalizeHealthExcelText(record.employeeName),
      department: normalizeHealthExcelText(record.department),
      memo: normalizeHealthExcelText(record.memo)
    };
    const signature = getHealthExcelRecordSignature(normalizedRecord);
    if (exactSignatures.has(signature)) {
      duplicateRows += 1;
      return;
    }
    exactSignatures.add(signature);

    const nameKey = getHealthExcelNameKey(normalizedRecord.employeeName);
    const previous = byName.get(nameKey);
    if (previous) {
      mergedNames += 1;
      byName.set(nameKey, pickPreferredHealthExcelRecord(previous, normalizedRecord));
      return;
    }
    byName.set(nameKey, normalizedRecord);
  });

  return { records: [...byName.values()], duplicateRows, mergedNames };
}

function formatHealthDepartmentRole(department) {
  const value = normalizeHealthExcelText(department);
  return `부서/직책: ${value || '미지정'}`;
}

function waitForHealthCloudRetry(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isTransientHealthCloudError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return error instanceof TypeError || /failed to fetch|network|timeout|temporar|connection/.test(message);
}

async function runHealthCloudRequest(request, label) {
  let lastError;
  // 모바일·PWA 환경의 일시적 연결 끊김을 고려해 충분한 간격으로 재시도합니다.
  const retryDelays = [700, 1500, 3000, 5000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const response = await request();
      if (response?.error) throw response.error;
      return response;
    } catch (error) {
      lastError = error;
      if (!isTransientHealthCloudError(error) || attempt === retryDelays.length) break;
      await waitForHealthCloudRetry(retryDelays[attempt]);
    }
  }
  throw new Error(`${label} 저장에 실패했습니다. ${lastError?.message || '네트워크 연결을 확인한 뒤 다시 시도하세요.'}`);
}

function hasHealthExcelRecordChanges(existing, incoming) {
  if (!existing) return true;
  return [
    [existing.department, incoming.department],
    [existing.issuedAt, incoming.issuedAt],
    [existing.expiresAt, incoming.expiresAt],
    [existing.memo, incoming.memo]
  ].some(([before, after]) => String(before || '').trim() !== String(after || '').trim());
}

async function handleHealthExcelImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  let added = 0;
  let updated = 0;
  try {
    const fileData = await file.arrayBuffer();
    const workbook = XLSX.read(fileData, { type: 'array', cellDates: true });
    const parsedRecords = parseHealthExcelWorkbook(workbook);
    if (parsedRecords.length === 0) throw new Error('이름과 검진일 열을 찾지 못했습니다.');

    const { records, duplicateRows, mergedNames } = consolidateHealthExcelRecords(parsedRecords);
    if (records.length === 0) throw new Error('중복을 제외한 유효 보건증 정보가 없습니다.');

    const existingByName = new Map(appState.healthCerts.map(c => [getHealthExcelNameKey(c.employeeName), c]));
    const updateCount = records.filter(record => existingByName.has(getHealthExcelNameKey(record.employeeName))).length;
    const summary = [
      `원본 ${parsedRecords.length}행 → 유효 ${records.length}명`,
      duplicateRows ? `파일 내 동일 데이터 ${duplicateRows}행 제외` : '',
      mergedNames ? `같은 이름의 다른 일정 ${mergedNames}건 통합(만료일·발급일 최신값 적용)` : ''
    ].filter(Boolean).join('\n');
    const message = `${summary}\n\n신규 ${records.length - updateCount}명 등록, 기존 ${updateCount}명은 발급일·만료일·부서를 갱신합니다.\n첨부 파일과 알림·재직 상태는 기존 값이 유지됩니다.\n\n동명이인은 동일 직원으로 처리되므로, 다른 사람이라면 이름을 구분해 다시 업로드하세요.\n계속하시겠습니까?`;
    if (!confirm(message)) return;

    const cloudMode = Boolean(supabaseClient && isCloudConnected);
    if (cloudMode) {
      const newRecords = records.filter(record => !existingByName.has(getHealthExcelNameKey(record.employeeName)));
      // 이미 동일한 일정이 저장된 대상은 UPDATE 요청을 보내지 않습니다.
      // 중간 연결 장애로 전체 일괄 등록이 멈추는 문제를 피하고 재등록도 안전해집니다.
      const existingRecords = records.filter(record => {
        const existing = existingByName.get(getHealthExcelNameKey(record.employeeName));
        return existing && hasHealthExcelRecordChanges(existing, record);
      });

      // 신규 행은 한 번에 저장해 네트워크 요청 수와 실패 가능성을 낮춥니다.
      if (newRecords.length > 0) {
        await runHealthCloudRequest(
          () => supabaseClient.from('quality_health_certs').insert(newRecords.map(record => ({
            employee_name: record.employeeName,
            department: record.department,
            issued_at: record.issuedAt,
            expires_at: record.expiresAt,
            memo: record.memo,
            warning_days: appState.settings.healthWarningDays || 30,
            file_url: '',
            file_name: '',
            employment_status: 'active',
            alert_status: 'active'
          }))),
          '신규 보건증 일괄'
        );
        added = newRecords.length;
      }

      // 기존 대상도 단일 요청으로 갱신합니다. 파일·알림·재직 상태는 보내지 않아 기존 값을 보존합니다.
      if (existingRecords.length > 0) {
        const changedRows = existingRecords.map(record => {
          const existing = existingByName.get(getHealthExcelNameKey(record.employeeName));
          return {
            id: existing.id,
            employee_name: record.employeeName,
            department: record.department,
            issued_at: record.issuedAt,
            expires_at: record.expiresAt,
            memo: record.memo
          };
        });
        await runHealthCloudRequest(
          () => supabaseClient.from('quality_health_certs').upsert(changedRows, { onConflict: 'id' }),
          '기존 보건증 일괄'
        );
        updated = existingRecords.length;
      }

      await loadCloudState();
    } else {
      for (const record of records) {
        const existing = existingByName.get(record.employeeName);
        if (existing) {
          existing.department = record.department;
          existing.issuedAt = record.issuedAt;
          existing.expiresAt = record.expiresAt;
          existing.memo = record.memo;
          updated += 1;
        } else {
          const nextId = appState.healthCerts.length ? Math.max(...appState.healthCerts.map(c => Number(c.id) || 0)) + 1 : 1;
          appState.healthCerts.push({
            id: nextId,
            ...record,
            warningDays: appState.settings.healthWarningDays || 30,
            fileUrl: '',
            fileName: '',
            hasFile: false,
            employmentStatus: 'active',
            alertStatus: 'active'
          });
          added += 1;
        }
      }
      appState.healthCerts.sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName), 'ko'));
      saveLocalState();
      renderCurrentTab();
    }

    const unchanged = records.length - added - updated;
    const duplicateSummary = [
      duplicateRows ? `파일 중복 ${duplicateRows}행 제외` : '',
      mergedNames ? `동일 이름 ${mergedNames}건 통합` : ''
    ].filter(Boolean).join(' · ');
    showToast(`보건증 엑셀 등록 완료: 신규 ${added}명 · 갱신 ${updated}명${unchanged ? ` · 기존 동일 ${unchanged}명` : ''}${duplicateSummary ? ` · ${duplicateSummary}` : ''}`, 'success');
  } catch (error) {
    console.error('보건증 엑셀 등록 실패:', error);
    const detail = error?.message || '파일 형식 또는 네트워크 연결을 확인하세요.';
    const resumeHint = added || updated ? ' 이미 저장된 항목은 유지되며, 같은 파일을 다시 올리면 중복 없이 이어서 처리됩니다.' : '';
    showToast(`보건증 엑셀 등록에 실패했습니다: ${detail}${resumeHint}`, 'error');
  } finally {
    event.target.value = '';
  }
}

async function updateHealthManagementState(id, changes) {
  const certificate = appState.healthCerts.find(c => Number(c.id) === Number(id));
  const certificateId = Number(id);
  if (!certificate || healthManagementPendingIds.has(certificateId)) return false;

  healthManagementPendingIds.add(certificateId);
  renderHealthCerts();
  try {
    if (supabaseClient && isCloudConnected) {
      const response = await runHealthCloudRequest(
        () => supabaseClient.from('quality_health_certs').update(changes).eq('id', certificateId).select().single(),
        '보건증 관리 상태'
      );
      if (!response.data) throw new Error('변경 결과를 확인하지 못했습니다.');
      const saved = mapHealthCertificateRow(response.data);
      const index = appState.healthCerts.findIndex(c => Number(c.id) === Number(saved.id));
      if (index >= 0) appState.healthCerts.splice(index, 1, saved);
    } else {
      if (Object.prototype.hasOwnProperty.call(changes, 'alert_status')) certificate.alertStatus = changes.alert_status;
      if (Object.prototype.hasOwnProperty.call(changes, 'employment_status')) certificate.employmentStatus = changes.employment_status;
    }
    saveLocalState();
    return true;
  } finally {
    healthManagementPendingIds.delete(certificateId);
    renderCurrentTab();
  }
}

async function toggleHealthAlertStatus(id) {
  const certificate = appState.healthCerts.find(c => Number(c.id) === Number(id));
  if (!certificate) return;
  try {
    const alertStatus = certificate.alertStatus === 'paused' ? 'active' : 'paused';
    const saved = await updateHealthManagementState(id, { alert_status: alertStatus });
    if (!saved) return;
    showToast(alertStatus === 'paused' ? '이 대상자의 만료 알림을 일시중지했습니다.' : '이 대상자의 만료 알림을 다시 켰습니다.', 'success');
  } catch (error) {
    showToast(`알림 상태 변경에 실패했습니다: ${error?.message || ''}`, 'error');
  }
}

async function toggleHealthEmploymentStatus(id) {
  const certificate = appState.healthCerts.find(c => Number(c.id) === Number(id));
  if (!certificate) return;
  try {
    const employmentStatus = certificate.employmentStatus === 'inactive' ? 'active' : 'inactive';
    const changes = employmentStatus === 'inactive'
      ? { employment_status: 'inactive', alert_status: 'paused' }
      : { employment_status: 'active' };
    const saved = await updateHealthManagementState(id, changes);
    if (!saved) return;
    showToast(employmentStatus === 'inactive'
      ? '퇴직·제외 처리했습니다. 만료 알림도 함께 중지됐습니다.'
      : '재직 대상으로 복원했습니다. 필요하면 종 아이콘으로 알림을 다시 켜세요.', 'success');
  } catch (error) {
    showToast(`재직 상태 변경에 실패했습니다: ${error?.message || ''}`, 'error');
  }
}

function exportJSONBackup() {
  // Bot Token과 Chat ID는 백업 파일에 포함하지 않습니다. 현재 브라우저의 고정 저장값은 유지됩니다.
  const backupData = JSON.parse(JSON.stringify(appState));
  backupData.settings = {
    ...(backupData.settings || {}),
    telegramBotToken: '',
    telegramChatId: ''
  };
  const dataStr = JSON.stringify(backupData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `코엔에프_품질검사백업_${getTodayKstStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('백업 파일이 저장되었습니다.', 'success');
}

function handleRestoreJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed.products || !parsed.types) throw new Error('유효하지 않은 백업 파일 형식');
      if (!confirm('백업 데이터로 복원하시겠습니까? 현재 데이터가 대체됩니다.')) return;
      appState = parsed;
      migrateTelegramSettingsToPinned();
      saveLocalState();
      showToast('백업 데이터가 성공적으로 복원되었습니다. 텔레그램 설정은 그대로 유지됩니다.', 'success');
      switchTab('dashboard');
    } catch (err) {
      showToast('백업 파일을 복원하지 못했습니다: 올바른 JSON 파일이 아닙니다.', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function loadSampleData(confirmUser) {
  if (confirmUser && !confirm('기본 샘플 데이터를 불러오시겠습니까?')) return;
  appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
  applyPinnedTelegramSettings();
  saveLocalState();
  showToast('기본 샘플 데이터가 로드되었습니다. 텔레그램 설정은 유지됩니다.', 'success');
  switchTab('dashboard');
}

function resetAllData() {
  if (!confirm('경고: 모든 제품, 검사 이력, 보건증 데이터가 삭제됩니다. 계속하시겠습니까?')) return;
  appState = { types: [], products: [], history: [], healthCerts: [], certificates: [], settings: { ...DEFAULT_DATA.settings } };
  applyPinnedTelegramSettings();
  saveLocalState();
  showToast('업무 데이터가 초기화되었습니다. 텔레그램 설정은 유지됩니다.', 'info');
  switchTab('dashboard');
}

// Telegram
let telegramGroupCandidates = [];

function setTelegramGroupLookupState(message, type = 'info') {
  const panel = document.getElementById('telegram-group-lookup-panel');
  const status = document.getElementById('telegram-group-lookup-status');
  const candidates = document.getElementById('telegram-group-candidates');
  if (!panel || !status || !candidates) return;
  const colors = {
    info: 'text-slate-700 dark:text-slate-200',
    success: 'text-emerald-700 dark:text-emerald-300',
    error: 'text-red-600 dark:text-red-300'
  };
  panel.classList.remove('hidden');
  status.className = `text-xs font-semibold ${colors[type] || colors.info}`;
  status.textContent = message;
}

function extractTelegramGroupCandidates(updates) {
  const latestByChatId = new Map();
  for (const update of updates || []) {
    const content = update.message || update.edited_message || update.channel_post || update.edited_channel_post || update.my_chat_member || update.chat_member;
    const chat = content?.chat;
    if (!chat || !['group', 'supergroup'].includes(chat.type)) continue;
    const timestamp = Number(content?.date || update.update_id || 0);
    const candidate = {
      id: String(chat.id),
      title: chat.title || '이름 없는 텔레그램 그룹',
      type: chat.type,
      timestamp
    };
    const existing = latestByChatId.get(candidate.id);
    if (!existing || candidate.timestamp > existing.timestamp) latestByChatId.set(candidate.id, candidate);
  }
  return Array.from(latestByChatId.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function renderTelegramGroupCandidates() {
  const container = document.getElementById('telegram-group-candidates');
  if (!container) return;
  container.innerHTML = telegramGroupCandidates.map((group, index) => `
    <button type="button" onclick="applyTelegramGroupChatId(${index})" class="telegram-group-candidate">
      <span class="telegram-group-candidate-icon"><i data-lucide="users-round" class="w-4 h-4"></i></span>
      <span class="min-w-0 flex-1 text-left">
        <span class="telegram-group-candidate-title">${escapeHtml(group.title)}</span>
        <span class="telegram-group-candidate-id">${escapeHtml(group.id)}</span>
      </span>
      <i data-lucide="chevron-right" class="w-4 h-4 shrink-0 text-violet-500"></i>
    </button>
  `).join('');
  lucide.createIcons();
}

async function findTelegramGroupChatIds() {
  const tokenInput = document.getElementById('setting-tg-token');
  const button = document.getElementById('btn-find-telegram-groups');
  const token = tokenInput?.value.trim() || appState.settings.telegramBotToken;
  if (!token) {
    setTelegramGroupLookupState('먼저 Telegram Bot Token을 입력하세요.', 'error');
    showToast('그룹을 찾으려면 Telegram Bot Token이 필요합니다.', 'error');
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.classList.add('opacity-60', 'cursor-wait');
    }
    setTelegramGroupLookupState('최근 텔레그램 그룹 기록을 찾는 중입니다...', 'info');
    document.getElementById('telegram-group-candidates').innerHTML = '';

    const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100&timeout=0`);
    const result = await response.json();
    if (!result.ok) throw new Error(result.description || '텔레그램 업데이트 조회 실패');

    telegramGroupCandidates = extractTelegramGroupCandidates(result.result);
    if (!telegramGroupCandidates.length) {
      setTelegramGroupLookupState('최근 기록에서 그룹을 찾지 못했습니다. 그룹에서 /start를 한 번 보낸 뒤 다시 찾으세요.', 'error');
      return;
    }

    setTelegramGroupLookupState(`${telegramGroupCandidates.length}개 그룹을 찾았습니다. 알림을 받을 그룹을 선택하세요.`, 'success');
    renderTelegramGroupCandidates();
  } catch (error) {
    console.error('텔레그램 그룹 Chat ID 조회 실패:', error);
    setTelegramGroupLookupState(`그룹을 찾지 못했습니다: ${error.message || 'Bot Token을 확인하세요.'}`, 'error');
    showToast('그룹 Chat ID 자동 찾기에 실패했습니다. Bot Token을 확인하세요.', 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('opacity-60', 'cursor-wait');
    }
  }
}

function applyTelegramGroupChatId(index) {
  const group = telegramGroupCandidates[index];
  const token = document.getElementById('setting-tg-token')?.value.trim() || appState.settings.telegramBotToken;
  const chatIdInput = document.getElementById('setting-tg-chatid');
  if (!group || !token || !chatIdInput) return;

  chatIdInput.value = group.id;
  appState.settings.telegramBotToken = token;
  appState.settings.telegramChatId = group.id;
  pinTelegramSettings({ telegramBotToken: token, telegramChatId: group.id });
  saveLocalState();
  updateTelegramSettingsStatus();
  setTelegramGroupLookupState(`“${group.title}” 그룹 Chat ID를 적용했습니다. 아래 시험 알림으로 확인하세요.`, 'success');
  showToast(`“${group.title}” 그룹으로 알림 대상을 변경했습니다.`, 'success');
}

function saveTelegramSettings() {
  const token = document.getElementById('setting-tg-token').value.trim();
  const chatId = document.getElementById('setting-tg-chatid').value.trim();
  if (!token || !chatId) {
    showToast('Bot Token과 Chat ID를 모두 입력하세요.', 'error');
    return;
  }
  const pinned = pinTelegramSettings({ telegramBotToken: token, telegramChatId: chatId });
  appState.settings.telegramBotToken = pinned.telegramBotToken;
  appState.settings.telegramChatId = pinned.telegramChatId;
  saveLocalState();
  updateTelegramSettingsStatus();
  showToast('텔레그램 설정이 고정 저장되었습니다. 새로고침·업무 데이터 초기화 후에도 유지됩니다.', 'success');
}

function clearTelegramSettings() {
  if (!confirm('이 기기에 고정 저장된 Telegram Bot Token과 Chat ID를 삭제하시겠습니까? 클라우드 동기화본은 삭제되지 않습니다.')) return;
  localStorage.removeItem(TELEGRAM_SETTINGS_KEY);
  appState.settings.telegramBotToken = '';
  appState.settings.telegramChatId = '';
  saveLocalState();
  renderSettings();
  showToast('이 기기의 텔레그램 설정을 삭제했습니다. 클라우드 동기화본은 유지됩니다.', 'info');
}

async function syncTelegramSettingsToCloud() {
  const token = appState.settings.telegramBotToken;
  const chatId = appState.settings.telegramChatId;
  const passphrase = getTelegramSyncPassphrase();
  if (!token || !chatId) {
    showToast('먼저 Bot Token과 Chat ID를 이 기기에 저장하세요.', 'error');
    return;
  }
  if (passphrase.length < 8) {
    showToast('동기화 암호는 8자 이상으로 입력하세요.', 'error');
    return;
  }
  try {
    updateTelegramCloudStatus('암호화하여 클라우드에 저장하는 중...', 'info');
    const payload = {
      telegramBotToken: token,
      telegramChatId: chatId,
      savedAt: new Date().toISOString()
    };
    const encryptedValue = await encryptTelegramCloudPayload(payload, passphrase);
    await saveTelegramCloudRecord(encryptedValue);
    updateTelegramCloudStatus(`클라우드 동기화 완료 · ${new Date(payload.savedAt).toLocaleString('ko-KR')}`, 'success');
    showToast('텔레그램 설정을 암호화해 클라우드에 동기화했습니다.', 'success');
  } catch (error) {
    console.error('텔레그램 클라우드 동기화 실패:', error);
    updateTelegramCloudStatus('클라우드 동기화에 실패했습니다. 암호와 연결 상태를 확인하세요.', 'error');
    showToast(`클라우드 저장 실패: ${error.message || '연결 상태를 확인하세요.'}`, 'error');
  }
}

async function importTelegramSettingsFromCloud() {
  const passphrase = getTelegramSyncPassphrase();
  if (passphrase.length < 8) {
    showToast('동기화 암호를 8자 이상 입력하세요.', 'error');
    return;
  }
  try {
    updateTelegramCloudStatus('암호화된 설정을 불러오는 중...', 'info');
    const record = await getTelegramCloudRecord();
    if (!record?.value) {
      updateTelegramCloudStatus('클라우드에 저장된 텔레그램 설정이 없습니다.', 'info');
      showToast('클라우드에 저장된 텔레그램 설정이 없습니다.', 'info');
      return;
    }
    const payload = await decryptTelegramCloudPayload(record.value, passphrase);
    if ((appState.settings.telegramBotToken || appState.settings.telegramChatId) && !confirm('이 기기의 텔레그램 설정을 클라우드 설정으로 바꾸시겠습니까?')) {
      updateTelegramCloudStatus('클라우드 설정 불러오기를 취소했습니다.', 'info');
      return;
    }
    appState.settings.telegramBotToken = payload.telegramBotToken;
    appState.settings.telegramChatId = payload.telegramChatId;
    pinTelegramSettings(payload);
    saveLocalState();
    renderSettings();
    updateTelegramCloudStatus(`클라우드 설정 불러오기 완료 · ${new Date(payload.savedAt).toLocaleString('ko-KR')}`, 'success');
    showToast('클라우드 텔레그램 설정을 이 기기에 적용했습니다.', 'success');
  } catch (error) {
    console.error('텔레그램 클라우드 설정 불러오기 실패:', error);
    updateTelegramCloudStatus('불러오기에 실패했습니다. 동기화 암호를 확인하세요.', 'error');
    showToast('클라우드 설정을 불러오지 못했습니다. 동기화 암호를 확인하세요.', 'error');
  }
}

function toggleTelegramTokenVisibility() {
  const input = document.getElementById('setting-tg-token');
  const button = document.getElementById('toggle-tg-token-visibility');
  if (!input || !button) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  button.setAttribute('aria-label', isHidden ? 'Bot Token 숨기기' : 'Bot Token 보기');
  button.innerHTML = `<i data-lucide="${isHidden ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>`;
  lucide.createIcons();
}

async function saveHealthAlertDaysToCloud(value) {
  if (!supabaseClient || !isCloudConnected) return;
  const { error } = await supabaseClient
    .from('quality_settings')
    .upsert([{ key: HEALTH_ALERT_DAYS_KEY, value }], { onConflict: 'key' });
  if (error) throw error;
}

async function saveNotificationDays() {
  const wDays = Number(document.getElementById('setting-warning-days').value) || 14;
  const healthAlertDays = normalizeHealthAlertDays(document.getElementById('setting-health-alert-days').value);
  const healthAlertDaysValue = healthAlertDays.join(',');
  appState.settings.warningDays = wDays;
  appState.settings.healthAlertDays = healthAlertDaysValue;
  appState.settings.healthWarningDays = Math.max(...healthAlertDays);
  saveLocalState();
  try {
    await saveHealthAlertDaysToCloud(healthAlertDaysValue);
    showToast(`보건증 알림 구간(${getHealthAlertDaysLabel()})이 저장되었습니다.`, 'success');
  } catch (error) {
    console.error('보건증 알림 구간 클라우드 저장 실패:', error);
    showToast('이 기기에는 저장됐지만 클라우드 동기화에 실패했습니다. 다시 저장해 주세요.', 'error');
  }
  renderSettings();
  renderHealthCerts();
}

async function testTelegramNotification() {
  const token = appState.settings.telegramBotToken;
  const chatId = appState.settings.telegramChatId;

  if (!token || !chatId) {
    showToast('텔레그램 Bot Token과 Chat ID를 먼저 입력하고 저장하세요.', 'error');
    return;
  }

  const computedProducts = appState.products.map(getProductComputed);
  const overdueCount = computedProducts.filter(p => p.status === 'overdue').length;
  const urgentCount = computedProducts.filter(p => p.status === 'urgent').length;
  const healthAlertDays = getHealthAlertDays();
  const healthDue = appState.healthCerts
    .map(getHealthCertComputed)
    .filter(c => c.employmentStatus !== 'inactive' && c.alertStatus !== 'paused' && isHealthAlertDue(c.dDay))
    .sort((a, b) => a.dDay - b.dDay);
  const healthLines = healthDue.length
    ? healthDue.map((c, index) => `${index + 1}. ${c.employeeName}\n   ${formatHealthDepartmentRole(c.department)} · ${c.dDay < 0 ? `${Math.abs(c.dDay)}일 초과` : `D-${c.dDay}`} · 만료 ${c.expiresAt}`).join('\n')
    : '대상 없음';

  const msgText = `🧪 [코엔에프 품질·보건증 시험 알림]\n` +
    `📅 기준일시: ${new Date().toLocaleString('ko-KR')}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🚨 기간 초과 품목: ${overdueCount}건\n` +
    `⚠️ 14일 내 검사 마감: ${urgentCount}건\n` +
    `👤 보건증 만료 알림 (${healthAlertDays.map(day => `D-${day}`).join(' · ')}): ${healthDue.length}명\n` +
    `${healthLines}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `✅ 시스템 시험 알림입니다. 실제 예약 알림은 매일 오전 9시에 발송됩니다.`;

  try {
    showToast('텔레그램으로 보건증 포함 시험 알림을 전송하는 중...', 'info');
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msgText })
    });
    const result = await resp.json();
    if (result.ok) {
      showToast(`텔레그램 시험 알림이 정상 발송되었습니다. 보건증 대상 ${healthDue.length}명을 포함했습니다.`, 'success');
    } else {
      showToast(`전송 실패: ${result.description || 'Bot Token 또는 Chat ID 확인 필요'}`, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('텔레그램 API 요청 실패: 인터넷 연결 상태를 확인하세요.', 'error');
  }
}

// PWA 설치 및 전체 화면 실행
let deferredPwaInstallPrompt = null;

function isPwaStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updatePwaInstallButton() {
  const button = document.getElementById('pwa-install-button');
  if (!button) return;
  if (isPwaStandalone()) {
    button.classList.add('hidden');
    return;
  }
  if (deferredPwaInstallPrompt) button.classList.remove('hidden');
}

async function installPwaApp() {
  if (isPwaStandalone()) {
    showToast('이미 전체 화면 앱으로 실행 중입니다.', 'success');
    return;
  }

  if (deferredPwaInstallPrompt) {
    deferredPwaInstallPrompt.prompt();
    const choice = await deferredPwaInstallPrompt.userChoice;
    deferredPwaInstallPrompt = null;
    updatePwaInstallButton();
    if (choice.outcome === 'accepted') {
      showToast('홈 화면에 설치하는 중입니다.', 'success');
    } else {
      showToast('앱 설치를 취소했습니다.', 'info');
    }
    return;
  }

  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isAppleMobile) {
    showToast('Safari의 공유 버튼 → ‘홈 화면에 추가’를 선택하세요.', 'info');
  } else {
    showToast('브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요.', 'info');
  }
}

function registerPwa() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=202608311130', { scope: './' })
      .then(() => console.info('PWA 서비스 워커가 등록되었습니다.'))
      .catch(error => console.warn('PWA 서비스 워커 등록 실패:', error));
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPwaInstallPrompt = event;
    updatePwaInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredPwaInstallPrompt = null;
    updatePwaInstallButton();
    showToast('코엔에프 품질 스케줄러가 홈 화면에 설치되었습니다.', 'success');
  });
}

// Utility Helpers
function triggerPrint() {
  window.print();
}

function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.classList.toggle('dark');
  localStorage.setItem('koenf_theme', isDark ? 'dark' : 'light');
  document.getElementById('theme-icon')?.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
  lucide.createIcons();
}

function initTheme() {
  const saved = localStorage.getItem('koenf_theme') || 'light';
  if (saved === 'dark') {
    document.documentElement.classList.add('dark');
    document.getElementById('theme-icon')?.setAttribute('data-lucide', 'sun');
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white border-emerald-500',
    error: 'bg-red-600 text-white border-red-500',
    info: 'bg-slate-800 text-white border-slate-700'
  };
  const icons = {
    success: 'check-circle-2',
    error: 'alert-circle',
    info: 'info'
  };

  toast.className = `toast pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-xs font-semibold ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i data-lucide="${icons[type] || 'info'}" class="w-4 h-4 shrink-0"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'opacity 0.2s, transform 0.2s';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initial Boot
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  registerPwa();
  updatePwaInstallButton();
  await loadCloudState(false);
  initRealtimeSubscription();
  openRequestedRoute();
});

window.addEventListener('hashchange', openRequestedRoute);
