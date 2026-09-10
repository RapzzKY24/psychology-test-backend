import { PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import { ZodSchema } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // 422 (not 400): HttpExceptionFilter derives the HTTP status from
      // getStatus(), so the exception class must match the contract.
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'validation_failed',
        error: 'Unprocessable Entity',
        details: result.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      });
    }
    return result.data;
  }
}
