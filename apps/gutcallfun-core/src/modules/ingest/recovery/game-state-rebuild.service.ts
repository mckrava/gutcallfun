/**
 * GameStateRebuildService — boot state rebuild (RCVR-01) + stream resume
 * with gap self-heal (RCVR-02).
 *
 * OnApplicationBootstrap: for every status='live' game, reconstruct its
 * in-memory GameState (GameStateRegistry) by replaying its own game_event
 * rows (ORDER BY seq) through the SAME GameStateMachine.applyEvent() path
 * Plan 03's live pipeline uses — reconstructing in-memory state ONLY, never
 * inserting, updating, or deleting any game_event row (append-only log
 * untouched, T-02-07-01).
 *
 * `game_event.payload` already stores the exact raw feed message object
 * EventIngestService.processEvent() received (message-normalizer.ts:
 * `payload: raw`) — so no re-normalization is needed; each row's `payload`
 * IS the state-machine input shape GameStateMachine.applyEvent() expects.
 * This is the identical "own game_event rows ORDER BY seq -> row.payload"
 * read pattern ReplaySourceService's Source B branch already established
 * (D-01 "build once, use twice").
 *
 * After rebuild, reconnects via StreamManagerService.start(gameId) — which
 * re-reads game.stream_cursor from the DB itself and resumes with
 * Last-Event-ID = that cursor (or no header when null — a fresh-start edge,
 * never a false gap; Plan 05). The first post-reconnect message's Seq-gap
 * check is the SAME ConnectionId-aware GameStateMachine.detectGap() plumbing
 * Plan 03's EventIngestService already runs on every message — this service
 * does not duplicate that check; it only has to seed the rebuilt state's
 * lastSeq/connectionId correctly so that FIRST post-reconnect detectGap()
 * call compares against the real prior history instead of a blank slate.
 *
 * Recovery never starts the WRONG source for a game (D-02's "is_replay is
 * the sole switch" invariant applies here too, not just to the scheduler):
 * a replay game's live-ness on restart is not resumed via SSE — reconnecting
 * a replay game via StreamManagerService would attempt to open a live TxLINE
 * connection for a fixture the replay emitter (not TxLINE) was feeding,
 * which is starting the wrong source. In-memory state is still rebuilt for
 * a replay game (so its score/possession stage are correct if anything reads
 * them), but the stream reconnect step is skipped and logged — resuming an
 * in-flight replay after a restart is a documented gap outside this phase's
 * scope (the single-long-lived-process deployment shape means a restart
 * mid-replay is not part of the demo-day flow).
 */

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { GameStatus } from '../../../models/game/enums';
import { GameStateRegistry } from '../state/game-state.registry';
import { GameStateMachine } from '../state/game-state.machine';
import { StreamManagerService } from '../stream/stream-manager.service';

@Injectable()
export class GameStateRebuildService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GameStateRebuildService.name);

  constructor(
    @InjectRepository(GameEntity) private readonly gameRepo: Repository<GameEntity>,
    @InjectRepository(GameEventEntity) private readonly gameEventRepo: Repository<GameEventEntity>,
    private readonly stateRegistry: GameStateRegistry,
    private readonly stateMachine: GameStateMachine,
    private readonly streamManager: StreamManagerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const liveGames = await this.gameRepo.find({ where: { status: GameStatus.LIVE } });

    for (const game of liveGames) {
      try {
        await this.rebuildOne(game);
      } catch (err) {
        // One game's rebuild failure must never prevent other live games
        // from recovering — log and move on (RCVR-01 isolation).
        this.logger.error(
          `GameStateRebuildService: failed to rebuild/reconnect game ${game.id} — leaving it offline (manual intervention needed)`,
          err as Error,
        );
      }
    }
  }

  private async rebuildOne(game: GameEntity): Promise<void> {
    const rows = await this.gameEventRepo.find({
      where: { gameId: game.id },
      order: { seq: 'ASC' },
    });

    const state = this.stateRegistry.getOrCreate(game.id);
    for (const row of rows) {
      // Reconstructs in-memory state ONLY — this method never touches the
      // database (T-02-07-01 prohibition: boot rebuild must never re-insert
      // or mutate game_event rows).
      this.stateMachine.applyEvent(state, row.payload);
    }

    this.logger.log(
      `GameStateRebuildService: rebuilt game ${game.id} from ${rows.length} persisted event(s)` +
        (game.isReplay ? ' (is_replay=true — skipping stream reconnect)' : ''),
    );

    if (game.isReplay) {
      // D-02: is_replay is the sole source switch — recovery must never
      // start the WRONG source. A replay game is not resumed via SSE.
      return;
    }

    // Reconnect: StreamManagerService.start() re-reads game.stream_cursor
    // from the DB itself (Plan 05), so a null cursor reconnects without a
    // Last-Event-ID header (fresh-start edge, not a false gap) — the same
    // already-proven behavior this call reuses, not re-implemented here.
    this.streamManager.start(game.id);
  }
}
