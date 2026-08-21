/**
 * (주)코엔에프 자가품질검사 및 보건증 일일 텔레그램 알림 자동 발송 스크립트
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

// 1. 환경변수 확인
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

// 2. 기본 데이터 로드 (data/schedule.json이 있으면 우선 로드, 없으면 기본값)
let data = {
  types: [
    { id: 1, name: '액상차', intervalMonths: 2 },
    { id: 2, name: '음료베이스', intervalMonths: 2 },
    { id: 3, name: '기타가공품', intervalMonths: 3 },
    { id: 4, name: '복합조미식품', intervalMonths: 3 },
    { id: 5, name: '과·채가공품', intervalMonths: 2 },
    { id: 6, name: '혼합음료', intervalMonths: 2 }
  ],
  products: [
    { id: 1, typeId: 1, name: '코엔에프 포션 유자차 30g', intervalMonths: 2, lastManufactureDate: '2026-06-25', productionStatus: 'active', alertStatus: 'active' },
    { id: 2, typeId: 2, name: '코엔에프 자몽에이드 베이스 1kg', intervalMonths: 2, lastManufactureDate: '2026-06-10', productionStatus: 'active', alertStatus: 'active' },
    { id: 3, typeId: 3, name: '코엔에프 레몬밤 추출분말 500g', intervalMonths: 3, lastManufactureDate: '2026-07-01', productionStatus: 'active', alertStatus: 'active' },
    { id: 4, typeId: 4, name: '코엔에프 만능간장 베이스 2kg', intervalMonths: 3, lastManufactureDate: '2026-08-01', productionStatus: 'active', alertStatus: 'active' },
    { id: 5, typeId: 1, name: '코엔에프 헛개수 농축액 1.2kg', intervalMonths: 2, lastManufactureDate: '2026-05-15', productionStatus: 'stopped', stopReason: '원료 수급 조정', alertStatus: 'active' },
    { id: 6, typeId: 2, name: '코엔에프 유기농 석류베이스 1kg', intervalMonths: 2, lastManufactureDate: '2026-07-20', productionStatus: 'active', alertStatus: 'active' }
  ],
  healthCerts: [
    { id: 1, employeeName: '김품질', department: '품질관리팀', issuedAt: '2025-09-10', expiresAt: '2026-09-10', employmentStatus: 'active', alertStatus: 'active' },
    { id: 2, employeeName: '이생산', department: '생산1팀', issuedAt: '2025-08-15', expiresAt: '2026-08-15', employmentStatus: 'active', alertStatus: 'active' },
    { id: 3, employeeName: '박공정', department: '생산2팀', issuedAt: '2025-09-01', expiresAt: '2026-09-01', employmentStatus: 'active', alertStatus: 'active' },
    { id: 4, employeeName: '최개발', department: '연구소', issuedAt: '2026-03-20', expiresAt: '2027-03-20', employmentStatus: 'active', alertStatus: 'active' }
  ]
};

const customDataPath = path.join(__dirname, '..', 'data', 'schedule.json');
if (fs.existsSync(customDataPath)) {
  try {
    const raw = fs.readFileSync(customDataPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.products && parsed.types) data = parsed;
    console.log('✅ data/schedule.json 커스텀 데이터 로드 완료');
  } catch (e) {
    console.warn('⚠️ data/schedule.json 파싱 실패, 기본 프리셋 사용');
  }
}

// 3. 날짜 및 D-Day 계산
function getTodayKstStr() {
  const d = new Date();
  // UTC+9 계산
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

const todayStr = getTodayKstStr();

// 4. 제품 상태 계산
const overdueProducts = [];
const urgentProducts = [];

data.products.forEach(p => {
  if (p.productionStatus === 'stopped' || p.alertStatus === 'paused') return;
  const type = data.types.find(t => t.id === Number(p.typeId)) || { name: '기타' };
  const interval = Number(p.intervalMonths || type.intervalMonths || 2);
  const deadline = calcNextDeadline(p.lastManufactureDate, interval);
  const dDay = calcDDay(deadline, todayStr);

  if (dDay !== null) {
    if (dDay < 0) {
      overdueProducts.push({ name: p.name, typeName: type.name, deadline, dDay, lastDate: p.lastManufactureDate });
    } else if (dDay <= 14) {
      urgentProducts.push({ name: p.name, typeName: type.name, deadline, dDay, lastDate: p.lastManufactureDate });
    }
  }
});

// 5. 보건증 상태 계산
const warningHealthCerts = [];
(data.healthCerts || []).forEach(c => {
  if (c.employmentStatus === 'inactive' || c.alertStatus === 'paused') return;
  const dDay = calcDDay(c.expiresAt, todayStr);
  if (dDay !== null && dDay <= 30) {
    warningHealthCerts.push({ name: c.employeeName, dept: c.department || '미지정', expiresAt: c.expiresAt, dDay });
  }
});

// 6. 텔레그램 메시지 조립
let message = `🧪 *[(주)코엔에프 자가품질검사 일일 알림]*\n`;
message += `📅 *기준일자:* ${todayStr}\n`;
message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

let hasAlert = false;

if (overdueProducts.length > 0) {
  hasAlert = true;
  message += `🚨 *[초과] 자가품질검사 기간 초과 (${overdueProducts.length}건)*\n`;
  overdueProducts.forEach((p, idx) => {
    message += `${idx + 1}. *${p.name}* [${p.typeName}]\n`;
    message += `   └ ⚠️ *${Math.abs(p.dDay)}일 초과* (마감일: ${p.deadline})\n`;
  });
  message += `\n`;
}

if (urgentProducts.length > 0) {
  hasAlert = true;
  message += `⚠️ *[임박] 14일 이내 마감 예정 (${urgentProducts.length}건)*\n`;
  urgentProducts.forEach((p, idx) => {
    message += `${idx + 1}. *${p.name}* [${p.typeName}]\n`;
    message += `   └ ⏳ *D-${p.dDay}* (마감일: ${p.deadline})\n`;
  });
  message += `\n`;
}

if (warningHealthCerts.length > 0) {
  hasAlert = true;
  message += `📋 *[보건증] 만료 임박/초과 (${warningHealthCerts.length}건)*\n`;
  warningHealthCerts.forEach((c, idx) => {
    const statusText = c.dDay < 0 ? `🚨 ${Math.abs(c.dDay)}일 초과` : `⏳ D-${c.dDay}`;
    message += `${idx + 1}. *${c.name}* (${c.dept}) : ${statusText} (~${c.expiresAt})\n`;
  });
  message += `\n`;
}

if (!hasAlert) {
  message += `✅ *오늘 기간 초과 또는 마감 임박 품목이 없습니다.*\n`;
  message += `(모든 자가품질검사 및 보건증 일정이 정상 범위 내에 있습니다.)\n\n`;
}

message += `━━━━━━━━━━━━━━━━━━━━\n`;
message += `👉 *스케줄러 웹앱 바로가기:*\nhttps://gohwansok-max.github.io/koenf-quality-scheduler/`;

console.log('--- 전송할 메시지 미리보기 ---');
console.log(message);
console.log('----------------------------');

// 7. Telegram Bot API 전송
const postData = JSON.stringify({
  chat_id: CHAT_ID,
  text: message,
  parse_mode: 'Markdown',
  disable_web_page_preview: true
});

const req = https.request({
  hostname: 'api.telegram.org',
  port: 443,
  path: `/bot${BOT_TOKEN}/sendMessage`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(body);
      if (response.ok) {
        console.log('🎉 텔레그램 메시지가 성공적으로 발송되었습니다!');
      } else {
        console.error('❌ 텔레그램 API 오류:', response.description);
        process.exit(1);
      }
    } catch (err) {
      console.error('❌ 응답 파싱 실패:', body);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ 네트워크 오류:', e.message);
  process.exit(1);
});

req.write(postData);
req.end();
