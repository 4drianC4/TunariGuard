import { Module } from '@nestjs/common';
import { ObservationsModule } from '../observations/observations.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ReplayController } from './replay.controller.js';
import { ReplayService } from './replay.service.js';

@Module({
  imports: [ObservationsModule, RealtimeModule],
  controllers: [ReplayController],
  providers: [ReplayService],
})
export class ReplayModule {}
