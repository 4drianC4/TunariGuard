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

@Controller('tuni')
export class TuniController {
  constructor(
    private readonly asistente: TuniChatService,
    private readonly openai: TuniOpenaiService,
  ) {}

  @Post('chat')
  @HttpCode(200)
  async chat(@Body({ schema: chatSchema }) body: ChatBody, @Headers('accept-language') acceptLanguage?: string) {
    const response = await this.asistente.responder(body);
    if (!acceptLanguage?.split(',')[0]?.trim().toLowerCase().startsWith('en')) return response;
    if (!this.openai.disponible) {
      return { ...response, language: 'es', translationAvailable: false };
    }
    try {
      const result = await this.openai.chat<{
        choices: { message: { content: string | null } }[];
      }>({
        temperature: 0,
        max_tokens: 700,
        messages: [
          { role: 'system', content: 'Translate the following Spanish forest-monitoring assistant response into natural English. Preserve all numbers, dates, units, place names, satellite identifiers, uncertainty, caveats and scientific meaning exactly. Do not add information. Output only the translation.' },
          { role: 'user', content: response.answer },
        ],
      });
      const translated = result.choices?.[0]?.message?.content?.trim();
      return translated ? { ...response, answer: translated, language: 'en' } : { ...response, language: 'es', translationAvailable: false };
    } catch {
      return { ...response, language: 'es', translationAvailable: false };
    }
  }

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async transcribe(@UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.mimetype.startsWith('audio/')) throw new BadRequestException('Archivo de audio inválido');
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname || 'audio.webm');
    const response = await this.openai.solicitar('audio/transcriptions', { method: 'POST', body: form });
    const data = await response.json() as { text?: string };
    return { text: data.text || '' };
  }

  @Post('speech')
  async speech(@Body() body: { text?: string }, @Res() res: Response) {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 1500) throw new BadRequestException('Texto inválido');
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
