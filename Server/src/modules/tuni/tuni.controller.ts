import { BadRequestException, Controller, Post, Body, UploadedFile, UseInterceptors, Res, ServiceUnavailableException, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';

const instructions = `Eres Tuni, asistente de TunariGuard, plataforma de monitoreo forestal del Parque Nacional Tunari. Responde en español claro, breve y amable. Explica MODIS, VIIRS, armonización y navegación. Nunca inventes cantidades de alertas, distritos afectados, fechas, observaciones, pronósticos ni acceso a la base de datos. Si te preguntan por datos actuales, explica que aún no tienes una consulta verificada conectada y remite al módulo de Alertas. Un foco de calor no confirma por sí solo un incendio. No reemplazas los protocolos de emergencia.`;
@Controller('tuni')
export class TuniController {
  private key(): string {
    const key = process.env['OPENAI_API_KEY'] || process.env['LLM_API_KEY'];
    if (!key) throw new ServiceUnavailableException('Tuni no está configurado en el servidor');
    return key;
  }
  private async openai(path: string, init: RequestInit): Promise<globalThis.Response> {
    let response: globalThis.Response;
    try {
      response = await fetch(`https://api.openai.com/v1/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.key()}`, ...init.headers },
        signal: AbortSignal.timeout(30000),
      });
    } catch { throw new ServiceUnavailableException('No se pudo conectar con el servicio de IA'); }
    if (!response.ok) throw new HttpException('El proveedor de IA no pudo completar la solicitud', response.status === 429 ? 429 : HttpStatus.BAD_GATEWAY);
    return response;
  }
  @Post('chat')
  async chat(@Body() body: { message?: string; history?: Array<{ role: string; text: string }> }) {
    const message = body?.message?.trim();
    if (!message || message.length > 1500) throw new BadRequestException('Mensaje inválido (máximo 1500 caracteres)');
    const history = (Array.isArray(body.history) ? body.history : []).slice(-8)
      .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
      .map(m => ({ role: m.role, content: m.text.slice(0,1500) }));
    const response = await this.openai('chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env['TUNI_CHAT_MODEL'] || 'gpt-4o-mini', temperature: 0.2,
        messages: [{ role: 'system', content: instructions }, ...history, { role: 'user', content: message }] }),
    });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return { answer: data.choices?.[0]?.message?.content || 'No pude generar una respuesta.' , dataSource: 'general_knowledge' };
  }
  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async transcribe(@UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.mimetype.startsWith('audio/')) throw new BadRequestException('Archivo de audio inválido');
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname || 'audio.webm');
    const response = await this.openai('audio/transcriptions', { method: 'POST', body: form });
    const data = await response.json() as { text?: string };
    return { text: data.text || '' };
  }
  @Post('speech')
  async speech(@Body() body: { text?: string }, @Res() res: Response) {
    const text = body?.text?.trim();
    if (!text || text.length > 1500) throw new BadRequestException('Texto inválido');
    const response = await this.openai('audio/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', voice: 'nova', input: text, response_format: 'mp3' }) });
    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  }
}
