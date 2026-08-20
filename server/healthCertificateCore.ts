export type HealthCertificateScheduleInput = {
  id: number;
  employeeName: string;
  department: string | null;
  issuedAt: string;
  expiresAt: string;
  warningDays: number;
  alertStatus: "active" | "paused";
  employmentStatus: "active" | "inactive";
  fileName?: string | null;
  storageKey?: string | null;
  memo?: string | null;
};

export type HealthCertificateStatus =
  | "overdue"
  | "urgent"
  | "safe"
  | "paused"
  | "inactive";

function utcDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addMonthsToDate(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + months, day));
  return next.toISOString().slice(0, 10);
}

export function buildHealthCertificateSchedule<
  T extends HealthCertificateScheduleInput,
>(input: T, referenceDate: string) {
  const daysRemaining = Math.round(
    (utcDay(input.expiresAt) - utcDay(referenceDate)) / 86_400_000
  );
  const status: HealthCertificateStatus =
    input.employmentStatus === "inactive"
      ? "inactive"
      : input.alertStatus === "paused"
        ? "paused"
        : daysRemaining < 0
          ? "overdue"
          : daysRemaining <= input.warningDays
            ? "urgent"
            : "safe";
  return { ...input, daysRemaining, status };
}
