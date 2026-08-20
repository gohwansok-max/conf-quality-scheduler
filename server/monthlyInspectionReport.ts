import PDFDocument from "pdfkit";
import * as db from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { buildProductSchedule, kstDateString, type ProductSchedule } from "./qualityScheduleCore";
import { getExportStatusDetail, sortExportSchedules } from "./inspectionScheduleExport";

const KOREAN_FONT = new URL("../node_modules/noto-sans-kr/fonts/NotoSans-Regular.woff", import.meta.url).pathname;

type ReportSchedule = ProductSchedule & {
  productionStatus: "active" | "stopped";
  alertStatus: "active" | "paused";
  productionStopReason: string | null;
  alertPauseReason: string | null;
};

const statusLabel: Record<ReportSchedule["status"], string> = {
  overdue: "기간 초과", urgent: "사전 알림", safe: "정상", pending: "제조일 입력 대기", stopped: "생산 중단", paused: "알림 일시 중지",
};

function dDayText(days: number | null) {
  if (days === null) return "-";
  if (days < 0) return `${Math.abs(days)}일 초과`;
  if (days === 0) return "오늘 마감";
  return `D-${days}`;
}

function writeRow(doc: PDFKit.PDFDocument, values: string[], y: number, color = "#1f2937") {
  const columns = [42, 145, 280, 348, 430, 500];
  const widths = [98, 132, 62, 78, 66, 54];
  values.forEach((value, index) => doc.fillColor(color).fontSize(8).text(value, columns[index], y, { width: widths[index], lineBreak: false, ellipsis: true }));
}

export function buildMonthlyInspectionReportPdf(schedules: ReportSchedule[], reportMonth: string, generatedOn = kstDateString()) {
  const document = new PDFDocument({ size: "A4", margin: 42, bufferPages: true });
  document.registerFont("Korean", KOREAN_FONT);
  document.font("Korean");
  const chunks: Buffer[] = [];
  document.on("data", chunk => chunks.push(Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  const ordered = sortExportSchedules(schedules);
  const count = (status: ReportSchedule["status"]) => ordered.filter(item => item.status === status).length;
  const drawHeader = () => {
    document.fillColor("#0f5c5b").fontSize(20).text("코엔에프 자가품질검사 월간 보고서", 42, 42);
    document.fillColor("#64748b").fontSize(10).text(`대상 월: ${reportMonth} · 생성일: ${generatedOn}`, 42, 72);
    document.fillColor("#0f5c5b").roundedRect(42, 96, 511, 42, 8).fill();
    document.fillColor("#ffffff").fontSize(10).text(`관리 ${ordered.length}건    기간 초과 ${count("overdue")}건    사전 알림 ${count("urgent")}건    정상 ${count("safe")}건`, 58, 112);
    document.fillColor("#475569").fontSize(9).text("식품유형", 42, 158).text("제품명", 145, 158).text("주기", 280, 158).text("다음 마감", 348, 158).text("D-Day", 430, 158).text("상태", 500, 158);
    document.moveTo(42, 174).lineTo(553, 174).strokeColor("#cbd5e1").stroke();
  };
  drawHeader();
  let y = 185;
  for (const item of ordered) {
    if (y > 755) { document.addPage(); drawHeader(); y = 185; }
    const color = item.status === "overdue" ? "#b91c1c" : item.status === "urgent" ? "#b45309" : item.status === "safe" ? "#047857" : "#475569";
    writeRow(document, [item.parentTypeName ?? "미지정", item.name, `${item.intervalMonths}개월`, item.nextDeadline ?? "-", dDayText(item.daysRemaining), statusLabel[item.status]], y, color);
    if (item.status === "stopped" || item.status === "paused") {
      y += 13;
      document.fillColor("#64748b").fontSize(7).text(getExportStatusDetail(item), 145, y, { width: 350, lineBreak: false, ellipsis: true });
    }
    y += 23;
    document.moveTo(42, y - 6).lineTo(553, y - 6).strokeColor("#e2e8f0").stroke();
  }
  if (!ordered.length) document.fillColor("#64748b").fontSize(10).text("등록된 제품별 검사 일정이 없습니다.", 42, 190);
  document.fillColor("#64748b").fontSize(8).text("본 보고서는 제품별 검사 주기와 최근 제조일을 기준으로 자동 생성되었습니다.", 42, 790);
  document.end();
  return done;
}

export async function ensureMonthlyInspectionReport(ownerId: number, reportMonth = kstDateString().slice(0, 7)) {
  const existing = await db.getMonthlyReport(ownerId, reportMonth);
  if (existing) return existing;
  const [products, inspectionTypes, settings] = await Promise.all([db.listProducts(ownerId), db.listInspectionTypes(ownerId), db.getNotificationSettings(ownerId)]);
  const typeNames = new Map(inspectionTypes.map(item => [item.id, item.name]));
  const schedules = products.map(product => buildProductSchedule({ ...product, parentTypeName: typeNames.get(product.inspectionTypeId) ?? "식품유형 미지정" }, settings.warningDays) as ReportSchedule);
  const buffer = await buildMonthlyInspectionReportPdf(schedules, reportMonth);
  const fileName = `코엔에프_자가품질검사_월간보고서_${reportMonth}.pdf`;
  const stored = await storagePut(`quality-reports/${ownerId}/${reportMonth}/monthly-inspection-report.pdf`, buffer, "application/pdf");
  const id = await db.createMonthlyReport(ownerId, { reportMonth, fileName, storageKey: stored.key });
  return { id: Number(id), ownerId, reportMonth, fileName, storageKey: stored.key, generatedAt: new Date() };
}

export async function getMonthlyReportDownloadUrl(ownerId: number, reportMonth: string) {
  const report = await ensureMonthlyInspectionReport(ownerId, reportMonth);
  return { report, signedUrl: await storageGetSignedUrl(report.storageKey) };
}
