import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReplayService } from './replay.service.js';
import { startReplaySchema, type StartReplayBody } from './replay.schemas.js';

@ApiTags('replay')
@Controller('replay')
export class ReplayController {
  constructor(private readonly replay: ReplayService) {}

  @Post('start')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reproduce datos históricos como si llegaran en vivo (demo)',
    description:
      'Emite una pasada satelital por intervalo en el evento hotspots:new con mode=replay y ' +
      'simulated=true. No modifica la base. Reemplaza cualquier reproducción en curso.',
  })
  start(@Body({ schema: startReplaySchema }) body: StartReplayBody) {
    return this.replay.start(body);
  }

  @Post('stop')
  @HttpCode(200)
  @ApiOperation({ summary: 'Detiene la reproducción' })
  stop() {
    return this.replay.stop();
  }

  @Get('status')
  @ApiOperation({ summary: 'Estado de la reproducción' })
  status() {
    return this.replay.status();
  }
}
