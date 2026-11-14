import { Module } from '@nestjs/common';
import { AnalisisModule } from '../analisis/analisis.module.js';
import { TuniChatService } from './tuni-chat.service.js';
import { TuniDatosService } from './tuni-datos.service.js';
import { TuniDocumentosService } from './tuni-documentos.service.js';
import { TuniOpenaiService } from './tuni-openai.service.js';
import { TuniController } from './tuni.controller.js';

@Module({
  imports: [AnalisisModule],
  controllers: [TuniController],
  providers: [TuniChatService, TuniDatosService, TuniDocumentosService, TuniOpenaiService],
})
export class TuniModule {}
