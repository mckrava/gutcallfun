/**
 * Per-game live SSE connection manager (INGST-02, RPLY-02, INGST-04).
 *
 * Owns exactly one authenticated, resumable, cleanly-abortable connection
 * per live game via the ported `connectWithRetry` client (Task 1). Every
 * received message is handed to `EventIngestService.processEvent(gameId,
 * raw)` — the SAME source-agnostic entry point the replay emitter (Plan 06)
 * calls — with no downstream-visible mode flag added (D-02, RPLY-02).
 *
 * `start(gameId)` is a callable service, not self-scheduled: the single
 * is_replay source-switch scheduler that decides WHEN to call it for a
 * given game lives in Plan 07 (D-02 one-scheduler rule spanning both SSE
 * and replay). This module only knows how to run a live connection once
 * asked to.
 */

import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { EventIngestService } from '../persistence/event-ingest.service';
import { TxlineHttpClient } from '../fixtures/txline-http.client';
import { connectWithRetry, SseBlock } from './upstream';

@Injectable()
export class StreamManagerService implements OnApplicationShutdown {
  private readonly logger = new Logger(StreamManagerService.name);

  /** One AbortController per live game — the sole shutdown/stop seam (INGST-04, RESEARCH Pitfall 5). */
  private readonly controllers = new Map<number, AbortController>();

  constructor(
    private readonly eventIngestService: EventIngestService,
    private readonly txlineHttpClient: TxlineHttpClient,
    @InjectRepository(GameEntity) private readonly gameRepository: Repository<GameEntity>,
  ) {}

  /**
   * Open one authenticated, resumable SSE connection for `gameId`. A second
   * call for the same `gameId` while a connection is already active is a
   * no-op (INGST-02 concurrency edge — reconnect/backoff never spawns a
   * second concurrent connection for the same game). Returns immediately;
   * the connection itself runs in the background until it ends, is
   * `stop()`ped, or the app shuts down.
   */
  start(gameId: number): void {
    if (this.controllers.has(gameId)) {
      this.logger.debug(
        `Game ${gameId}: start() called but a connection is already active — ignoring (INGST-02 concurrency edge)`,
      );
      return;
    }

    const controller = new AbortController();
    this.controllers.set(gameId, controller);

    void this.runConnection(gameId, controller.signal, false).finally(() => {
      // Only clear the map entry if it still points at THIS controller — a
      // stop()/onApplicationShutdown() call may have already replaced or
      // removed it, and a fresh start() for the same gameId may have run in
      // the meantime.
      if (this.controllers.get(gameId) === controller) {
        this.controllers.delete(gameId);
      }
    });
  }

  /** Abort the live connection for `gameId`, if any. No-op if none is active. */
  stop(gameId: number): void {
    const controller = this.controllers.get(gameId);
    if (!controller) return;
    controller.abort();
    this.controllers.delete(gameId);
  }

  /**
   * Abort every active per-game connection (INGST-04 shutdown seam,
   * RESEARCH Pitfall 5). A blocked `reader.read()` is interrupted promptly
   * once its controller aborts (CR-02 fix, 02-REVIEW.md): the per-game
   * controller's signal is threaded into the SSE `fetch()` call itself
   * (transport-level abort) AND an abort listener registered on the active
   * stream reader calls `reader.cancel()`, which resolves a currently
   * blocked `reader.read()` at once — so shutdown does not wait out the 30s
   * idle watchdog for an actively-receiving stream.
   *
   * INGST-04 "stream_cursor flushed on SIGTERM" invariant: this method
   * performs NO separate flush write of its own. Every processEvent call
   * (Plan 03, event-ingest.service.ts) commits the game_event insert and
   * its game.stream_cursor UPDATE in ONE transaction (N=1). Aborting every
   * controller here guarantees no NEW event read starts after this point;
   * any transaction that had already committed before the abort has
   * already persisted its cursor, and any transaction not yet committed
   * persists nothing. So at process exit the persisted stream_cursor is
   * never ahead of the last committed game_event row's seq — the SIGTERM
   * guarantee is inherent to the Plan-03 N=1 design, not something this
   * hook needs to implement separately.
   */
  async onApplicationShutdown(): Promise<void> {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
  }

  /**
   * Run one game's connection to completion. `connectWithRetry` only
   * returns when the caller's AbortSignal fires (clean shutdown/stop) or
   * when TxLINE responds AUTH_EXPIRED (it never loops on 401 itself —
   * RESEARCH Security Domain: 401 retry storm). On AUTH_EXPIRED we
   * re-authenticate exactly once via the shared TxlineHttpClient and retry
   * the connection exactly once more; a second AUTH_EXPIRED is fatal for
   * this game's stream and is never retried again (INGST-01, T-02-05-02).
   */
  private async runConnection(
    gameId: number,
    signal: AbortSignal,
    hasReauthed: boolean,
  ): Promise<void> {
    const game = await this.gameRepository.findOne({ where: { id: gameId } });
    if (!game) {
      this.logger.error(`StreamManagerService: game ${gameId} not found — aborting stream start`);
      return;
    }

    const { jwt, apiToken } = this.txlineHttpClient.getCredentials();
    let authExpired = false;

    await connectWithRetry({
      jwt,
      apiToken,
      fixtureId: String(game.fixtureId),
      // Last-Event-ID resume seam: read from the persisted cursor (Plan 03)
      // on every (re)connect attempt, not a value cached in this closure —
      // game.stream_cursor is the single source of truth (INGST-01/RCVR-02).
      initialLastEventId: game.streamCursor ?? undefined,
      signal,
      onEvent: (receivedAt, block) => this.handleEvent(gameId, receivedAt, block),
      onMeta: (_receivedAt, meta) => {
        if (meta.type === 'auth_expired') {
          authExpired = true;
        }
        this.logger.debug(`Game ${gameId} stream meta: ${JSON.stringify(meta)}`);
      },
    });

    if (signal.aborted) {
      // Clean shutdown/stop path — never reconnect after an intentional abort.
      return;
    }

    if (authExpired && !hasReauthed) {
      this.logger.warn(
        `Game ${gameId}: TxLINE auth expired — re-authenticating once via TxlineHttpClient (INGST-01, never loop)`,
      );
      try {
        await this.txlineHttpClient.refreshAuth();
      } catch (err) {
        this.logger.error(`Game ${gameId}: TxLINE re-auth failed — stopping stream`, err as Error);
        return;
      }
      await this.runConnection(gameId, signal, true);
      return;
    }

    if (authExpired) {
      this.logger.error(
        `Game ${gameId}: TxLINE auth expired again after the one-time re-auth — stopping stream (no retry loop, INGST-01)`,
      );
    }
  }

  /**
   * Handle one non-heartbeat SSE data block: defensively JSON.parse (never
   * crash the stream on a malformed payload — RESEARCH Security Domain V5),
   * then hand the parsed raw message to the source-agnostic pipeline entry
   * point. Fire-and-forget is safe here: EventIngestService.processEvent is
   * itself wrapped in GameMutexRegistry.runExclusive(gameId, ...) (Plan 03,
   * STAT-02), so calls queue and execute strictly in arrival order even
   * without being awaited here.
   */
  private handleEvent(gameId: number, _receivedAt: number, block: SseBlock): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block.data);
    } catch {
      this.logger.warn(`Game ${gameId}: SSE data block failed JSON.parse — skipping`);
      return;
    }

    void this.eventIngestService.processEvent(gameId, parsed).catch((err: unknown) => {
      this.logger.error(`Game ${gameId}: processEvent failed for a stream message`, err as Error);
    });
  }
}
