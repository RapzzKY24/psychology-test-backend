import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ErrorResponse } from '../interfaces/api-response.interface';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let body: ErrorResponse;

    if (typeof exceptionResponse === 'string') {
      body = {
        statusCode: status,
        message: exceptionResponse,
        error: exception.name,
      };
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const res = exceptionResponse as Record<string, unknown>;
      body = {
        statusCode: status,
        message: (res.message as string) ?? exception.message,
        error: (res.error as string) ?? exception.name,
        details: res.details as string[] | undefined,
      };
      // Preserve `details` if present
      if (Array.isArray(res.details)) {
        body.details = res.details as string[];
      }
    } else {
      body = {
        statusCode: status,
        message: exception.message,
        error: exception.name,
      };
    }

    response.status(status).json(body);
  }
}
