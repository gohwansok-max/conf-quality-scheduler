/**
 * (?)???? ?????? ???? - ?? ????? ????
 * Pure Vanilla JavaScript Single Page Application
 */

// ==================== 1. IndexedDB File Engine ====================
const DB_NAME = 'KoenfQualityDB';
const DB_VERSION = 1;
const STORE_FILES = 'files';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveFileToDB(id, fileObj) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const req = store.put({ id, file: fileObj, name: fileObj.name, type: fileObj.type, size: fileObj.size, savedAt: new Date().toISOString() });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('IndexedDB save error:', e);
    return false;
  }
}

async function getFileFromDB(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      const store = tx.objectStore(STORE_FILES);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.file : null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('IndexedDB get error:', e);
    return null;
  }
}

async function deleteFileFromDB(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readwrite');
      const store = tx.objectStore(STORE_FILES);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.error('IndexedDB delete error:', e);
    return false;
  }
}

// ==================== 2. State & Sample Data ====================
const STORAGE_KEY = 'koenf_quality_data_v2';

const DEFAULT_DATA = {
  types: [
    { id: 1, name: '???', intervalMonths: 2, testItems: '???, ????, ????, ???' },
    { id: 2, name: '?????', intervalMonths: 2, testItems: '???, ????, ???, ?' },
    { id: 3, name: '?????', intervalMonths: 3, testItems: '???, ????, ??' },
    { id: 4, name: '??????', intervalMonths: 3, testItems: '????, ???, ???' },
    { id: 5, name: '??????', intervalMonths: 2, testItems: '???, ????' },
    { id: 6, name: '????', intervalMonths: 2, testItems: '???, ????, ???' }
  ],
  products: [
    { id: 1, typeId: 1, name: '???? ?? ??? 30g', intervalMonths: 2, lastManufactureDate: '2026-06-25', memo: '?? ??? ?? ??', productionStatus: 'active', alertStatus: 'active' },
    { id: 2, typeId: 2, name: '???? ????? ??? 1kg', intervalMonths: 2, lastManufactureDate: '2026-06-10', memo: '?? ??? ??', productionStatus: 'active', alertStatus: 'active' },
    { id: 3, typeId: 3, name: '???? ??? ???? 500g', intervalMonths: 3, lastManufactureDate: '2026-07-01', memo: 'OEM ?? ??', productionStatus: 'active', alertStatus: 'active' },
    { id: 4, typeId: 4, name: '???? ???? ??? 2kg', intervalMonths: 3, lastManufactureDate: '2026-08-01', memo: '?? ?? 1??', productionStatus: 'active', alertStatus: 'active' },
    { id: 5, typeId: 1, name: '???? ??? ??? 1.2kg', intervalMonths: 2, lastManufactureDate: '2026-05-15', memo: '?? ?? ??? ?? ?? ??', productionStatus: 'stopped', stopReason: '?? ?? ??', alertStatus: 'active' },
    { id: 6, typeId: 2, name: '???? ??? ????? 1kg', intervalMonths: 2, lastManufactureDate: '2026-07-20', memo: '??? ?? ??', productionStatus: 'active', alertStatus: 'active' }
  ],
  history: [
    { id: 1, productId: 1, productName: '???? ?? ??? 30g', manufactureDate: '2026-06-25', previousDate: '2026-04-20', memo: '?? ?? ??', createdAt: '2026-06-25T09:00:00Z' },
    { id: 2, productId: 2, productName: '???? ????? ??? 1kg', manufactureDate: '2026-06-10', previousDate: '2026-04-10', memo: '?? ?? ??', createdAt: '2026-06-10T09:00:00Z' }
  ],
  healthCerts: [
    { id: 1, employeeName: '???', department: '?????', issuedAt: '2025-09-10', expiresAt: '2026-09-10', warningDays: 30, memo: '?? ?? ??', employmentStatus: 'active', alertStatus: 'active' },
    { id: 2, employeeName: '???', department: '??1?', issuedAt: '2025-08-15', expiresAt: '2026-08-15', warningDays: 30, memo: '?? ?? ??', employmentStatus: 'active', alertStatus: 'active' },
    { id: 3, employeeName: '???', department: '??2?', issuedAt: '2025-09-01', expiresAt: '2026-09-01', warningDays: 30, memo: '?? ?? ??', employmentStatus: 'active', alertStatus: 'active' },
    { id: 4, employeeName: '???', department: '???', issuedAt: '2026-03-20', expiresAt: '2027-03-20', warningDays: 30, memo: '??? ???', employmentStatus: 'active', alertStatus: 'active' }
  ],
  certificates: [
    { id: 1, certNumber: 'CONF-QC-2026-001', productId: 1, inspectionDate: '2026-06-25', fileName: '2026_06_???_?????.pdf', fileSize: 1048576, memo: '??????? (??)', createdAt: '2026-06-25T10:00:00Z' }
  ],
  settings: {
    warningDays: 14,
    healthWarningDays: 30,
    telegramBotToken: '',
    telegramChatId: '',
    certPrefix: 'CONF-QC',
    certSequence: 2
  }
};

