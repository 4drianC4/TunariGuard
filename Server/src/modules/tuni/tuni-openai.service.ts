import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class TuniOpenaiService {
  private readonly logger = new Logger(TuniOpenaiService.name);
  get disponible(): boolean {
    return !!this.key();
  }

  private key(): string | undefined {
    return process.env['OPENAI_API_KEY']?.trim() || process.env['LLM_API_KEY']?.trim();
  }

  async chat<T>(body: object): Promise<T> {
    const response = await this.solicitar('chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env['TUNI_CHAT_MODEL'] || 'gpt-4o-mini',
        temperature: 0.2,
        ...body,
      }),
    });
    return await response.json() as T;
  }

  async solicitar(path: string, init: RequestInit): Promise<Response> {
    const key = this.key();
    if (!key) throw new ServiceUnavailableException('Tuni no está configurado en el servidor');

    let response: Response;
    try {
      response = await fetch(`https://api.openai.com/v1/${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${key}`, ...init.headers },
        signal: AbortSignal.timeout(path === 'chat/completions' ? 10_000 : 30_000),
      });
    } catch {
      throw new ServiceUnavailableException('No se pudo conectar con el servicio de IA');
    }

    if (!response.ok) {
      this.logger.warn(`OpenAI rechazó la llamada a ${path} con HTTP ${response.status}.`);
      throw new HttpException(
        'El proveedor de IA no pudo completar la solicitud',
        response.status === 429 ? 429 : HttpStatus.BAD_GATEWAY,
      );
    }
    return response;
  }
}
