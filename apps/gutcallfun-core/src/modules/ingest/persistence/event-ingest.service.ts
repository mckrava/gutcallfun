/**
 * Idempotent same-transaction persistence + per-game mutex + state-machine
 * apply + gap detect (INGST-03, INGST-04, INGST-05, STAT-01, STAT-02,
 * RCVR-02).
 *
 * `processEvent(gameId, raw)` is the single source-agnostic entry point:
 * live SSE (Plan 05) and replay (Plan 06) both call this exact same method
 * with a plain gameId + parsed raw feed message — nothing downstream of
 * this line knows or cares which source produced the message (D-02).
 */

import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { GameMutexRegistry } from '../state/game-mutex.registry';
import { GameStateRegistry } from '../state/game-state.registry';
import { GameStateMachine } from '../state/game-state.machine';
import { GameStreamGapEmitter } from '../events/game-stream-gap.emitter';
import { MessageNormalizer } from './message-normalizer';

@Injectable()
export class EventIngestService {
  private readonly logger = new Logger(EventIngestService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly normalizer: MessageNormalizer,
    private readonly mutexRegistry: GameMutexRegistry,
    private readonly stateRegistry: GameStateRegistry,
    private readonly stateMachine: GameStateMachine,
    private readonly gapEmitter: GameStreamGapEmitter,
  ) {}

  /**
   * Process one raw feed message for `gameId`. Idempotent (duplicate
   * (gameId, Seq) leaves exactly one game_event row), per-game serial
   * (STAT-02: wrapped in GameMutexRegistry.runExclusive), and
   * append-only-safe (an unknown Action/StatusId or a malformed message
   * never throws and never corrupts the log or the in-memory state).
   */
  async processEvent(gameId: number, raw: unknown): Promise<void> {
    await this.mutexRegistry.runExclusive(gameId, async () => {
      const normalized = this.normalizer.normalize(raw);
      if (normalized.ignorable || normalized.event === null) {
        // Cannot form an insertable row (missing/invalid Seq or Ts) — never
        // insert, never throw, never touch in-memory state or the cursor.
        this.logger.debug(`Ignoring malformed message for game ${gameId} (no valid Seq/Ts)`);
        return;
      }

      const event = normalized.event;
      const rawObj = raw as Record<string, unknown>;
      const connectionId = this.extractConnectionId(rawObj);

      // Gap detection BEFORE persisting, comparing against the state as of
      // the previously applied event (RCVR-02 / Pitfall 7).
      const state = this.stateRegistry.getOrCreate(gameId);
      const gapResult = this.stateMachine.detectGap(state, event.seq, connectionId);
      if (gapResult.isGap && gapResult.expectedSeq !== null) {
        this.gapEmitter.emit({
          gameId,
          expectedSeq: gapResult.expectedSeq,
          actualSeq: event.seq,
          at: new Date(),
        });
        // Self-heal: continue processing from this message rather than
        // stopping the pipeline. Void+refund consequence is Phase 4's
        // listener body (D-13 seam).
      }

      const lazyFillPatch = this.normalizer.lazyFillPatch(raw) ?? {};

      // Same transaction: game_event insert (orIgnore) + game row
      // stream_cursor/stream_cursor_at flush + INGST-05 lazy-fill patch.
      // N=1 (every event, same transaction) — never a second bare
      // .execute() against the top-level dataSource (Pitfall 4).
      await this.dataSource.transaction(async (manager) => {
        await manager
          .createQueryBuilder()
          .insert()
          .into(GameEventEntity)
          .values({
            gameId,
            type: event.type,
            payload: event.payload,
            actionId: event.actionId,
            seq: event.seq,
            confirmed: event.confirmed,
            participant: event.participant,
            statusId: event.statusId,
            feedTs: event.feedTs,
          } as QueryDeepPartialEntity<GameEventEntity>)
          .orIgnore()
          .execute();

        await manager
          .createQueryBuilder()
          .update(GameEntity)
          .set({
            // Plan 03 has no separate SSE "frame id" argument on
            // processEvent(gameId, raw) — Seq is the per-ConnectionId
            // monotonic cursor value this pipeline layer tracks; Plan 05
            // (SSE client) owns translating the stream's own `id:` block
            // into this call if it ever needs to differ from Seq.
            streamCursor: String(event.seq),
            streamCursorAt: new Date(),
            ...lazyFillPatch,
          })
          .where('id = :gameId', { gameId })
          .execute();
      });

      // Only after a successful commit do we mutate in-memory state —
      // never advance state on a message that failed to persist.
      this.stateMachine.applyEvent(state, rawObj);
    });
  }

  /** Defensive ConnectionId read: `raw.Update ?? raw`, tolerating both the flat SSE and Fusion envelope shapes. */
  private extractConnectionId(raw: Record<string, unknown>): string | null {
    try {
      const inner = (raw.Update ?? raw) as unknown;
      if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return null;
      const connectionId = (inner as Record<string, unknown>).ConnectionId;
      if (typeof connectionId === 'number' || typeof connectionId === 'string') {
        return String(connectionId);
      }
      return null;
    } catch {
      return null;
    }
  }
}