let appState = null;
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      appState = JSON.parse(raw);
      if (!appState.types || !appState.products) appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
    } else {
      appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
      saveState();
    }
  } catch (e) {
    appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
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
  if (dDay < 0) return `${Math.abs(dDay)}? ??`;
  if (dDay === 0) return '?? ??';
  return `D-${dDay}`;
}

function getProductComputed(p) {
  const type = appState.types.find(t => t.id === Number(p.typeId)) || { name: '???', intervalMonths: p.intervalMonths || 2 };
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
    else if (dDay <= (c.warningDays || appState.settings.healthWarningDays || 30)) status = 'urgent';
    else status = 'safe';
  }
  return { ...c, dDay, status };
}

const STATUS_CONFIG = {
  overdue: { label: '?? ??', class: 'badge-overdue', dotColor: 'bg-red-500' },
  urgent: { label: '?? ??', class: 'badge-urgent', dotColor: 'bg-amber-500' },
  safe: { label: '?? ??', class: 'badge-safe', dotColor: 'bg-emerald-500' },
  stopped: { label: '?? ??', class: 'badge-stopped', dotColor: 'bg-slate-400' },
  paused: { label: '?? ????', class: 'badge-paused', dotColor: 'bg-purple-500' },
  inactive: { label: '?? ??', class: 'badge-stopped', dotColor: 'bg-slate-400' }
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

// ==================== 4. UI Rendering ====================
let currentTab = 'dashboard';
let dashboardFilter = 'all';

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.toggle('hidden', view.id !== `view-${tabId}`);
  });

  if (tabId === 'dashboard') renderDashboard();
  else if (tabId === 'products') renderProducts();
  else if (tabId === 'types') renderTypes();
  else if (tabId === 'health') renderHealthCerts();
  else if (tabId === 'certs') renderCertificates();
  else if (tabId === 'settings') renderSettings();

  lucide.createIcons();
}

function setDashboardFilter(filter) {
  dashboardFilter = filter;
  const select = document.getElementById('dash-status-select');
  if (select) select.value = filter;
  renderDashboard();
}

