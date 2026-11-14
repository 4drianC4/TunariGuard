import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

/**
 * Convierte errores HTTP (p. ej. el 400 del pipe de validación global) en errores WebSocket
 * legibles; sin esto, Socket.IO los reporta como "Internal server error".
 * Si el cliente envió el mensaje con ack, recibe `{ error }` como respuesta; si no, el evento
 * `exception` habitual de Nest.
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const error = exception instanceof HttpException ? new WsException(messageOf(exception)) : exception;

    // Argumentos: [socket, data, ack?, patrón]. El ack es el único que es función.
    const ack = host.getArgs<unknown[]>().find((arg) => typeof arg === 'function');
    if (error instanceof WsException && typeof ack === 'function') {
      (ack as (response: unknown) => void)({ error: error.getError() });
      return;
    }
    super.catch(error, host);
  }
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : exception.message;
}
