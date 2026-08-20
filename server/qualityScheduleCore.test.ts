import { describe, expect, it } from "vitest";
import { addMonthsToIsoDate, buildInspectionSchedule, buildProductSchedule } from "./qualityScheduleCore";

describe("자가품질검사 일정 계산", () => {
  it("월말 제조일에도 검사 주기를 정확히 더한다", () => {
    expect(addMonthsToIsoDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToIsoDate("2026-12-31", 2)).toBe("2027-02-28");
  });

  it("마감일 기준으로 기간 초과·임박·여유 상태를 구분한다", () => {
    const input = {
      id: 1,
      name: "액상차",
      intervalMonths: 2,
      lastManufactureDate: "2026-05-19",
      testItems: "세균수",
      isActive: true,
      productionStatus: "active" as const,
      productionStoppedAt: null,
      productionStopReason: null,
      alertStatus: "active" as const,
      alertPausedAt: null,
      alertPauseReason: null,
    };

    expect(buildInspectionSchedule(input, 14, "2026-08-19")).toMatchObject({
      nextDeadline: "2026-07-19",
      daysRemaining: -31,
      status: "overdue",
    });
    expect(buildInspectionSchedule({ ...input, lastManufactureDate: "2026-06-25" }, 14, "2026-08-19")).toMatchObject({
      status: "urgent",
      daysRemaining: 6,
    });
  });

  it("생산이 중단된 품목은 검사 마감 및 알림 대상에서 제외한다", () => {
    const schedule = buildInspectionSchedule({
      id: 2,
      name: "혼합음료",
      intervalMonths: 2,
      lastManufactureDate: "2026-04-29",
      testItems: "세균수",
      isActive: true,
      productionStatus: "stopped",
      productionStoppedAt: "2026-08-19",
      productionStopReason: "생산계획 없음",
      alertStatus: "active",
      alertPausedAt: null,
      alertPauseReason: null,
    }, 14, "2026-08-19");

    expect(schedule).toMatchObject({ status: "stopped", nextDeadline: null, daysRemaining: null });
  });

  it("유형별 알림이 일시 중지된 품목은 마감과 발송 대상에서 제외한다", () => {
    const schedule = buildInspectionSchedule({
      id: 3,
      name: "액상차",
      intervalMonths: 2,
      lastManufactureDate: "2026-04-29",
      testItems: "세균수",
      isActive: true,
      productionStatus: "active",
      productionStoppedAt: null,
      productionStopReason: null,
      alertStatus: "paused",
      alertPausedAt: "2026-08-19",
      alertPauseReason: "시즌 생산 대기",
    }, 14, "2026-08-19");

    expect(schedule).toMatchObject({ status: "paused", nextDeadline: null, daysRemaining: null });
  });

  it("제품마다 독립된 검사 주기와 제조일로 사전 알림 마감일을 계산한다", () => {
    const schedule = buildProductSchedule({
      id: 41, inspectionTypeId: 4, parentTypeName: "과채주스", name: "사과주스 1L", intervalMonths: 1,
      lastManufactureDate: "2026-07-25", isActive: true, productionStatus: "active", alertStatus: "active",
    }, 14, "2026-08-19");

    expect(schedule).toMatchObject({ nextDeadline: "2026-08-25", daysRemaining: 6, status: "urgent" });
  });
});
