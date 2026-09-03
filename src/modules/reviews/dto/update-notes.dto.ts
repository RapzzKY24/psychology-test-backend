import { z } from 'zod';

export const UpdateNotesSchema = z.object({
  notes: z.string().min(1).max(5000),
});

export type UpdateNotesDto = z.infer<typeof UpdateNotesSchema>;
