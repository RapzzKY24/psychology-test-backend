import { z } from 'zod';

export const AmountSchema = z.object({
  value: z.string(),
  currency: z.string(),
});

export const AccessTokenResponseSchema = z.object({
  responseCode: z.string(),
  responseMessage: z.string(),
  accessToken: z.string(),
  tokenType: z.string(),
  expiresIn: z.string().optional(),
});
export type AccessTokenResponse = z.infer<typeof AccessTokenResponseSchema>;

export const CreateVirtualAccountResponseSchema = z.object({
  responseCode: z.string(),
  responseMessage: z.string(),
  virtualAccountData: z.object({
    partnerServiceId: z.string().optional(),
    customerNo: z.string().optional(),
    virtualAccountNo: z.string(),
    virtualAccountName: z.string().optional(),
    virtualAccountTrxType: z.string().optional(),
    trxId: z.string(),
    additionalInfo: z
      .object({
        referenceNo: z.string().optional(),
        howToPayPage: z.string().optional(),
      })
      .passthrough()
      .optional(),
  }),
});
export type CreateVirtualAccountResponse = z.infer<
  typeof CreateVirtualAccountResponseSchema
>;

export const VaInquiryResponseSchema = z.object({
  responseCode: z.string(),
  responseMessage: z.string(),
  virtualAccountData: z
    .object({
      paymentRequestId: z.string().optional(),
      inquiryRequestId: z.string().optional(),
      trxId: z.string().optional(),
      virtualAccountNo: z.string().optional(),
      totalAmount: AmountSchema.optional(),
      paidAmount: AmountSchema.optional(),
      paymentFlagStatus: z.string().optional(),
      paymentFlagReason: z.string().optional(),
      additionalInfo: z
        .object({ bankCode: z.string().optional() })
        .passthrough()
        .optional(),
    })
    .optional(),
});
export type VaInquiryResponse = z.infer<typeof VaInquiryResponseSchema>;

export const CreateVirtualAccountInputSchema = z.object({
  partnerServiceId: z.string(),
  customerNo: z.string(),
  virtualAccountNo: z.string(),
  virtualAccountName: z.string(),
  trxId: z.string(),
  virtualAccountTrxType: z.enum(['C', 'O']),
  totalAmount: AmountSchema,
  expiredDate: z.string().optional(),
  virtualAccountConfig: z.object({ reusableStatus: z.boolean() }).optional(),
  additionalInfo: z
    .object({ channel: z.string().optional() })
    .passthrough()
    .optional(),
});
export type CreateVirtualAccountInput = z.infer<
  typeof CreateVirtualAccountInputSchema
>;

export const InquiryVaInputSchema = z.object({
  partnerServiceId: z.string(),
  customerNo: z.string(),
  virtualAccountNo: z.string(),
  inquiryRequestId: z.string(),
  trxDateInit: z.string(),
  language: z.string().optional(),
  additionalInfo: z.object({ channel: z.string() }).passthrough().optional(),
});
export type InquiryVaInput = z.infer<typeof InquiryVaInputSchema>;

/**
 * Jokul VA payment notification. Jokul only notifies on a successful payment, so
 * the body carries no explicit status; `latestTransactionStatus` is tolerated
 * when a channel includes it. Unknown fields are preserved for the event log.
 */
export const VaCallbackSchema = z
  .object({
    virtualAccountNo: z.string(),
    trxId: z.string().optional(),
    paymentRequestId: z.string().optional(),
    virtualAccountName: z.string().optional(),
    totalAmount: AmountSchema.optional(),
    paidAmount: AmountSchema.optional(),
    partnerServiceId: z.string().optional(),
    customerNo: z.string().optional(),
    trxDateTime: z.string().optional(),
    latestTransactionStatus: z.string().optional(),
    additionalInfo: z
      .object({ latestTransactionStatus: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type VaCallback = z.infer<typeof VaCallbackSchema>;
