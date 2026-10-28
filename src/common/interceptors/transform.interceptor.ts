import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // Unduhan biner (PDF) harus lewat apa adanya: membungkusnya dengan
        // { data } merusak body dan header Content-Type.
        if (data instanceof StreamableFile) {
          return data as unknown as ApiResponse<T>;
        }
        if (
          data &&
          typeof data === 'object' &&
          'data' in (data as Record<string, unknown>)
        ) {
          return data as unknown as ApiResponse<T>;
        }
        return { data };
      }),
    );
  }
}
