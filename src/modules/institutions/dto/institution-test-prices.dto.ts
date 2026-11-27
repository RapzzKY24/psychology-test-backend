import { z } from 'zod';

/**
 * Replace-all deal prices for one institution. `price` is the negotiated
 * per-seat price; 0 is rejected because a Rp 0 invoice can never be paid.
 * Tests omitted from `prices` fall back to `Test.price`.
 */
export const ReplaceInstitutionTestPricesSchema = z
  .object({
    prices: z
      .array(
        z.object({
          testId: z.string().uuid(),
          price: z.number().int().min(1),
        }),
      )
      .refine(
        (rows) => new Set(rows.map((row) => row.testId)).size === rows.length,
        { message: 'testIds must be unique' },
      ),
  })
  .strict();

export type ReplaceInstitutionTestPricesDto = z.infer<
  typeof ReplaceInstitutionTestPricesSchema
>;
