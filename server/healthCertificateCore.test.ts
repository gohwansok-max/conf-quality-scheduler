import { describe, expect, it } from "vitest";
import { addMonthsToDate, buildHealthCertificateSchedule } from "./healthCertificateCore";

const base = { id: 1, employeeName: "홍길동", department: "생산팀", issuedAt: "2026-01-01", expiresAt: "2026-08-25", warningDays: 30, alertStatus: "active" as const, employmentStatus: "active" as const };

describe("보건증 유효기간 계산", () => {
  it("발급일에 주기를 더해 만료일을 계산한다", () => {
    expect(addMonthsToDate("2026-01-15", 12)).toBe("2027-01-15");
  });

  it("기간 초과·만료 임박·유효·알림 중지·재직 제외 상태를 구분한다", () => {
    expect(buildHealthCertificateSchedule({ ...base, expiresAt: "2026-08-19" }, "2026-08-20").status).toBe("overdue");
    expect(buildHealthCertificateSchedule(base, "2026-08-20").status).toBe("urgent");
    expect(buildHealthCertificateSchedule({ ...base, expiresAt: "2026-10-01" }, "2026-08-20").status).toBe("safe");
    expect(buildHealthCertificateSchedule({ ...base, alertStatus: "paused" }, "2026-08-20").status).toBe("paused");
    expect(buildHealthCertificateSchedule({ ...base, employmentStatus: "inactive" }, "2026-08-20").status).toBe("inactive");
  });
});
