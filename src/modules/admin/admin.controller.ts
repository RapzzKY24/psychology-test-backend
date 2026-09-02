import { Controller, Get } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';

@Controller('api/v1/admin')
export class AdminController {
  @Get('ping')
  @Roles(['ADMIN'])
  ping() {
    return { message: 'admin pong' };
  }
}
