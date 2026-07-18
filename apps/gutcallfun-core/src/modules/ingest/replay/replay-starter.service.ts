/**
 * ReplayStarterService (D-07, RPLY-02, RPLY-03).
 *
 * `start(gameId)` is the only entry point a future scheduler (Plan 07's
 * ~15s replay-arm poller, D-06) needs: it is_replay-guards an auto-wipe of
 * that game's prior game_event rows + denormalized state, then drives the
 * ported replay emitter (replay.ts) into EventIngestService.processEvent —
 * the SAME entry point Plan 05's SSE client calls (RPLY-02: no downstream
 * mode flag; is_replay switches ONLY the source).
 *
 * D-07 guard: a live game's append-only log is sacred — start() refuses
 * (throws, never wipes) when `is_replay=false`. Replay rows are disposable
 * by definition, so re-flipping the same row for take #2 wipes cleanly
 * instead of colliding on UNIQUE(game_id, seq) (RPLY-03).
 *
 * D-04 AMENDMENT (2026-07-18, quick task 260718-3cm): a real fixture's
 * history spans days and contains a single ~4.98-day inter-event gap in
 * the pre-match dead zone (early coverage/comment records, then the ~1h-
 * before-kickoff connected record). Uncompressed, the replay emits two
 * events then appears frozen — `speed` alone does not rescue it (even a
 * 1000x multiplier leaves ~7 minutes of dead air), and D-03 timestamp
 * rebasing does not either (it shifts every timestamp by one constant
 * delta and therefore preserves inter-event spacing). `start()` now passes
 * an explicit, finite `maxGapMs` to `emitReplay` — the emitter's own
 * no-ceiling (`Infinity`) default in replay.ts is untouched; supplying a
 * ceiling from this demo/operator caller is the path replay.ts's own
 * module doc explicitly sanctions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { GameStateRegistry } from '../state/game-state.registry';
import { GameStateMachine } from '../state/game-state.machine';
import { EventIngestService } from '../persistence/event-ingest.service';
import { ReplaySourceService } from './replay-source.service';
import { emitReplay } from './replay';

// D-04: speed>1 is a headless-testing configuration ONLY, never reachable
// from a user-facing surface. `start(gameId)` always accepts an explicit
// speed argument from its (trusted, non-user-facing) caller — REPLAY_SPEED
// is a secondary headless-config fallback for a manually-triggered
// operator run when no explicit argument is supplied.
function headlessSpeedOverride(): number | undefined {
  const raw = process.env.REPLAY_SPEED;
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

// Production default pacing ceiling (D-04 amendment, quick task
// 260718-3cm) — see the class-level JSDoc above for the WHY.
const DEFAULT_REPLAY_MAX_GAP_MS = 5000;

// Mirrors headlessSpeedOverride()'s validation pattern: read
// REPLAY_MAX_GAP_MS, coerce with Number, accept it only when finite and
// greater than zero, otherwise fall back to the default. ALWAYS returns a
// finite number — an absent or malformed env var must never yield
// undefined/Infinity/NaN, since any of those would reintroduce the
// multi-day stall this helper exists to prevent.
function replayMaxGapMs(): number {
  const raw = process.env.REPLAY_MAX_GAP_MS;
  if (raw === undefined) return DEFAULT_REPLAY_MAX_GAP_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REPLAY_MAX_GAP_MS;
}

@Injectable()
export class ReplayStarterService {
  private readonly logger = new Logger(ReplayStarterService.name);

  constructor(
    @InjectRepository(GameEntity)
    private readonly gameRepo: Repository<GameEntity>,
    @InjectRepository(GameEventEntity)
    private readonly gameEventRepo: Repository<GameEventEntity>,
    private readonly stateRegistry: GameStateRegistry,
    private readonly stateMachine: GameStateMachine,
    private readonly replaySource: ReplaySourceService,
    private readonly eventIngest: EventIngestService,
  ) {}

  /**
   * Start (or re-start, for take #2+) a replay for `gameId`. Throws
   * without any side effect when the game does not exist or is not a
   * replay game (`is_replay=false`) — the D-07 guard.
   */
  async start(gameId: number, speed?: number): Promise<void> {
    const game = await this.gameRepo.findOne({ where: { id: gameId } });
    if (!game) {
      throw new Error(`ReplayStarterService.start: game ${gameId} not found`);
    }
    if (!game.isReplay) {
      // D-07 hard guard: a running/naturally-started game's append-only
      // log is never wiped. This is a refusal, not a self-heal — the
      // caller has a real bug if it reaches this branch.
      throw new Error(
        `ReplayStarterService.start: refusing to wipe/replay game ${gameId} — is_replay=false (live log auto-wipe guard, D-07)`,
      );
    }

    await this.wipeAndResetGame(gameId);

    const events = await this.replaySource.load(game);
    if (events.length === 0) {
      this.logger.warn(
        `ReplayStarterService.start: no source events found for game ${gameId} (fixture ${game.fixtureId}) — nothing to replay`,
      );
      return;
    }

    const effectiveSpeed = speed ?? headlessSpeedOverride() ?? 1;
    const maxGapMs = replayMaxGapMs();
    this.logger.log(
      `Starting replay for game ${gameId} (fixture ${game.fixtureId}): ${events.length} events at speed=${effectiveSpeed}, maxGapMs=${maxGapMs}`,
    );

    await emitReplay({
      events,
      speed: effectiveSpeed,
      maxGapMs,
      onEvent: async (raw) => {
        // RPLY-02: the SAME entry point as live SSE ingest — no mode flag.
        await this.eventIngest.processEvent(gameId, raw);
      },
    });
  }

  /**
   * D-07 auto-wipe: delete this game's prior game_event rows and reset
   * denormalized score/state (the DB row, the in-memory GameStateRegistry,
   * AND the state machine's own attack/goal stateful closures) so take #2
   * of the same row starts clean and never collides with
   * UNIQUE(game_id, seq) or carries over stale possession/goal-dedup
   * bookkeeping from the prior take. Only ever called after the
   * is_replay=true guard above has passed.
   */
  private async wipeAndResetGame(gameId: number): Promise<void> {
    await this.gameEventRepo.delete({ gameId });
    await this.gameRepo.update(
      { id: gameId },
      {
        scoreP1: 0,
        scoreP2: 0,
        currentStatusId: null,
        streamCursor: null,
        streamCursorAt: null,
      },
    );
    // In-memory state must not leak from a prior take:
    //  - GameStateRegistry.getOrCreate() rebuilds a fresh initial state on
    //    the next processEvent call once removed.
    //  - GameStateMachine's own AttackStore/GoalStore closures (Id-anchored
    //    goal reconciliation, attack-run bookkeeping) are a SEPARATE
    //    per-gameId registry (game-state.machine.ts) — must be reset too,
    //    or take #2 would reconcile goals against take #1's stale Id set.
    this.stateRegistry.remove(gameId);
    this.stateMachine.remove(gameId);
  }
}
