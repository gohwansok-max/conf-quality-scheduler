import { describe, expect, it } from "vitest";
import { buildExpirationStats } from "../shared/expirationStats";

describe("buildExpirationStats", () => {
  it("만료 임박 구간과 식품유형별 분포를 올바르게 집계한다", () => {
    const stats = buildExpirationStats([
      { parentTypeName: "과채주스", daysRemaining: -2 },
      { parentTypeName: "과채주스", daysRemaining: 3 },
      { parentTypeName: "혼합음료", daysRemaining: 15 },
      { parentTypeName: "혼합음료", daysRemaining: 45 },
    ]);

    expect(stats).toMatchObject({ total: 4, overdue: 1, critical: 1, upcoming: 1, later: 1 });
    expect(stats.typeDistribution).toEqual([
      { typeName: "과채주스", overdue: 1, critical: 1, upcoming: 0 },
      { typeName: "혼합음료", overdue: 0, critical: 0, upcoming: 1 },
    ]);
    expect(stats.trend[3]).toMatchObject({ day: 3, count: 1 });
    expect(stats.trend[15]).toMatchObject({ day: 15, count: 1 });
    expect(stats.trend[0]).toMatchObject({ day: 0, count: 0 });
  });
});
