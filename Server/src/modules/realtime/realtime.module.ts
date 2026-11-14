import { Module } from '@nestjs/common';
import { ObservationsModule } from '../observations/observations.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimePublisher } from './realtime.publisher.js';

@Module({
  imports: [ObservationsModule],
  providers: [RealtimeGateway, RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
