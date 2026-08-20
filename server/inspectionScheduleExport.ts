import ExcelJS from "exceljs";
import { listInspectionTypes, listProducts, getNotificationSettings } from "./db";
import { buildProductSchedule, kstDateString, type InspectionStatus, type ProductSchedule } from "./qualityScheduleCore";

type ExportProductSchedule = ProductSchedule & {
  productionStatus: "active" | "stopped";
  alertStatus: "active" | "paused";
  productionStopReason: string | null;
  alertPauseReason: string | null;
};

const statusLabel: Record<InspectionStatus, string> = {
  pending: "제조일 입력 대기",
  safe: "정상",
  urgent: "사전 알림",
  overdue: "기간 초과",
  stopped: "생산 중단",
  paused: "알림 일시 중지",
};

const statusFill: Record<InspectionStatus, string> = {
  pending: "E2E8F0",
  safe: "E8F5E9",
  urgent: "FFF3E0",
  overdue: "FFEBEE",
  stopped: "F1F5F9",
  paused: "F3E8FF",
};

function isoToDate(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getExportStatusDetail(item: ExportProductSchedule) {
  if (item.status === "stopped") return item.productionStopReason ? `생산 중단: ${item.productionStopReason}` : "생산 중단 · 알림 제외";
  if (item.status === "paused") return item.alertPauseReason ? `알림 중지: ${item.alertPauseReason}` : "알림 일시 중지";
  return "관리 중";
}

export function sortExportSchedules<T extends Pick<ExportProductSchedule, "status" | "daysRemaining" | "name">>(items: T[]) {
  const priority: Record<InspectionStatus, number> = { overdue: 0, urgent: 1, safe: 2, pending: 3, paused: 4, stopped: 5 };
  return [...items].sort((left, right) => priority[left.status] - priority[right.status] || (left.daysRemaining ?? 9999) - (right.daysRemaining ?? 9999) || left.name.localeCompare(right.name, "ko"));
}

export function buildInspectionStatusWorkbook(schedules: ExportProductSchedule[], referenceDate = kstDateString()) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "코엔에프 자가품질검사 스케줄러";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("제품 검사 현황", {
    views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
    properties: { defaultRowHeight: 20 },
  });
  worksheet.getColumn(1).width = 3;
  worksheet.columns = [
    { key: "margin", width: 3 },
    { key: "type", width: 18 },
    { key: "name", width: 28 },
    { key: "interval", width: 14 },
    { key: "manufacture", width: 15 },
    { key: "deadline", width: 15 },
    { key: "dday", width: 14 },
    { key: "status", width: 16 },
    { key: "detail", width: 32 },
  ];

  worksheet.mergeCells("B2:I2");
  worksheet.getCell("B2").value = "코엔에프 제품별 자가품질검사 현황";
  worksheet.getCell("B2").font = { name: "Malgun Gothic", size: 18, bold: true, color: { argb: "FF0F5C5B" } };
  worksheet.getCell("B2").alignment = { vertical: "middle" };
  worksheet.getRow(2).height = 32;
  worksheet.mergeCells("B3:I3");
  worksheet.getCell("B3").value = `기준일: ${referenceDate} · 제품별 검사 주기와 최근 제조일 기준`;
  worksheet.getCell("B3").font = { name: "Malgun Gothic", size: 10, color: { argb: "FF64748B" } };
  worksheet.mergeCells("B4:I4");
  worksheet.getCell("B4").value = "기간 초과(빨강), 사전 알림(주황), 정상(초록), 생산 중단·알림 일시 중지(회색·보라색) 순으로 정렬됩니다.";
  worksheet.getCell("B4").font = { name: "Malgun Gothic", size: 9, italic: true, color: { argb: "FF64748B" } };

  const headers = ["식품 유형", "제품명", "검사 주기(개월)", "최근 제조일", "다음 만료일", "D-Day", "상태", "생산·알림 상태"];
  const headerRow = worksheet.getRow(6);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 2);
    cell.value = header;
    cell.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5C5B" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  headerRow.height = 28;

  const sortedSchedules = sortExportSchedules(schedules);
  sortedSchedules.forEach((schedule, index) => {
    const row = worksheet.getRow(index + 7);
    const rowValues = [
      schedule.parentTypeName,
      schedule.name,
      schedule.intervalMonths,
      isoToDate(schedule.lastManufactureDate),
      isoToDate(schedule.nextDeadline),
      schedule.daysRemaining === null ? "-" : schedule.daysRemaining < 0 ? `${Math.abs(schedule.daysRemaining)}일 초과` : schedule.daysRemaining === 0 ? "오늘 마감" : `D-${schedule.daysRemaining}`,
      statusLabel[schedule.status],
      getExportStatusDetail(schedule),
    ];
    rowValues.forEach((value, columnOffset) => {
      const cell = row.getCell(columnOffset + 2);
      cell.value = value;
      cell.font = { name: "Malgun Gothic", size: 10, color: { argb: "FF1F2937" } };
      cell.alignment = { horizontal: [2, 3, 4, 5, 6, 7, 8].includes(columnOffset + 2) ? "center" : "left", vertical: "middle", wrapText: columnOffset === 7 };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
    });
    row.getCell(8).font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: schedule.status === "overdue" ? "FFC62828" : schedule.status === "urgent" ? "FFF57C00" : "FF1F2937" } };
    row.getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${statusFill[schedule.status]}` } };
    row.getCell(7).numFmt = "yyyy-mm-dd";
    row.getCell(6).numFmt = "yyyy-mm-dd";
    row.height = 22;
  });

  if (!sortedSchedules.length) {
    worksheet.mergeCells("B7:I7");
    worksheet.getCell("B7").value = "등록된 제품이 없습니다. 대시보드의 제품명 추가 기능에서 제품을 먼저 등록해 주세요.";
    worksheet.getCell("B7").alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getCell("B7").font = { name: "Malgun Gothic", size: 10, color: { argb: "FF64748B" } };
    worksheet.getRow(7).height = 32;
  }

  const lastRow = Math.max(7, sortedSchedules.length + 6);
  worksheet.autoFilter = { from: "B6", to: `I${lastRow}` };
  worksheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  worksheet.headerFooter.oddFooter = `&L코엔에프 자가품질검사 스케줄러&R생성일: ${referenceDate}`;
  return workbook;
}

export async function createInspectionStatusExport(ownerId: number) {
  const [products, inspectionTypes, settings] = await Promise.all([listProducts(ownerId), listInspectionTypes(ownerId), getNotificationSettings(ownerId)]);
  const typeNameById = new Map(inspectionTypes.map(item => [item.id, item.name]));
  const schedules: ExportProductSchedule[] = products.map(product => buildProductSchedule({
    ...product,
    parentTypeName: typeNameById.get(product.inspectionTypeId) ?? "식품유형 미지정",
  }, settings.warningDays) as ExportProductSchedule);
  const workbook = buildInspectionStatusWorkbook(schedules);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
