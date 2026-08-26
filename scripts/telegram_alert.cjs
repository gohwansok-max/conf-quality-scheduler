/**
 * (주)코엔에프 자가품질검사 및 보건증 일일 텔레그램 알림 자동 발송 스크립트 (Supabase 연동 버전)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// 1. 환경변수 확인
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const CHAT_IDS = [...new Set(
  String(process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || '')
    .split(/[\s,;]+/)
    .map(value => value.trim())
    .filter(Boolean)
)];
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hooaeqywrdihninxnvtb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_3iDGX80MZlMhAPCthcBKDA_TDUHDwhz';
const DRY_RUN = process.env.DRY_RUN === 'true';
const DEFAULT_HEALTH_ALERT_DAYS = [30, 7, 1];

function normalizeHealthAlertDays(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\s,;/]+/);
  const days = source
    .map(item => Number(item))
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 365);
  return [...new Set(days.length ? days : DEFAULT_HEALTH_ALERT_DAYS)].sort((a, b) => b - a);
}

if ((!BOT_TOKEN || CHAT_IDS.length === 0) && !DRY_RUN) {
  console.error('❌ 오류: TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID 또는 TELEGRAM_CHAT_IDS를 설정하세요.');
  process.exit(1);
}

// 2. HTTP Helper for Supabase REST API
function fetchSupabase(table) {
  return new Promise((resolve) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}?select=*`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// 3. KST 기준 날짜 및 D-Day 계산
function getTodayKstStr() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (9 * 3600000));
  const year = kst.getFullYear();
  const month = String(kst.getMonth() + 1).padStart(2, '0');
  const day = String(kst.getDate()).padStart(2, '0');
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

function calcDDay(targetDateStr, todayStr) {
  if (!targetDateStr) return null;
  const today = new Date(todayStr).getTime();
  const target = new Date(targetDateStr).getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function run() {
  const todayStr = getTodayKstStr();

  // 클라우드 데이터 로드
  const [cloudTypes, cloudProducts, cloudHealth, cloudCertificates, cloudSettings] = await Promise.all([
    fetchSupabase('quality_types'),
    fetchSupabase('quality_products'),
    fetchSupabase('quality_health_certs'),
    fetchSupabase('quality_certificates'),
    fetchSupabase('quality_settings')
  ]);

  let types = cloudTypes || [
    { id: 1, name: '액상차', interval_months: 2 },
    { id: 2, name: '음료베이스', interval_months: 2 },
    { id: 3, name: '기타가공품', interval_months: 3 },
    { id: 4, name: '복합조미식품', interval_months: 3 },
    { id: 5, name: '과·채가공품', interval_months: 2 },
    { id: 6, name: '혼합음료', interval_months: 2 }
  ];

  let products = cloudProducts || [
    { id: 1, type_id: 1, name: '코엔에프 포션 유자차 30g', interval_months: 2, last_manufacture_date: '2026-06-25', production_status: 'active', alert_status: 'active' },
    { id: 2, type_id: 2, name: '코엔에프 자몽에이드 베이스 1kg', interval_months: 2, last_manufacture_date: '2026-06-10', production_status: 'active', alert_status: 'active' },
    { id: 3, type_id: 3, name: '코엔에프 레몬밤 추출분말 500g', interval_months: 3, last_manufacture_date: '2026-07-01', production_status: 'active', alert_status: 'active' },
    { id: 4, type_id: 4, name: '코엔에프 만능간장 베이스 2kg', interval_months: 3, last_manufacture_date: '2026-08-01', production_status: 'active', alert_status: 'active' },
    { id: 5, type_id: 1, name: '코엔에프 헛개수 농축액 1.2kg', interval_months: 2, last_manufacture_date: '2026-05-15', production_status: 'stopped', stop_reason: '원료 수급 조정', alert_status: 'active' },
    { id: 6, type_id: 2, name: '코엔에프 유기농 석류베이스 1kg', interval_months: 2, last_manufacture_date: '2026-07-20', production_status: 'active', alert_status: 'active' }
  ];

  let healthCerts = cloudHealth || [
    { id: 1, employee_name: '김품질', department: '품질관리팀', issued_at: '2025-09-10', expires_at: '2026-09-10', employment_status: 'active', alert_status: 'active' },
    { id: 2, employee_name: '이생산', department: '생산1팀', issued_at: '2025-08-15', expires_at: '2026-08-15', employment_status: 'active', alert_status: 'active' },
    { id: 3, employee_name: '박공정', department: '생산2팀', issued_at: '2025-09-01', expires_at: '2026-09-01', employment_status: 'active', alert_status: 'active' },
    { id: 4, employee_name: '최개발', department: '연구소', issued_at: '2026-03-20', expires_at: '2027-03-20', employment_status: 'active', alert_status: 'active' }
  ];
  const certificates = cloudCertificates || [];
  const storedHealthAlertDays = (cloudSettings || []).find(setting => setting.key === 'health_alert_days')?.value;
  const healthAlertDays = normalizeHealthAlertDays(storedHealthAlertDays || process.env.HEALTH_ALERT_DAYS || DEFAULT_HEALTH_ALERT_DAYS);
  const healthAlertDaysLabel = healthAlertDays.map(day => `D-${day}`).join(' · ');

  const overdueProducts = [];
  const urgentProducts = [];

  products.forEach(p => {
    if (p.production_status === 'stopped' || p.alert_status === 'paused') return;
    const type = types.find(t => t.id === Number(p.type_id)) || { name: '기타', interval_months: 2 };
    const interval = Number(p.interval_months || type.interval_months || 2);
    const deadline = calcNextDeadline(p.last_manufacture_date, interval);
    const dDay = calcDDay(deadline, todayStr);

    if (dDay !== null) {
      if (dDay < 0) overdueProducts.push({ name: p.name, typeName: type.name, deadline, dDay });
      else if (dDay <= 14) urgentProducts.push({ name: p.name, typeName: type.name, deadline, dDay });
    }
  });

  // 생산 중이며 알림이 활성화된 제품만 검사합니다.
  // 제품별로 연결된 성적서 중 가장 최신 검사일이 최근 제조일보다 이전이면 미성적서로 판단합니다.
  const missingCertificateProducts = [];
  products.forEach(p => {
    if (p.production_status === 'stopped' || p.alert_status === 'paused') return;
    const relatedCertificates = certificates
      .filter(c => Number(c.product_id) === Number(p.id) && c.inspection_date)
      .sort((a, b) => String(b.inspection_date).localeCompare(String(a.inspection_date)));
    const latestCertificate = relatedCertificates[0];
    const isCurrent = latestCertificate && (!p.last_manufacture_date || String(latestCertificate.inspection_date) >= String(p.last_manufacture_date));
    if (!isCurrent) {
      const type = types.find(t => t.id === Number(p.type_id)) || { name: '기타' };
      missingCertificateProducts.push({
        name: p.name,
        typeName: type.name,
        lastManufactureDate: p.last_manufacture_date || '미입력',
        latestInspectionDate: latestCertificate?.inspection_date || ''
      });
    }
  });

  const warningHealthCerts = [];
  healthCerts.forEach(c => {
    if (c.employment_status === 'inactive' || c.alert_status === 'paused') return;
    const dDay = calcDDay(c.expires_at, todayStr);
    if (dDay !== null && (dDay < 0 || healthAlertDays.includes(dDay))) {
      warningHealthCerts.push({ name: c.employee_name, dept: c.department || '미지정', expiresAt: c.expires_at, dDay });
    }
  });

  const appUrl = 'https://gohwansok-max.github.io/conf-quality-scheduler/';
  const certificateRegisterUrl = `${appUrl}#certs-register`;
  const totalActionCount = overdueProducts.length + urgentProducts.length + missingCertificateProducts.length + warningHealthCerts.length;

  let message = `🧪 <b>코엔에프 품질 알림</b>\n`;
  message += `📅 ${todayStr} · 확인 필요 <b>${totalActionCount}건</b>\n`;
  message += `━━━━━━━━━━━━━━━━\n\n`;

  if (overdueProducts.length > 0) {
    message += `🚨 <b>검사 기한 초과 · ${overdueProducts.length}건</b>\n`;
    overdueProducts.forEach((p, idx) => {
      message += `${idx + 1}. <b>${escapeHtml(p.name)}</b>\n`;
      message += `   ${escapeHtml(p.typeName)} · <b>${Math.abs(p.dDay)}일 초과</b> · 마감 ${p.deadline}\n`;
    });
    message += `\n`;
  }

  if (urgentProducts.length > 0) {
    message += `⏰ <b>14일 이내 검사 마감 · ${urgentProducts.length}건</b>\n`;
    urgentProducts.forEach((p, idx) => {
      message += `${idx + 1}. <b>${escapeHtml(p.name)}</b>\n`;
      message += `   ${escapeHtml(p.typeName)} · <b>D-${p.dDay}</b> · 마감 ${p.deadline}\n`;
    });
    message += `\n`;
  }

  if (missingCertificateProducts.length > 0) {
    message += `📄 <b>최신 성적서 미등록 · ${missingCertificateProducts.length}건</b>\n`;
    missingCertificateProducts.forEach((p, idx) => {
      const certificateText = p.latestInspectionDate ? `이전 성적서 ${p.latestInspectionDate}` : '등록된 제품별 성적서 없음';
      message += `${idx + 1}. <b>${escapeHtml(p.name)}</b>\n`;
      message += `   ${escapeHtml(p.typeName)} · 제조 ${p.lastManufactureDate} · ${certificateText}\n`;
    });
    message += `\n`;
  }

  if (warningHealthCerts.length > 0) {
    message += `👤 <b>보건증 만료 알림 (${healthAlertDaysLabel}) · ${warningHealthCerts.length}명</b>\n`;
    warningHealthCerts.forEach((c, idx) => {
      const statusText = c.dDay < 0 ? `${Math.abs(c.dDay)}일 초과` : `D-${c.dDay}`;
      message += `${idx + 1}. <b>${escapeHtml(c.name)}</b> · ${escapeHtml(c.dept)} · ${statusText}\n`;
    });
    message += `\n`;
  }

  if (totalActionCount === 0) {
    message += `✅ <b>오늘 확인이 필요한 품목이 없습니다.</b>\n`;
    message += `자가품질검사·성적서·보건증 일정이 정상입니다.\n\n`;
  }

  message += `━━━━━━━━━━━━━━━━\n`;
  message += `아래 버튼에서 상세 일정과 성적서를 바로 확인하세요.`;

  const inlineKeyboard = [];
  if (missingCertificateProducts.length > 0) {
    inlineKeyboard.push([{ text: '📄 성적서 등록하기', url: certificateRegisterUrl }]);
  }
  inlineKeyboard.push([{ text: '🗓️ 스케줄러 열기', url: appUrl }]);

  if (DRY_RUN) {
    console.log('🧪 DRY RUN: 텔레그램 전송 없이 아래 메시지를 검증합니다.\n');
    console.log(message);
    return;
  }

  const sendMessage = (chatId) => new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: inlineKeyboard }
    });
    const req = https.request({
      hostname: 'api.telegram.org', port: 443, path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.ok) resolve(chatId);
          else reject(new Error(response.description || `HTTP ${res.statusCode}`));
        } catch {
          reject(new Error(`응답 파싱 실패: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  const results = await Promise.allSettled(CHAT_IDS.map(sendMessage));
  const failures = results.filter(result => result.status === 'rejected');
  results.filter(result => result.status === 'fulfilled').forEach(result => {
    console.log(`🎉 텔레그램 메시지 발송 완료: ${result.value}`);
  });
  if (failures.length) {
    failures.forEach(result => console.error('❌ 텔레그램 API 오류:', result.reason?.message || result.reason));
    process.exit(1);
  }
}

run();
