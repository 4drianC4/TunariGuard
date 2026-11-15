import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Headers,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { TuniChatService } from './tuni-chat.service.js';
import { TuniOpenaiService } from './tuni-openai.service.js';
import { chatSchema, type ChatBody } from './tuni.schemas.js';
import { resolveLanguage, t, withLanguage } from '../../shared/i18n/language.js';

@Controller('tuni')
export class TuniController {
  constructor(
    private readonly asistente: TuniChatService,
    private readonly openai: TuniOpenaiService,
  ) {}

  @Post('chat')
  @HttpCode(200)
  async chat(@Body({ schema: chatSchema }) body: ChatBody, @Headers('accept-language') acceptLanguage?: string) {
    const language = resolveLanguage(acceptLanguage);
    return withLanguage(language, async () => ({ ...await this.asistente.responder(body), language }));
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async transcribe(@UploadedFile() file?: Express.Multer.File, @Headers('accept-language') acceptLanguage?: string) {
    if (!file || !file.mimetype.startsWith('audio/')) throw new BadRequestException(t('Archivo de audio inválido'));
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('language', resolveLanguage(acceptLanguage));
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname || 'audio.webm');
    const response = await this.openai.solicitar('audio/transcriptions', { method: 'POST', body: form });
    const data = await response.json() as { text?: string };
    return { text: data.text || '' };
  }

  @Post('speech')
  async speech(@Body() body: { text?: string }, @Res() res: Response) {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 1500) throw new BadRequestException(t('Texto inválido'));
    const response = await this.openai.solicitar('audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', voice: 'nova', input: text, response_format: 'mp3' }),
    });
    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  }
}
