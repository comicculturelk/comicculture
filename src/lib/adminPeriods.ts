export const ADMIN_PERIODS = [
  ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'], ['all', 'All time'],
] as const;

export type AdminPeriod = typeof ADMIN_PERIODS[number][0];
