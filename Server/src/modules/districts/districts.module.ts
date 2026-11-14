import { Module } from '@nestjs/common';
import { ObservationsModule } from '../observations/observations.module.js';
import { DistrictsController } from './districts.controller.js';
import { DistrictsRepository } from './districts.repository.js';
import { DistrictsService } from './districts.service.js';

@Module({
  imports: [ObservationsModule],
  controllers: [DistrictsController],
  providers: [DistrictsService, DistrictsRepository],
})
export class DistrictsModule {}
