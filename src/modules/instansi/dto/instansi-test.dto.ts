import { z } from 'zod';
import { PublicTestSchema } from '../../tests/dto/public-test.dto';

/**
 * Institution-scoped catalog row: `price` is the effective per-seat price
 * (deal or list), `basePrice` is the website price for the struck-through
 * reference, and `hasDealPrice` drives the "Harga Khusus" badge.
 */
export const InstansiTestSchema = PublicTestSchema.extend({
  basePrice: z.number().int(),
  hasDealPrice: z.boolean(),
});

export type InstansiTestDto = z.infer<typeof InstansiTestSchema>;
