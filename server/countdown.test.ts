import { describe, expect, it } from "vitest";
import { countExcludedCountdowns, getProductCountdowns } from "../client/src/lib/countdown";

const item = (id: string, status: "pending" | "safe" | "urgent" | "overdue" | "stopped" | "paused", daysRemaining: number | null, nextDeadline = "2026-08-30") => ({ id, status, daysRemaining, nextDeadline });

describe("제품별 검사 만료일 카운트다운", () => {
  it("기간 초과, 사전 알림, 정상 순으로 정렬하고 같은 상태에서는 마감이 가까운 제품을 먼저 보인다", () => {
    const countdowns = getProductCountdowns([
      item("safe-later", "safe", 40),
      item("urgent-later", "urgent", 10),
      item("overdue", "overdue", -2),
      item("safe-sooner", "safe", 25),
      item("urgent-sooner", "urgent", 3),
    ]);

    expect(countdowns.map(value => value.id)).toEqual(["overdue", "urgent-sooner", "urgent-later", "safe-sooner", "safe-later"]);
  });

  it("생산 중단·알림 일시 중지·제조일 미입력 제품은 카운트다운 카드에서 제외한다", () => {
    const countdowns = getProductCountdowns([
      item("stopped", "stopped", -5),
      item("paused", "paused", 2),
      item("pending", "pending", null, null),
      item("active", "safe", 30),
    ]);

    expect(countdowns.map(value => value.id)).toEqual(["active"]);
    expect(countExcludedCountdowns([item("stopped", "stopped", -5), item("paused", "paused", 2), item("active", "safe", 30)])).toBe(2);
  });
});
