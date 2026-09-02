import { Controller, Get } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';

@Controller('api/v1/admin')
export class AdminPingController {
  @Get('ping')
  @Roles(['ADMIN'])
  ping(): { message: string } {
    return { message: 'admin pong' };
  }
}
