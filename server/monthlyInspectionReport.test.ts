import { describe, expect, it } from "vitest";
import { buildMonthlyInspectionReportPdf } from "./monthlyInspectionReport";

describe("월간 검사 현황 PDF 보고서", () => {
  it("한글 제품 일정으로 PDF 바이트를 생성한다", async () => {
    const pdf = await buildMonthlyInspectionReportPdf([{
      id: 1, ownerId: 1, inspectionTypeId: 1, name: "사과주스 1L", parentTypeName: "과채주스", intervalMonths: 2,
      lastManufactureDate: "2026-07-01", nextDeadline: "2026-08-30", daysRemaining: 10, status: "urgent",
      productionStatus: "active", productionStoppedAt: null, productionStopReason: null, alertStatus: "active", alertPausedAt: null, alertPauseReason: null,
    }], "2026-08", "2026-08-20");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
  });
});
