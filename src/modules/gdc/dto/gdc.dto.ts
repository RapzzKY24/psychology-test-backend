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
  expiresIn: z.string(),
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
        accountNumber: z.string().optional(),
        bankCode: z.string().optional(),
        referenceNo: z.string().optional(),
      })
      .optional(),
  }),
});
export type CreateVirtualAccountResponse = z.infer<
  typeof CreateVirtualAccountResponseSchema
>;

export const VaStatusResponseSchema = z.object({
  responseCode: z.string(),
  responseMessage: z.string(),
  virtualAccountData: z.object({
    paymentRequestId: z.string().optional(),
    inquiryRequestId: z.string().optional(),
    referenceNo: z.string().optional(),
    trxId: z.string().optional(),
    transactionDate: z.string().optional(),
    virtualAccountNo: z.string(),
    totalAmount: AmountSchema.optional(),
    billAmount: AmountSchema.optional(),
    feeAmount: AmountSchema.optional(),
    paymentFlagStatus: z.string().optional(),
    paymentFlagReason: z.string().optional(),
    additionalInfo: z.object({ bankCode: z.string().optional() }).optional(),
  }),
});
export type VaStatusResponse = z.infer<typeof VaStatusResponseSchema>;

export const VaCallbackSchema = z.object({
  partnerServiceId: z.string(),
  customerNo: z.string(),
  virtualAccountNo: z.string(),
  virtualAccountName: z.string(),
  trxId: z.string(),
  paymentRequestId: z.string(),
  sourceBankCode: z.string(),
  paidAmount: AmountSchema,
  totalAmount: AmountSchema,
  trxDateTime: z.string(),
  referenceNo: z.string(),
  additionalInfo: z.object({
    paymentDate: z.string(),
    paymentMethod: z.string(),
    remarks: z.string().optional(),
    transactionType: z.string(),
    latestTransactionStatus: z.string(),
    transactionStatusDesc: z.string(),
  }),
});
export type VaCallback = z.infer<typeof VaCallbackSchema>;

export interface CreateVirtualAccountInput {
  virtualAccountName: string;
  expiredDate: string;
  trxId: string;
  virtualAccountTrxType: 'C' | 'O';
  totalAmount: { value: string; currency: string };
  accountNumber: string;
  bankCode: string;
}

export interface InquiryVaStatusInput {
  virtualAccountNo: string;
  paymentRequestId: string;
}
