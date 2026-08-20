export type ExpirationSchedule = {
  parentTypeName?: string | null;
  daysRemaining: number | null;
};

export type ExpirationStats = {
  total: number;
  overdue: number;
  critical: number;
  upcoming: number;
  later: number;
  typeDistribution: Array<{ typeName: string; overdue: number; critical: number; upcoming: number }>;
  trend: Array<{ day: number; label: string; count: number }>;
};

export function buildExpirationStats(schedules: ExpirationSchedule[]): ExpirationStats {
  const stats: ExpirationStats = { total: schedules.length, overdue: 0, critical: 0, upcoming: 0, later: 0, typeDistribution: [], trend: Array.from({ length: 30 }, (_, day) => ({ day, label: day % 5 === 0 ? `D+${day}` : "", count: 0 })) };
  const types = new Map<string, { overdue: number; critical: number; upcoming: number }>();

  schedules.forEach(schedule => {
    const days = schedule.daysRemaining;
    if (days === null) return;
    const typeName = schedule.parentTypeName || "식품유형 미지정";
    const type = types.get(typeName) || { overdue: 0, critical: 0, upcoming: 0 };
    if (days < 0) {
      stats.overdue += 1;
      type.overdue += 1;
    } else if (days <= 7) {
      stats.critical += 1;
      type.critical += 1;
    } else if (days <= 30) {
      stats.upcoming += 1;
      type.upcoming += 1;
    } else {
      stats.later += 1;
    }
    if (days >= 0 && days < 30) stats.trend[days]!.count += 1;
    types.set(typeName, type);
  });

  stats.typeDistribution = Array.from(types.entries())
    .map(([typeName, value]) => ({ typeName, ...value }))
    .filter(item => item.overdue + item.critical + item.upcoming > 0)
    .sort((a, b) => (b.overdue + b.critical + b.upcoming) - (a.overdue + a.critical + a.upcoming))
    .slice(0, 8);
  return stats;
}