function renderDashboard() {
  const tbody = document.getElementById('dashboard-table-body');
  if (!tbody) return;

  const searchKeyword = (document.getElementById('dash-search-input')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('dash-status-select')?.value || dashboardFilter || 'all';

  const computedProducts = appState.products.map(getProductComputed);
  const computedHealth = appState.healthCerts.map(getHealthCertComputed);

  // KPI Calculations
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

  // Urgent Banner
  const banner = document.getElementById('dashboard-urgent-banner');
  const bannerText = document.getElementById('urgent-banner-text');
  if (overdueCount > 0) {
    banner.classList.remove('hidden');
    bannerText.textContent = `?? ?? ?????? ??? ??? ??? ${overdueCount}? ????. ?? ?? ? ?? ??? ?????.`;
  } else if (urgentCount > 0) {
    banner.classList.remove('hidden');
    banner.className = 'rounded-xl p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200';
    bannerText.textContent = `14? ?? ?????? ?? ?? ??? ${urgentCount}? ????. ?? ??? ??? ?????.`;
  } else {
    banner.classList.add('hidden');
  }

  // Filter products
  let filtered = computedProducts.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (searchKeyword && !p.name.toLowerCase().includes(searchKeyword) && !p.typeName.toLowerCase().includes(searchKeyword)) return false;
    return true;
  });

  // Sort by priority (overdue -> urgent -> safe -> stopped -> paused)
  const sortPriority = { overdue: 1, urgent: 2, safe: 3, paused: 4, stopped: 5 };
  filtered.sort((a, b) => {
    const pDiff = (sortPriority[a.status] || 99) - (sortPriority[b.status] || 99);
    if (pDiff !== 0) return pDiff;
    return (a.dDay ?? 999) - (b.dDay ?? 999);
  });

  document.getElementById('dash-filtered-count').textContent = `${filtered.length}?`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">??? ?? ??? ????.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr class="table-row-hover transition">
      <td class="py-3 px-4">${renderStatusBadge(p.status, formatDDay(p.dDay))}</td>
      <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white">${escapeHtml(p.name)}</td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">${escapeHtml(p.typeName)}</span></td>
      <td class="py-3 px-4 font-medium">${p.intervalMonths}??</td>
      <td class="py-3 px-4 text-slate-500 dark:text-slate-400">${p.lastManufactureDate || '-'}</td>
      <td class="py-3 px-4 font-medium text-slate-900 dark:text-white">${p.nextDeadline || '-'}</td>
      <td class="py-3 px-4 text-center">
        <button onclick="openQuickRenewModal(${p.id})" class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition shadow-sm">
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          <span>????</span>
        </button>
      </td>
      <td class="py-3 px-4 text-right action-column">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="viewHistory(${p.id})" class="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="?? ??">
            <i data-lucide="history" class="w-4 h-4"></i>
          </button>
          <button onclick="openEditProductModal(${p.id})" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="??">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function renderProducts() {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  const computedProducts = appState.products.map(getProductComputed);
  if (computedProducts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">??? ??? ????. ? ??? ?????.</td></tr>`;
    return;
  }

  tbody.innerHTML = computedProducts.map(p => `
    <tr class="table-row-hover transition">
      <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white">${escapeHtml(p.name)}</td>
      <td class="py-3 px-4"><span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${escapeHtml(p.typeName)}</span></td>
      <td class="py-3 px-4">${p.intervalMonths}??</td>
      <td class="py-3 px-4">${p.lastManufactureDate || '-'}</td>
      <td class="py-3 px-4 font-medium">${p.nextDeadline || '-'}</td>
      <td class="py-3 px-4">
        ${p.productionStatus === 'stopped' 
          ? `<button onclick="openStopStatusModal(${p.id}, 'resume')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:border-emerald-500"><span>????</span><i data-lucide="play" class="w-3 h-3 text-emerald-600"></i></button>`
          : `<button onclick="openStopStatusModal(${p.id}, 'stop')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:border-red-400"><span>???</span><i data-lucide="pause" class="w-3 h-3 text-red-500"></i></button>`
        }
      </td>
      <td class="py-3 px-4">
        <button onclick="toggleAlertPause(${p.id})" class="text-xs ${p.alertStatus === 'paused' ? 'text-purple-600 font-semibold' : 'text-slate-400 hover:text-slate-600'}">
          ${p.alertStatus === 'paused' ? '?? ????' : '?? ??'}
        </button>
      </td>
      <td class="py-3 px-4 text-slate-500 text-xs truncate max-w-xs">${escapeHtml(p.memo || '-')}</td>
      <td class="py-3 px-4 text-right action-column">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="viewHistory(${p.id})" class="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="??">
            <i data-lucide="history" class="w-4 h-4"></i>
          </button>
          <button onclick="openEditProductModal(${p.id})" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="??">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteProduct(${p.id})" class="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="??">
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
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400">??? ????? ????.</td></tr>`;
    return;
  }

  tbody.innerHTML = appState.types.map(t => {
    const prodCount = appState.products.filter(p => p.typeId === t.id).length;
    return `
      <tr class="table-row-hover transition">
        <td class="py-3 px-4 font-bold text-slate-900 dark:text-white">${escapeHtml(t.name)}</td>
        <td class="py-3 px-4 font-semibold text-blue-600 dark:text-blue-400">${t.intervalMonths}??</td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-300">${escapeHtml(t.testItems || '-')}</td>
        <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">${prodCount}? ??</span></td>
        <td class="py-3 px-4 text-right action-column">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="openEditTypeModal(${t.id})" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="??">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteType(${t.id})" class="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="??">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function renderHealthCerts() {
  const tbody = document.getElementById('health-table-body');
  if (!tbody) return;

  const computedHealth = appState.healthCerts.map(getHealthCertComputed);
  if (computedHealth.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">??? ??? ???? ????.</td></tr>`;
    return;
  }

  tbody.innerHTML = computedHealth.map(c => `
    <tr class="table-row-hover transition">
      <td class="py-3 px-4">${renderStatusBadge(c.status, formatDDay(c.dDay))}</td>
      <td class="py-3 px-4 font-bold text-slate-900 dark:text-white">${escapeHtml(c.employeeName)}</td>
      <td class="py-3 px-4 text-slate-600 dark:text-slate-300">${escapeHtml(c.department || '-')}</td>
      <td class="py-3 px-4">${c.issuedAt || '-'}</td>
      <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white">${c.expiresAt || '-'}</td>
      <td class="py-3 px-4">
        ${c.hasFile 
          ? `<button onclick="downloadHealthFile(${c.id})" class="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><i data-lucide="paperclip" class="w-3.5 h-3.5"></i><span>?? ??</span></button>`
          : `<span class="text-slate-400 text-xs">???</span>`
        }
      </td>
      <td class="py-3 px-4 text-slate-500 text-xs truncate max-w-xs">${escapeHtml(c.memo || '-')}</td>
      <td class="py-3 px-4 text-right action-column">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="openEditHealthCertModal(${c.id})" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="??/??">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteHealthCert(${c.id})" class="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" title="??">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

function renderCertificates() {
  const tbody = document.getElementById('certs-table-body');
  if (!tbody) return;

  if (appState.certificates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">??? ???? ????.</td></tr>`;
    return;
  }

  tbody.innerHTML = appState.certificates.map(c => {
    const product = appState.products.find(p => p.id === Number(c.productId));
    const prodName = product ? product.name : '??/????';
    return `
      <tr class="table-row-hover transition">
        <td class="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">${escapeHtml(c.certNumber || '-')}</td>
        <td class="py-3 px-4 font-medium text-slate-900 dark:text-white">${escapeHtml(prodName)}</td>
        <td class="py-3 px-4">${c.inspectionDate || '-'}</td>
        <td class="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium truncate max-w-xs">${escapeHtml(c.fileName || '???.pdf')}</td>
        <td class="py-3 px-4 text-slate-400 text-xs">${c.createdAt ? c.createdAt.slice(0, 10) : '-'}</td>
        <td class="py-3 px-4 text-right action-column">
          <div class="flex items-center justify-end gap-2">
            <button onclick="downloadCertFile(${c.id})" class="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              <span>????</span>
            </button>
            <button onclick="deleteCert(${c.id})" class="p-1 text-slate-400 hover:text-red-600">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function renderSettings() {
  document.getElementById('setting-tg-token').value = appState.settings.telegramBotToken || '';
  document.getElementById('setting-tg-chatid').value = appState.settings.telegramChatId || '';
  document.getElementById('setting-warning-days').value = appState.settings.warningDays || 14;
  document.getElementById('setting-health-warning-days').value = appState.settings.healthWarningDays || 30;
}

// ==================== 5. Modal Operations ====================
function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
  lucide.createIcons();
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function openAddProductModal() {
  document.getElementById('modal-product-title').textContent = '? ?? ??';
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-last-date').value = getTodayKstStr();
  document.getElementById('prod-memo').value = '';

  const typeSelect = document.getElementById('prod-type-id');
  typeSelect.innerHTML = appState.types.map(t => `<option value="${t.id}">${t.name} (${t.intervalMonths}??)</option>`).join('');
  if (appState.types.length > 0) {
    document.getElementById('prod-interval').value = appState.types[0].intervalMonths;
  }
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

  document.getElementById('modal-product-title').textContent = '?? ?? ??';
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-last-date').value = p.lastManufactureDate || '';
  document.getElementById('prod-interval').value = p.intervalMonths || 2;
  document.getElementById('prod-memo').value = p.memo || '';

  const typeSelect = document.getElementById('prod-type-id');
  typeSelect.innerHTML = appState.types.map(t => `<option value="${t.id}" ${t.id === p.typeId ? 'selected' : ''}>${t.name} (${t.intervalMonths}??)</option>`).join('');
  openModal('modal-product');
}

function handleSaveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const name = document.getElementById('prod-name').value.trim();
  const typeId = Number(document.getElementById('prod-type-id').value);
  const intervalMonths = Number(document.getElementById('prod-interval').value);
  const lastManufactureDate = document.getElementById('prod-last-date').value;
  const memo = document.getElementById('prod-memo').value.trim();

  if (!name || !lastManufactureDate) {
    showToast('???? ?? ???? ?????.', 'error');
    return;
  }

  if (id) {
    const p = appState.products.find(x => x.id === Number(id));
    if (p) {
      p.name = name;
      p.typeId = typeId;
      p.intervalMonths = intervalMonths;
      p.lastManufactureDate = lastManufactureDate;
      p.memo = memo;
      showToast('?? ??? ???????.', 'success');
    }
  } else {
    const newId = appState.products.length ? Math.max(...appState.products.map(p => p.id)) + 1 : 1;
    appState.products.push({
      id: newId,
      name,
      typeId,
      intervalMonths,
      lastManufactureDate,
      memo,
      productionStatus: 'active',
      alertStatus: 'active'
    });
    // Record initial history
    appState.history.push({
      id: Date.now(),
      productId: newId,
      productName: name,
      manufactureDate: lastManufactureDate,
      previousDate: null,
      memo: '?? ?? ??',
      createdAt: new Date().toISOString()
    });
    showToast('? ??? ???????.', 'success');
  }

  saveState();
  closeModal('modal-product');
  if (currentTab === 'dashboard') renderDashboard();
  else if (currentTab === 'products') renderProducts();
}

function deleteProduct(id) {
  const p = appState.products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`'${p.name}' ??? ?????????`)) return;

  appState.products = appState.products.filter(x => x.id !== id);
  saveState();
  showToast('??? ???????.', 'info');
  if (currentTab === 'dashboard') renderDashboard();
  else if (currentTab === 'products') renderProducts();
}

// Quick Renew
function openQuickRenewModal(id) {
  const p = appState.products.find(x => x.id === id);
  if (!p) return;

  document.getElementById('renew-prod-id').value = p.id;
  document.getElementById('renew-prod-name').textContent = p.name;
  document.getElementById('renew-prod-info').textContent = `?? ?????: ${p.lastManufactureDate || '??'} ? ??: ${p.intervalMonths || 2}??`;
  document.getElementById('renew-date').value = getTodayKstStr();
  document.getElementById('renew-memo').value = `${getTodayKstStr()} ????/?? ??`;

  openModal('modal-quick-renew');
}

function handleQuickRenew(e) {
  e.preventDefault();
  const id = Number(document.getElementById('renew-prod-id').value);
  const newDate = document.getElementById('renew-date').value;
  const memo = document.getElementById('renew-memo').value.trim();

  const p = appState.products.find(x => x.id === id);
  if (!p) return;

  const prevDate = p.lastManufactureDate;
  p.lastManufactureDate = newDate;

  appState.history.push({
    id: Date.now(),
    productId: p.id,
    productName: p.name,
    manufactureDate: newDate,
    previousDate: prevDate,
    memo: memo || '?? ?? ??',
    createdAt: new Date().toISOString()
  });

  saveState();
  closeModal('modal-quick-renew');
  showToast(`${p.name} ?? ??? ???????.`, 'success');
  renderDashboard();
}

// History
function viewHistory(productId) {
  const p = appState.products.find(x => x.id === productId);
  if (!p) return;

  document.getElementById('history-modal-title').textContent = `${p.name} - ?? ??`;
  document.getElementById('history-modal-subtitle').textContent = `?????? ? ??? ?? ??`;

  const records = appState.history.filter(h => h.productId === productId).sort((a, b) => new Date(b.manufactureDate) - new Date(a.manufactureDate));
  const container = document.getElementById('history-timeline-content');

  if (records.length === 0) {
    container.innerHTML = `<p class="text-center py-6 text-slate-400">??? ?? ??? ????.</p>`;
  } else {
    container.innerHTML = records.map((r, i) => `
      <div class="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start gap-3">
        <div class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
          ${records.length - i}
        </div>
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-900 dark:text-white">??(??)?: ${r.manufactureDate}</span>
            <span class="text-[11px] text-slate-400">${r.createdAt ? r.createdAt.slice(0, 10) : ''}</span>
          </div>
          ${r.previousDate ? `<div class="text-[11px] text-slate-500 mt-0.5">?? ??: ${r.previousDate}</div>` : ''}
          <div class="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium">${escapeHtml(r.memo || '?? ??')}</div>
        </div>
      </div>
    `).join('');
  }

  openModal('modal-history');
}

// Production Stop / Resume
function openStopStatusModal(productId, actionType) {
  const p = appState.products.find(x => x.id === productId);
  if (!p) return;

  document.getElementById('stop-prod-id').value = p.id;
  document.getElementById('stop-action-type').value = actionType;

  if (actionType === 'stop') {
    document.getElementById('stop-modal-title').textContent = `${p.name} ?? ?? ??`;
    document.getElementById('stop-modal-desc').textContent = '?? ?? ?? ? ?? ??? ?? ? ?? ??? ?????.';
    document.getElementById('stop-reason-box').classList.remove('hidden');
    document.getElementById('resume-date-box').classList.add('hidden');
    document.getElementById('stop-submit-btn').className = 'px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold';
    document.getElementById('stop-submit-btn').textContent = '?? ??';
  } else {
    document.getElementById('stop-modal-title').textContent = `${p.name} ??? ?? (??)`;
    document.getElementById('stop-modal-desc').textContent = '??? ???? ???? ??? ?? ?? ? ???? ?????.';
    document.getElementById('stop-reason-box').classList.add('hidden');
    document.getElementById('resume-date-box').classList.remove('hidden');
    document.getElementById('resume-date-input').value = getTodayKstStr();
    document.getElementById('stop-submit-btn').className = 'px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold';
    document.getElementById('stop-submit-btn').textContent = '?? ??';
  }

  openModal('modal-stop');
}

function handleSaveStopStatus(e) {
  e.preventDefault();
  const id = Number(document.getElementById('stop-prod-id').value);
  const actionType = document.getElementById('stop-action-type').value;
  const p = appState.products.find(x => x.id === id);
  if (!p) return;

  if (actionType === 'stop') {
    p.productionStatus = 'stopped';
    p.stopReason = document.getElementById('stop-reason-input').value.trim() || '?? ?? ??';
    showToast(`${p.name} ??? ?? ???????.`, 'info');
  } else {
    const newDate = document.getElementById('resume-date-input').value;
    if (!newDate) {
      showToast('??? ????? ?????.', 'error');
      return;
    }
    p.productionStatus = 'active';
    p.lastManufactureDate = newDate;
    p.stopReason = '';
    showToast(`${p.name} ??? ???????.`, 'success');
  }

  saveState();
  closeModal('modal-stop');
  if (currentTab === 'dashboard') renderDashboard();
  else if (currentTab === 'products') renderProducts();
}

function toggleAlertPause(productId) {
  const p = appState.products.find(x => x.id === productId);
  if (!p) return;
  p.alertStatus = p.alertStatus === 'paused' ? 'active' : 'paused';
  saveState();
  showToast(p.alertStatus === 'paused' ? '??? ?? ???????.' : '??? ?? ????????.', 'info');
  if (currentTab === 'dashboard') renderDashboard();
  else if (currentTab === 'products') renderProducts();
}

// ==================== 6. Types, Health, Certs Handlers ====================
function openAddTypeModal() {
  document.getElementById('modal-type-title').textContent = '? ???? ??';
  document.getElementById('type-id').value = '';
  document.getElementById('type-name').value = '';
  document.getElementById('type-interval').value = '2';
  document.getElementById('type-items').value = '';
  openModal('modal-type');
}

function openEditTypeModal(id) {
  const t = appState.types.find(x => x.id === id);
  if (!t) return;
  document.getElementById('modal-type-title').textContent = '???? ??';
  document.getElementById('type-id').value = t.id;
  document.getElementById('type-name').value = t.name;
  document.getElementById('type-interval').value = t.intervalMonths;
  document.getElementById('type-items').value = t.testItems || '';
  openModal('modal-type');
}

function handleSaveType(e) {
  e.preventDefault();
  const id = document.getElementById('type-id').value;
  const name = document.getElementById('type-name').value.trim();
  const intervalMonths = Number(document.getElementById('type-interval').value);
  const testItems = document.getElementById('type-items').value.trim();

  if (!name || !intervalMonths) {
    showToast('???? ?? ??? ?????.', 'error');
    return;
  }

  if (id) {
    const t = appState.types.find(x => x.id === Number(id));
    if (t) {
      t.name = name;
      t.intervalMonths = intervalMonths;
      t.testItems = testItems;
      showToast('????? ???????.', 'success');
    }
  } else {
    const newId = appState.types.length ? Math.max(...appState.types.map(t => t.id)) + 1 : 1;
    appState.types.push({ id: newId, name, intervalMonths, testItems });
    showToast('? ????? ???????.', 'success');
  }

  saveState();
  closeModal('modal-type');
  renderTypes();
}

function deleteType(id) {
  const inUse = appState.products.some(p => p.typeId === id);
  if (inUse) {
    showToast('?? ????? ?? ??? ?? ??? ? ????.', 'error');
    return;
  }
  if (!confirm('? ????? ?????????')) return;
  appState.types = appState.types.filter(t => t.id !== id);
  saveState();
  showToast('????? ???????.', 'info');
  renderTypes();
}

// Health Certs
function openAddHealthCertModal() {
  document.getElementById('modal-health-title').textContent = '? ??? ??';
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

  document.getElementById('modal-health-title').textContent = '??? ?? ?? / ??';
  document.getElementById('health-id').value = c.id;
  document.getElementById('health-name').value = c.employeeName;
  document.getElementById('health-dept').value = c.department || '';
  document.getElementById('health-issued').value = c.issuedAt || '';
  document.getElementById('health-expires').value = c.expiresAt || '';
  document.getElementById('health-file').value = '';
  document.getElementById('health-memo').value = c.memo || '';
  openModal('modal-health');
}

async function handleSaveHealthCert(e) {
  e.preventDefault();
  const id = document.getElementById('health-id').value;
  const employeeName = document.getElementById('health-name').value.trim();
  const department = document.getElementById('health-dept').value.trim();
  const issuedAt = document.getElementById('health-issued').value;
  const expiresAt = document.getElementById('health-expires').value;
  const memo = document.getElementById('health-memo').value.trim();
  const fileInput = document.getElementById('health-file');

  if (!employeeName || !issuedAt || !expiresAt) {
    showToast('????, ???, ???? ?????.', 'error');
    return;
  }

  let targetId = id ? Number(id) : (appState.healthCerts.length ? Math.max(...appState.healthCerts.map(c => c.id)) + 1 : 1);
  let hasFile = false;

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    await saveFileToDB(`health_${targetId}`, file);
    hasFile = true;
  }

  if (id) {
    const c = appState.healthCerts.find(x => x.id === Number(id));
    if (c) {
      c.employeeName = employeeName;
      c.department = department;
      c.issuedAt = issuedAt;
      c.expiresAt = expiresAt;
      c.memo = memo;
      if (hasFile) c.hasFile = true;
      showToast('??? ??? ???????.', 'success');
    }
  } else {
    appState.healthCerts.push({
      id: targetId,
      employeeName,
      department,
      issuedAt,
      expiresAt,
      warningDays: appState.settings.healthWarningDays || 30,
      memo,
      hasFile,
      employmentStatus: 'active',
      alertStatus: 'active'
    });
    showToast('? ???? ???????.', 'success');
  }

  saveState();
  closeModal('modal-health');
  renderHealthCerts();
}

async function downloadHealthFile(id) {
  const file = await getFileFromDB(`health_${id}`);
  if (!file) {
    showToast('??? ??? ??? ????.', 'error');
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name || `???_${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function deleteHealthCert(id) {
  const c = appState.healthCerts.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`'${c.employeeName}' ???? ??? ??? ?????????`)) return;

  appState.healthCerts = appState.healthCerts.filter(x => x.id !== id);
  deleteFileFromDB(`health_${id}`);
  saveState();
  showToast('??? ??? ???????.', 'info');
  renderHealthCerts();
}

// Quality Certs
function openUploadCertModal() {
  const year = new Date().getFullYear();
  const seq = String(appState.settings.certSequence || 1).padStart(3, '0');
  document.getElementById('cert-number').value = `${appState.settings.certPrefix || 'CONF-QC'}-${year}-${seq}`;
  document.getElementById('cert-date').value = getTodayKstStr();
  document.getElementById('cert-file').value = '';
  document.getElementById('cert-memo').value = '';

  const prodSelect = document.getElementById('cert-product-id');
  prodSelect.innerHTML = `<option value="">?? ? ? (??/??)</option>` + 
    appState.products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  openModal('modal-upload-cert');
}

async function handleSaveCert(e) {
  e.preventDefault();
  const certNumber = document.getElementById('cert-number').value.trim();
  const productId = document.getElementById('cert-product-id').value;
  const inspectionDate = document.getElementById('cert-date').value;
  const memo = document.getElementById('cert-memo').value.trim();
  const fileInput = document.getElementById('cert-file');

  if (!inspectionDate || fileInput.files.length === 0) {
    showToast('?? ??? ??? ??? ?????.', 'error');
    return;
  }

  const file = fileInput.files[0];
  const newId = appState.certificates.length ? Math.max(...appState.certificates.map(c => c.id)) + 1 : 1;

  await saveFileToDB(`cert_${newId}`, file);

  appState.certificates.push({
    id: newId,
    certNumber,
    productId: productId ? Number(productId) : null,
    inspectionDate,
    fileName: file.name,
    fileSize: file.size,
    memo,
    createdAt: new Date().toISOString()
  });

  appState.settings.certSequence = (appState.settings.certSequence || 1) + 1;
  saveState();
  closeModal('modal-upload-cert');
  showToast('???? ???? ???????.', 'success');
  renderCertificates();
}

async function downloadCertFile(id) {
  const c = appState.certificates.find(x => x.id === id);
  const file = await getFileFromDB(`cert_${id}`);
  if (!file) {
    showToast('??? ??? ??? ?? ? ????.', 'error');
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = c ? c.fileName : '???.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

function deleteCert(id) {
  const c = appState.certificates.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`??? '${c.certNumber || c.fileName}'?(?) ?????????`)) return;

  appState.certificates = appState.certificates.filter(x => x.id !== id);
  deleteFileFromDB(`cert_${id}`);
  saveState();
  showToast('???? ???????.', 'info');
  renderCertificates();
}

// ==================== 7. Excel, Backup & Telegram ====================
function exportScheduleExcel() {
  const computedProducts = appState.products.map(getProductComputed);
  const prodRows = computedProducts.map(p => ({
    '??': STATUS_CONFIG[p.status]?.label || '??',
    'D-Day': formatDDay(p.dDay),
    '???': p.name,
    '????': p.typeName,
    '????(??)': p.intervalMonths,
    '?????': p.lastManufactureDate || '',
    '?????': p.nextDeadline || '',
    '????': p.productionStatus === 'stopped' ? `??(${p.stopReason || '?????'})` : '???',
    '????': p.alertStatus === 'paused' ? '????' : '??',
    '??': p.memo || ''
  }));

  const healthRows = appState.healthCerts.map(getHealthCertComputed).map(c => ({
    '??': STATUS_CONFIG[c.status]?.label || '??',
    'D-Day': formatDDay(c.dDay),
    '????': c.employeeName,
    '????': c.department || '',
    '????': c.issuedAt,
    '????': c.expiresAt,
    '????': c.employmentStatus === 'inactive' ? '??/??' : '???',
    '??': c.memo || ''
  }));

  const wb = XLSX.utils.book_new();
  const wsProd = XLSX.utils.json_to_sheet(prodRows);
  const wsHealth = XLSX.utils.json_to_sheet(healthRows);

  XLSX.utils.book_append_sheet(wb, wsProd, '?????? ??');
  XLSX.utils.book_append_sheet(wb, wsHealth, '??? ????');

  const today = getTodayKstStr();
  XLSX.writeFile(wb, `????_????????_${today}.xlsx`);
  showToast('?? ???? ?????????.', 'success');
}

function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet);

      let addedCount = 0;
      rows.forEach(r => {
        const name = r['???'] || r['???'] || r['name'];
        if (!name) return;

        const typeName = r['????'] || r['??'] || '?????';
        let type = appState.types.find(t => t.name === typeName);
        if (!type) {
          const newTypeId = appState.types.length ? Math.max(...appState.types.map(t => t.id)) + 1 : 1;
          type = { id: newTypeId, name: typeName, intervalMonths: Number(r['????'] || 2), testItems: '' };
          appState.types.push(type);
        }

        const lastDate = r['?????'] || r['???'] || r['???'] || getTodayKstStr();
        const intervalMonths = Number(r['????(??)'] || r['????'] || type.intervalMonths || 2);
        const memo = r['??'] || r['??'] || '';

        const newId = appState.products.length ? Math.max(...appState.products.map(p => p.id)) + 1 : 1;
        appState.products.push({
          id: newId,
          name,
          typeId: type.id,
          intervalMonths,
          lastManufactureDate: String(lastDate).slice(0, 10),
          memo,
          productionStatus: 'active',
          alertStatus: 'active'
        });
        addedCount++;
      });

      saveState();
      showToast(`${addedCount}? ??? ???? ???????.`, 'success');
      renderDashboard();
    } catch (err) {
      console.error(err);
      showToast('?? ??? ?? ? ??? ??????.', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

function exportJSONBackup() {
  const dataStr = JSON.stringify(appState, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `????_??????_${getTodayKstStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('?? ??? ???????.', 'success');
}

function handleRestoreJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      if (!parsed.products || !parsed.types) {
        throw new Error('???? ?? ?? ?? ??');
      }
      if (!confirm('?? ???? ????????? ?? ???? ?????.')) return;
      appState = parsed;
      saveState();
      showToast('?? ???? ????? ???????.', 'success');
      switchTab('dashboard');
    } catch (err) {
      showToast('?? ??? ???? ?????: ??? JSON ??? ????.', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function loadSampleData(confirmUser) {
  if (confirmUser && !confirm('?? ?? ???? ?????????')) return;
  appState = JSON.parse(JSON.stringify(DEFAULT_DATA));
  saveState();
  showToast('?? ?? ???? ???????.', 'success');
  switchTab('dashboard');
}

function resetAllData() {
  if (!confirm('??: ?? ??, ?? ??, ??? ???? ?????. ?????????')) return;
  appState = { types: [], products: [], history: [], healthCerts: [], certificates: [], settings: DEFAULT_DATA.settings };
  saveState();
  showToast('?? ???? ????????.', 'info');
  switchTab('dashboard');
}

// Telegram
function saveTelegramSettings() {
  const token = document.getElementById('setting-tg-token').value.trim();
  const chatId = document.getElementById('setting-tg-chatid').value.trim();
  appState.settings.telegramBotToken = token;
  appState.settings.telegramChatId = chatId;
  saveState();
  showToast('???? ?? ??? ???????.', 'success');
}

function saveNotificationDays() {
  const wDays = Number(document.getElementById('setting-warning-days').value) || 14;
  const hwDays = Number(document.getElementById('setting-health-warning-days').value) || 30;
  appState.settings.warningDays = wDays;
  appState.settings.healthWarningDays = hwDays;
  saveState();
  showToast('?? ???? ???????.', 'success');
}

async function testTelegramNotification() {
  const token = appState.settings.telegramBotToken;
  const chatId = appState.settings.telegramChatId;

  if (!token || !chatId) {
    showToast('???? Bot Token? Chat ID? ?? ???? ?????.', 'error');
    return;
  }

  const computedProducts = appState.products.map(getProductComputed);
  const overdueCount = computedProducts.filter(p => p.status === 'overdue').length;
  const urgentCount = computedProducts.filter(p => p.status === 'urgent').length;

  const msgText = `?? [???? ?????? ??]
` +
    `?? ????: ${new Date().toLocaleString('ko-KR')}
` +
    `????????????????
` +
    `?? ?? ?? ??: ${overdueCount}?
` +
    `?? 14? ? ?? ??: ${urgentCount}?
` +
    `????????????????
` +
    `? ??? ?? ??? ????? ???????.`;

  try {
    showToast('?????? ?? ??? ???? ?...', 'info');
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msgText })
    });
    const result = await resp.json();
    if (result.ok) {
      showToast('???? ???? ?? ???????! ??', 'success');
    } else {
      showToast(`?? ??: ${result.description || 'Bot Token ?? Chat ID ?? ??'}`, 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('???? API ?? ??: ??? ?? ? ???? CORS ??? ?????.', 'error');
  }
}

// Utility Helpers
function triggerPrint() {
  window.print();
}

function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.classList.toggle('dark');
  localStorage.setItem('koenf_theme', isDark ? 'dark' : 'light');
  document.getElementById('theme-icon').setAttribute('data-lucide', isDark ? 'sun' : 'moon');
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
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadState();
  switchTab('dashboard');
});
