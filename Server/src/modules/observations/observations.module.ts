import { Module } from '@nestjs/common';
import { ObservationsController } from './observations.controller.js';
import { ObservationsRepository } from './observations.repository.js';
import { ObservationsService } from './observations.service.js';

@Module({
  controllers: [ObservationsController],
  providers: [ObservationsService, ObservationsRepository],
  exports: [ObservationsService],
})
export class ObservationsModule {}
