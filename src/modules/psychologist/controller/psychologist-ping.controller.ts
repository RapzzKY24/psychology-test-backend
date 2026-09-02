import { Controller, Get } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';

@Controller('api/v1/psychologist')
export class PsychologistPingController {
  @Get('ping')
  @Roles(['PSYCHOLOGIST'])
  ping(): { message: string } {
    return { message: 'psychologist pong' };
  }
}
