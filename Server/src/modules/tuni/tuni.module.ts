import { Module } from '@nestjs/common';
import { TuniController } from './tuni.controller.js';
@Module({ controllers: [TuniController] })
export class TuniModule {}
