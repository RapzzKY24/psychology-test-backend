import type { MonthlyAmountRow } from '../repository/admin-stats.repository';

export interface MonthlyRevenueBucket {
  month: string;
  orders: number;
  invoices: number;
  total: number;
}

/**
 * Months without a single payment must still show up on the axis, so the
 * bucket list is driven by the requested keys, not by the rows that came back.
 */
export function mergeMonthlyRevenue(
  keys: string[],
  orders: MonthlyAmountRow[],
  invoices: MonthlyAmountRow[],
): MonthlyRevenueBucket[] {
  const ordersByMonth = new Map(orders.map((row) => [row.month, row.total]));
  const invoicesByMonth = new Map(
    invoices.map((row) => [row.month, row.total]),
  );

  return keys.map((month) => {
    const orderAmount = ordersByMonth.get(month) ?? 0;
    const invoiceAmount = invoicesByMonth.get(month) ?? 0;
    return {
      month,
      orders: orderAmount,
      invoices: invoiceAmount,
      total: orderAmount + invoiceAmount,
    };
  });
}
