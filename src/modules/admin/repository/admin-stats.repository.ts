export const ADMIN_STATS_REPOSITORY = 'AdminStatsRepository';

export interface MonthlyAmountRow {
  /** Calendar month in Asia/Jakarta, formatted `YYYY-MM`. */
  month: string;
  total: number;
}

export interface AdminRevenueRows {
  orders: MonthlyAmountRow[];
  invoices: MonthlyAmountRow[];
  /** Paid orders + paid invoices whose payment landed in the current WIB month. */
  currentMonthPaidCount: number;
  pendingResults: number;
}

export interface AdminStatsRepository {
  findRevenue(params: {
    since: Date;
    currentMonthStart: Date;
  }): Promise<AdminRevenueRows>;
}
