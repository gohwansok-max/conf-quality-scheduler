export type InspectionScheduleInput = {
  id: number;
  name: string;
  intervalMonths: number;
  lastManufactureDate: string | null;
  testItems: string;
  isActive: boolean;
  productionStatus: "active" | "stopped";
  productionStoppedAt: string | null;
  productionStopReason: string | null;
  alertStatus: "active" | "paused";
  alertPausedAt: string | null;
  alertPauseReason: string | null;
};

export type InspectionStatus = "pending" | "safe" | "urgent" | "overdue" | "stopped" | "paused";

export type InspectionSchedule = InspectionScheduleInput & {
  nextDeadline: string | null;
  daysRemaining: number | null;
  status: InspectionStatus;
};

export type ProductScheduleInput = {
  id: number;
  inspectionTypeId: number;
  name: string;
  intervalMonths: number;
  lastManufactureDate: string | null;
  isActive: boolean;
  productionStatus: "active" | "stopped";
  alertStatus: "active" | "paused";
  parentTypeName: string;
};

export type ProductSchedule = ProductScheduleInput & {
  nextDeadline: string | null;
  daysRemaining: number | null;
  status: InspectionStatus;
};

export const DEFAULT_INSPECTION_TYPES = [
  { name: "액상차", intervalMonths: 2, lastManufactureDate: null, testItems: "세균수, 대장균군, 타르색소, 보존료" },
  { name: "음료베이스", intervalMonths: 2, lastManufactureDate: null, testItems: "세균수, 대장균군, 타르색소, 보존료" },
  { name: "인삼·홍삼음료", intervalMonths: 2, lastManufactureDate: null, testItems: "세균수, 대장균군, 타르색소, 보존료, 인삼성분(진세노사이드 등)" },
  { name: "과·채주스", intervalMonths: 2, lastManufactureDate: "2026-05-19", testItems: "세균수, 대장균군, 타르색소, 보존료" },
  { name: "혼합음료", intervalMonths: 2, lastManufactureDate: "2026-04-29", testItems: "세균수, 대장균군, 타르색소, 보존료" },
  { name: "커피", intervalMonths: 2, lastManufactureDate: null, testItems: "세균수, 대장균군, 타르색소, 보존료, 세균수(살균제품에 한함)" },
  { name: "벌꿀(사양벌꿀 포함)", intervalMonths: 6, lastManufactureDate: null, testItems: "전화당, 자당, 타르색소, 이소말토올리고당 등" },
  { name: "캔디류", intervalMonths: 3, lastManufactureDate: null, testItems: "사카린나트륨, 타르색소, 세균수(충전캔디에 한함)" },
  { name: "기타가공품", intervalMonths: 3, lastManufactureDate: null, testItems: "타르색소, 보존료, 대장균(살균제품), 세균수(멸균제품)" },
  { name: "당류가공품", intervalMonths: 3, lastManufactureDate: null, testItems: "대장균군(살균제품), 세균수(멸균제품), 타르색소" },
] as const;

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function kstDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addMonthsToIsoDate(isoDate: string, months: number): string {
  const source = parseIsoDate(isoDate);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth() + months;
  const day = source.getUTCDate();
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatUtcDate(new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))));
}

export function daysBetweenIsoDates(fromDate: string, toDate: string): number {
  return Math.round((parseIsoDate(toDate).getTime() - parseIsoDate(fromDate).getTime()) / 86_400_000);
}

export function buildInspectionSchedule(
  item: InspectionScheduleInput,
  warningDays: number,
  referenceDate = kstDateString()
): InspectionSchedule {
  if (item.productionStatus === "stopped") {
    return { ...item, nextDeadline: null, daysRemaining: null, status: "stopped" };
  }
  if (item.alertStatus === "paused") {
    return { ...item, nextDeadline: null, daysRemaining: null, status: "paused" };
  }
  if (!item.lastManufactureDate) {
    return { ...item, nextDeadline: null, daysRemaining: null, status: "pending" };
  }

  const nextDeadline = addMonthsToIsoDate(item.lastManufactureDate, item.intervalMonths);
  const daysRemaining = daysBetweenIsoDates(referenceDate, nextDeadline);
  const status: InspectionStatus = daysRemaining < 0 ? "overdue" : daysRemaining <= warningDays ? "urgent" : "safe";
  return { ...item, nextDeadline, daysRemaining, status };
}

export function buildProductSchedule(
  product: ProductScheduleInput,
  warningDays: number,
  referenceDate = kstDateString()
): ProductSchedule {
  if (product.productionStatus === "stopped") return { ...product, nextDeadline: null, daysRemaining: null, status: "stopped" };
  if (product.alertStatus === "paused") return { ...product, nextDeadline: null, daysRemaining: null, status: "paused" };
  if (!product.lastManufactureDate) return { ...product, nextDeadline: null, daysRemaining: null, status: "pending" };
  const nextDeadline = addMonthsToIsoDate(product.lastManufactureDate, product.intervalMonths);
  const daysRemaining = daysBetweenIsoDates(referenceDate, nextDeadline);
  const status: InspectionStatus = daysRemaining < 0 ? "overdue" : daysRemaining <= warningDays ? "urgent" : "safe";
  return { ...product, nextDeadline, daysRemaining, status };
}

export function formatDeadline(isoDate: string | null): string {
  if (!isoDate) return "-";
  const [year, month, day] = isoDate.split("-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}
