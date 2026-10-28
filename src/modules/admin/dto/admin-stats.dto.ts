import { z } from 'zod';

export const AdminRevenueQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(12).default(6),
});

export type AdminRevenueQueryDto = z.infer<typeof AdminRevenueQuerySchema>;

export const MonthlyRevenueSchema = z.object({
  /** `YYYY-MM` in Asia/Jakarta. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  orders: z.number().int().nonnegative(),
  invoices: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const AdminRevenueStatsSchema = z.object({
  months: z.array(MonthlyRevenueSchema),
  currentMonth: z.object({
    total: z.number().int().nonnegative(),
    paidCount: z.number().int().nonnegative(),
  }),
  pendingResults: z.number().int().nonnegative(),
});

export type AdminRevenueStats = z.infer<typeof AdminRevenueStatsSchema>;
