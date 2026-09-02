import { z } from 'zod';

export const PutItemsSchema = z.object({
  items: z.array(
    z.object({
      content: z
        .unknown()
        .describe('Validated per scorerType in service via getItemSchema'),
    }),
  ),
});

export type PutItemsDto = z.infer<typeof PutItemsSchema>;
