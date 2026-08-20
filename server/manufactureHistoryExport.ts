import ExcelJS from "exceljs";
import { listInspectionTypes, listProductManufactureRecords, listProducts } from "./db";

type ManufactureHistoryExportRow = {
  productName: string;
  inspectionTypeName: string;
  manufactureDate: string;
  previousManufactureDate: string | null;
  memo: string | null;
  createdAt: Date;
};

function kstDateTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function buildManufactureHistoryWorkbook(rows: ManufactureHistoryExportRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "코엔에프 자가품질검사 스케줄러";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("요약", { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 3 }, { width: 24 }, { width: 24 }, { width: 18 }, { width: 18 }];
  summary.mergeCells("B2:E2");
  summary.getCell("B2").value = "코엔에프 제품 제조일 변경 이력";
  summary.getCell("B2").font = { name: "Malgun Gothic", size: 18, bold: true, color: { argb: "FF0F5C5B" } };
  summary.getCell("B2").alignment = { vertical: "middle" };
  summary.getRow(2).height = 32;
  summary.mergeCells("B3:E3");
  summary.getCell("B3").value = `생성일: ${kstDateTime(new Date())} (KST) · 제조일을 변경한 기록을 최신 입력 순으로 제공합니다.`;
  summary.getCell("B3").font = { name: "Malgun Gothic", size: 10, color: { argb: "FF64748B" } };
  const productCount = new Set(rows.map(row => row.productName)).size;
  const typeCount = new Set(rows.map(row => row.inspectionTypeName)).size;
  [["기록 건수", rows.length], ["변경 제품 수", productCount], ["관련 식품유형 수", typeCount]].forEach(([label, value], index) => {
    const row = 5 + index;
    summary.getCell(`B${row}`).value = label;
    summary.getCell(`B${row}`).font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF0F5C5B" } };
    summary.getCell(`C${row}`).value = value;
    summary.getCell(`C${row}`).numFmt = "#,##0";
    summary.getCell(`C${row}`).font = { name: "Malgun Gothic", size: 11, bold: true, color: { argb: "FF1F2937" } };
  });
  summary.mergeCells("B10:E10");
  summary.getCell("B10").value = "상세 시트에서 제품명·제조일·변경 전 제조일·메모·입력 시각을 필터링하거나 정렬할 수 있습니다.";
  summary.getCell("B10").font = { name: "Malgun Gothic", size: 9, italic: true, color: { argb: "FF64748B" } };

  const detail = workbook.addWorksheet("변경 이력", { views: [{ state: "frozen", ySplit: 5, showGridLines: false }] });
  detail.columns = [
    { width: 3 },
    { width: 18 },
    { width: 26 },
    { width: 16 },
    { width: 18 },
    { width: 38 },
    { width: 23 },
  ];
  detail.mergeCells("B2:G2");
  detail.getCell("B2").value = "제품 제조일 변경 이력";
  detail.getCell("B2").font = { name: "Malgun Gothic", size: 16, bold: true, color: { argb: "FF0F5C5B" } };
  detail.getRow(2).height = 30;
  detail.mergeCells("B3:G3");
  detail.getCell("B3").value = "제조일을 새로 입력하거나 변경한 순서를 추적하기 위한 품질관리 기록입니다.";
  detail.getCell("B3").font = { name: "Malgun Gothic", size: 10, color: { argb: "FF64748B" } };
  const headers = ["식품 유형", "제품명", "변경 제조일", "변경 전 제조일", "메모", "입력 시각(KST)"];
  headers.forEach((header, index) => {
    const cell = detail.getRow(5).getCell(index + 2);
    cell.value = header;
    cell.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F5C5B" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  detail.getRow(5).height = 28;
  rows.forEach((row, index) => {
    const excelRow = detail.getRow(index + 6);
    [row.inspectionTypeName, row.productName, row.manufactureDate, row.previousManufactureDate ?? "최초 입력", row.memo ?? "", kstDateTime(row.createdAt)].forEach((value, offset) => {
      const cell = excelRow.getCell(offset + 2);
      cell.value = value;
      cell.font = { name: "Malgun Gothic", size: 10, color: { argb: "FF1F2937" } };
      cell.alignment = { horizontal: [4, 5, 7].includes(offset + 2) ? "center" : "left", vertical: "middle", wrapText: offset === 4 };
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
    });
    excelRow.height = 22;
  });
  if (!rows.length) {
    detail.mergeCells("B6:G6");
    detail.getCell("B6").value = "제조일 변경 이력이 없습니다. 제품별 검사 일정에서 제조일을 입력하면 이력이 생성됩니다.";
    detail.getCell("B6").font = { name: "Malgun Gothic", size: 10, color: { argb: "FF64748B" } };
    detail.getCell("B6").alignment = { horizontal: "center", vertical: "middle" };
    detail.getRow(6).height = 32;
  }
  const lastRow = Math.max(6, rows.length + 5);
  detail.autoFilter = { from: "B5", to: `G${lastRow}` };
  detail.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  detail.headerFooter.oddFooter = "&L코엔에프 자가품질검사 스케줄러&R제조일 변경 이력";
  return workbook;
}

export async function createManufactureHistoryExport(ownerId: number) {
  const [records, products, inspectionTypes] = await Promise.all([
    listProductManufactureRecords(ownerId),
    listProducts(ownerId),
    listInspectionTypes(ownerId),
  ]);
  const productById = new Map(products.map(product => [product.id, product]));
  const typeById = new Map(inspectionTypes.map(type => [type.id, type.name]));
  const rows: ManufactureHistoryExportRow[] = records.map(record => {
    const product = productById.get(record.productId);
    return {
      productName: product?.name ?? "삭제된 제품",
      inspectionTypeName: product ? typeById.get(product.inspectionTypeId) ?? "식품유형 미지정" : "-",
      manufactureDate: record.manufactureDate,
      previousManufactureDate: record.previousManufactureDate,
      memo: record.memo,
      createdAt: record.createdAt,
    };
  });
  const buffer = await buildManufactureHistoryWorkbook(rows).xlsx.writeBuffer();
  return Buffer.from(buffer);
}
