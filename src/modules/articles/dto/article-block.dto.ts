import { z } from 'zod';

/**
 * Rich-text article body is stored as an array of structured blocks — never
 * raw HTML. The public page renders each block by type, so no
 * `dangerouslySetInnerHTML` is needed and stored XSS is impossible.
 */
export const ArticleBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    text: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal('paragraph'),
    text: z.string().min(1).max(5000),
  }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean().default(false),
    items: z.array(z.string().min(1).max(1000)).min(1).max(50),
  }),
  z.object({
    type: z.literal('image'),
    // Local uploads only — blocks can never point at external/JS URLs.
    url: z.string().regex(/^\/uploads\/articles\/[a-f0-9-]+\.(png|jpg)$/),
    caption: z.string().max(300).optional(),
  }),
]);

export const ArticleContentSchema = z.array(ArticleBlockSchema).min(1).max(200);

export type ArticleBlock = z.infer<typeof ArticleBlockSchema>;
export type ArticleContent = z.infer<typeof ArticleContentSchema>;
