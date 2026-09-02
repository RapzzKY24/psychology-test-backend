import { z } from 'zod';

export const PutInterpretationsSchema = z.object({
  interpretations: z.array(
    z.object({
      patternCode: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
    }),
  ),
});

export type PutInterpretationsDto = z.infer<typeof PutInterpretationsSchema>;
