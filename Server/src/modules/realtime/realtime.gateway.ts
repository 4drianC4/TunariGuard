import { Logger, UseFilters } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';
import { WsExceptionFilter } from '../../infrastructure/websocket/ws-exception.filter.js';
import {
  ClientEvents,
  REALTIME_NAMESPACE,
  ROOM_ALL,
  districtRoom,
  type SubscribeAck,
} from './realtime.contract.js';

const subscribeSchema = z
  .object({ districts: z.array(z.string().trim().min(1)).max(50).optional() })
  .default({});

/**
 * Canal Socket.IO. Solo gestiona conexiones y salas; el contenido lo decide RealtimePublisher.
 * El CORS lo aplica ConfiguredIoAdapter con CORS_ORIGINS. La validación la hace el pipe global
 * (StandardSchemaValidationPipe) y WsExceptionFilter devuelve el error al cliente.
 */
@UseFilters(new WsExceptionFilter())
@WebSocketGateway({ namespace: REALTIME_NAMESPACE })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  /** Último valor de los eventos de estado, para entregarlo a quien se conecta después. */
  private readonly sticky = new Map<string, unknown>();

  @WebSocketServer()
  private readonly server!: Namespace;

  async handleConnection(client: Socket): Promise<void> {
    await client.join(ROOM_ALL);
    for (const [event, payload] of this.sticky) client.emit(event, payload);
  }

  @SubscribeMessage(ClientEvents.Subscribe)
  async subscribe(
    @MessageBody({ schema: subscribeSchema }) body: z.infer<typeof subscribeSchema>,
    @ConnectedSocket() client: Socket,
  ): Promise<SubscribeAck> {
    const target = body.districts?.length ? body.districts.map(districtRoom) : [ROOM_ALL];
    for (const room of client.rooms) {
      if (room !== client.id && !target.includes(room)) await client.leave(room);
    }
    await client.join(target);
    return { rooms: target };
  }

  emitToRoom(room: string, event: string, payload: unknown): void {
    this.server.to(room).emit(event, payload);
  }

  /** Emite a todos y recuerda el valor para los clientes que se conecten más tarde. */
  emitSticky(event: string, payload: unknown): void {
    this.sticky.set(event, payload);
    this.server.emit(event, payload);
  }

  emitToAll(event: string, payload: unknown): void {
    this.server.emit(event, payload);
  }

  get connectedClients(): number {
    return this.server?.sockets.size ?? 0;
  }

  logSummary(message: string): void {
    this.logger.log(`${message} (${this.connectedClients} clientes conectados)`);
  }
}
