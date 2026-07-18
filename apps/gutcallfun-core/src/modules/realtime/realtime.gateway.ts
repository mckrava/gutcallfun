import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { FakeCycleService } from './fake-cycle.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { buildSnapshot } from '../../mocks/fixtures/realtime.fixtures';

/**
 * The gateway's own CORS configuration (D-06, T-02.1-19). In NestJS 11 this
 * is fully independent of `app.enableCors()` (REST) — configuring only the
 * HTTP side silently leaves the socket.io handshake blocked while REST
 * appears to work.
 *
 * This reads `process.env.WEB_APP_ORIGIN` directly rather than injecting
 * `ConfigService` — the one deliberate, documented exception to this
 * codebase's ConfigService-only config-access rule. The `@WebSocketGateway`
 * decorator's options are evaluated at class-decoration time, before
 * Nest's DI container exists, so `ConfigService` is not injectable here. It
 * is safe because `app-config.schema.ts` validates `WEB_APP_ORIGIN`
 * fail-fast at boot, before any gateway can be instantiated or any
 * handshake can arrive. Do not treat this as licence to bypass
 * `ConfigService` anywhere else in the codebase.
 */
@WebSocketGateway({
  cors: { origin: process.env.WEB_APP_ORIGIN, credentials: false },
})
export class RealtimeGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  /**
   * This gateway's own bookkeeping of which `game:*` rooms each connected
   * socket has subscribed to, keyed by socket id. Verified against the
   * installed socket.io 4.8.3 (`node_modules/socket.io/dist/socket.js`,
   * `_onclose`): the socket's internal `_cleanup()` -> `leaveAll()` call
   * removes it from every room (and updates the adapter's room registry)
   * BEFORE the `disconnect` event is emitted — the event NestJS's
   * `handleDisconnect` hook is bound to. By the time `handleDisconnect`
   * runs, `client.rooms` is already empty and cannot be used to discover
   * which rooms the departing client belonged to, so this gateway tracks
   * membership itself instead.
   */
  private readonly subscribedRooms = new Map<string, Set<string>>();

  constructor(private readonly fakeCycle: FakeCycleService) {}

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() body: SubscribeDto,
    @ConnectedSocket() client: Socket,
  ): void {
    const room = `game:${body.game_id}`;
    void client.join(room);
    this.trackRoom(client.id, room);

    // Emitted synchronously, immediately after the join, so a client
    // joining mid-cycle renders instantly (WS-01). active_question is
    // always null here — the fake cycle has not fired a question yet.
    client.emit('snapshot', buildSnapshot(body.game_id));

    // Idempotent: a second subscriber to an already-active room never
    // doubles the event rate (FakeCycleService's own duplicate guard).
    this.fakeCycle.startCycleForRoom(room, body.game_id, this.server);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: SubscribeDto,
    @ConnectedSocket() client: Socket,
  ): void {
    const room = `game:${body.game_id}`;
    void client.leave(room);
    this.untrackRoom(client.id, room);
    this.stopCycleIfRoomEmpty(room);
  }

  /**
   * For each `game:*` room the departing client had subscribed to (per this
   * gateway's own tracking — see the class-level doc comment), stop that
   * room's cycle if the client was its last member. The adapter's room-size
   * count already excludes the departing socket by the time this hook
   * runs (leaveAll ran first), so a plain size check — no -1 adjustment —
   * is the correct comparison here.
   */
  handleDisconnect(client: Socket): void {
    const rooms = this.subscribedRooms.get(client.id);
    if (!rooms) return;

    for (const room of rooms) {
      this.stopCycleIfRoomEmpty(room);
    }
    this.subscribedRooms.delete(client.id);
  }

  private trackRoom(clientId: string, room: string): void {
    const rooms = this.subscribedRooms.get(clientId) ?? new Set<string>();
    rooms.add(room);
    this.subscribedRooms.set(clientId, rooms);
  }

  private untrackRoom(clientId: string, room: string): void {
    this.subscribedRooms.get(clientId)?.delete(room);
  }

  private stopCycleIfRoomEmpty(room: string): void {
    const size = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
    if (size === 0) {
      this.fakeCycle.stopCycleForRoom(room);
    }
  }
}
