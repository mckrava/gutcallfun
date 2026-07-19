import { Logger, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SubscribeDto } from './dto/subscribe.dto';
import { ReactionMessageDto } from './dto/reaction-message.dto';
import { AuthService } from '../auth/auth.service';
import { LiveBroadcastEmitter } from '../live/events/live-broadcast.emitter';
import { LiveStateService } from '../live/live-state.service';

/**
 * The gateway's own CORS configuration, independent of `app.enableCors()`
 * (REST) — in NestJS 11, configuring only the HTTP side silently leaves the
 * socket.io handshake blocked while REST appears to work.
 *
 * Set to `origin: '*'` to match `main.ts`'s REST policy for this live run: the
 * UI is being developed against an arbitrary origin and cannot be pinned to
 * `WEB_APP_ORIGIN`.
 *
 * This is not the security downgrade it looks like, because the previous value
 * was never an access control either: `cors.origin` only sets a response
 * *header* and installs no handshake guard, there is no `allowRequest` hook,
 * and CORS does not apply to the WebSocket upgrade at all (it covers only
 * socket.io's polling XHR). Any client using `transports: ['websocket']`
 * already completed the handshake from any origin — live-verified during Phase
 * 02.1. The real gap is the absence of a server-side origin check plus auth,
 * tracked at `.planning/todos/pending/ws-handshake-origin-not-enforced.md`, and
 * it must be closed before this socket serves anything user-scoped.
 *
 * Because `origin` is now a literal, the previous `process.env.WEB_APP_ORIGIN`
 * read at class-decoration time (the one documented ConfigService exception) is
 * no longer needed here at all.
 */
@WebSocketGateway({
  cors: { origin: '*', credentials: false },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /**
   * This gateway's own bookkeeping of which `game:*` rooms each connected
   * socket has subscribed to, keyed by socket id. Verified against the
   * installed socket.io 4.8.3 (`node_modules/socket.io/dist/socket.js`,
   * `_onclose`): the socket's internal `_cleanup()` -> `leaveAll()` call
   * removes it from every room BEFORE the `disconnect` event that NestJS's
   * `handleDisconnect` hook is bound to. By the time `handleDisconnect` runs,
   * `client.rooms` is already empty and cannot be used to discover which rooms
   * the departing client belonged to.
   */
  private readonly subscribedRooms = new Map<string, Set<string>>();

  constructor(
    private readonly broadcast: LiveBroadcastEmitter,
    private readonly liveState: LiveStateService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Handshake auth (closes ws-handshake-origin-not-enforced). The browser never
   * holds the JWT — the Next.js server mints a single-use ticket via
   * POST /auth/ws-ticket and the browser presents it as socket.io
   * `auth: { ticket }`. We exchange it for a user id exactly once here and pin
   * it to the socket; a missing/invalid/expired ticket is disconnected.
   */
  handleConnection(client: Socket): void {
    const auth = client.handshake.auth as { ticket?: unknown } | undefined;
    const ticket = typeof auth?.ticket === 'string' ? auth.ticket : null;
    const userId = ticket ? this.auth.consumeWsTicket(ticket) : null;
    if (!userId) {
      this.logger.warn(
        `Rejected socket ${client.id}: missing, invalid, or expired ticket`,
      );
      client.disconnect();
      return;
    }
    // socket.io types `data` as `any`; pin the authenticated principal on it.
    (client.data as { user?: { userId: string } }).user = { userId };
  }

  /**
   * Forward every live-engine emission to its game's room.
   *
   * This gateway is now a dumb transport: the live engine produces
   * already-mapped, contract-shaped payloads and this only routes them. Event
   * names (`snapshot`, `game_event`, `question`, `resolution`, `void`) and room
   * naming (`game:{game_id}`) are unchanged — only the data source did.
   *
   * There is no longer any per-room cycle to start or stop: emissions are
   * driven by the real match feed, so a room with no subscribers simply has
   * nobody to deliver to.
   */
  onModuleInit(): void {
    this.broadcast.on((message) => {
      try {
        this.server
          ?.to(`game:${message.gameId}`)
          .emit(message.event, message.payload);
      } catch (err) {
        this.logger.error(
          `Failed to broadcast ${message.event} to game:${message.gameId}`,
          err as Error,
        );
      }
    });
  }

  /**
   * Dev-only WS simulator seam. Emits an arbitrary event to a game's room,
   * exactly like the live engine's own broadcasts — including `snapshot`,
   * which the frozen LiveBroadcast union deliberately omits (it is normally
   * sent only on subscribe). DevController scripts a live match through this;
   * nothing on the production path calls it.
   */
  emitToGame(gameId: number, event: string, payload: unknown): void {
    this.server?.to(`game:${gameId}`).emit(event, payload);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() body: SubscribeDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const room = `game:${body.game_id}`;
    void client.join(room);
    this.trackRoom(client.id, room);

    // Real current state: live score, clock, possession stage, and the
    // currently open question when one exists (WS-01/WS-02). A client joining
    // mid-window now sees the card everyone else is already answering, instead
    // of the unconditional `active_question: null` the mock returned.
    try {
      client.emit('snapshot', await this.liveState.buildSnapshot(body.game_id));
    } catch (err) {
      this.logger.error(
        `Failed to build snapshot for game ${body.game_id}`,
        err as Error,
      );
    }
  }

  /**
   * Ephemeral squad reaction relay. RELAY-ONLY — nothing is persisted. The
   * sender's `user_id` is taken from the authenticated socket, never the
   * payload; the reaction is fanned out to everyone ELSE in the game room
   * (`client.to` excludes the sender, who shows it optimistically). Receivers
   * render it only when `squad_id` matches their own picked squad, so a reaction
   * is scoped to the sender's squad without any DB read or per-squad rooms.
   */
  @SubscribeMessage('reaction')
  handleReaction(
    @MessageBody() body: ReactionMessageDto,
    @ConnectedSocket() client: Socket,
  ): void {
    const user = (client.data as { user?: { userId: string } }).user;
    if (!user) return; // unauthenticated sockets are already disconnected
    client.to(`game:${body.game_id}`).emit('reaction', {
      game_id: body.game_id,
      squad_id: body.squad_id,
      user_id: user.userId,
      handle: body.handle,
      avatar: body.avatar,
      emoji: body.emoji,
    });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: SubscribeDto,
    @ConnectedSocket() client: Socket,
  ): void {
    const room = `game:${body.game_id}`;
    void client.leave(room);
    this.untrackRoom(client.id, room);
  }

  handleDisconnect(client: Socket): void {
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
}
