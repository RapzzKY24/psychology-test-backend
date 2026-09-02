import { Controller, Get } from '@nestjs/common';
import { Roles } from '@thallesp/nestjs-better-auth';

@Controller('api/v1/psychologist')
export class PsychologistController {
  @Get('ping')
  @Roles(['PSYCHOLOGIST'])
  ping() {
    return { message: 'psychologist pong' };
  }
}
