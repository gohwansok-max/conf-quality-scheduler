export type CountdownStatus = "pending" | "safe" | "urgent" | "overdue" | "stopped" | "paused";

type CountdownItem = {
  status: CountdownStatus;
  nextDeadline: string | null;
  daysRemaining: number | null;
};

const priority: Record<CountdownStatus, number> = {
  overdue: 0,
  urgent: 1,
  safe: 2,
  pending: 3,
  paused: 4,
  stopped: 5,
};

export function getProductCountdowns<T extends CountdownItem>(items: T[], limit = 6) {
  return items
    .filter(item => item.nextDeadline && ["overdue", "urgent", "safe"].includes(item.status))
    .sort((left, right) => priority[left.status] - priority[right.status] || (left.daysRemaining ?? 9999) - (right.daysRemaining ?? 9999))
    .slice(0, limit);
}

export function countExcludedCountdowns<T extends Pick<CountdownItem, "status">>(items: T[]) {
  return items.filter(item => item.status === "stopped" || item.status === "paused").length;
}
