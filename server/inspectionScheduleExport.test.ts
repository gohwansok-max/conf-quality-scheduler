import { describe, expect, it } from "vitest";
import { buildInspectionStatusWorkbook, getExportStatusDetail, sortExportSchedules } from "./inspectionScheduleExport";

const schedule = (name: string, status: "pending" | "safe" | "urgent" | "overdue" | "stopped" | "paused", daysRemaining: number | null) => ({
  id: 1,
  inspectionTypeId: 1,
  name,
  parentTypeName: "과·채주스",
  intervalMonths: 2,
  lastManufactureDate: "2026-05-19",
  nextDeadline: "2026-07-19",
  daysRemaining,
  status,
  isActive: true,
  productionStatus: status === "stopped" ? "stopped" as const : "active" as const,
  alertStatus: status === "paused" ? "paused" as const : "active" as const,
  productionStopReason: status === "stopped" ? "계절 품목" : null,
  alertPauseReason: status === "paused" ? "일정 조정" : null,
});

describe("제품별 검사 현황 엑셀 내보내기", () => {
  it("기간 초과, 사전 알림, 정상 순으로 제품을 정렬한다", () => {
    expect(sortExportSchedules([schedule("정상", "safe", 20), schedule("임박", "urgent", 3), schedule("초과", "overdue", -2)]).map(item => item.name)).toEqual(["초과", "임박", "정상"]);
  });

  it("생산 중단과 알림 중지 사유를 엑셀 상태 상세에 표시한다", () => {
    expect(getExportStatusDetail(schedule("중단", "stopped", null))).toContain("계절 품목");
    expect(getExportStatusDetail(schedule("중지", "paused", null))).toContain("일정 조정");
  });

  it("한글 헤더와 상태 서식이 포함된 워크북을 만든다", () => {
    const workbook = buildInspectionStatusWorkbook([schedule("초과", "overdue", -2)], "2026-08-19");
    const sheet = workbook.getWorksheet("제품 검사 현황");
    expect(sheet?.getCell("B2").value).toBe("코엔에프 제품별 자가품질검사 현황");
    expect(sheet?.getCell("B6").value).toBe("식품 유형");
    expect(sheet?.getCell("H7").value).toBe("기간 초과");
    expect(sheet?.getCell("H7").fill.fgColor?.argb).toBe("FFFFEBEE");
  });
});
