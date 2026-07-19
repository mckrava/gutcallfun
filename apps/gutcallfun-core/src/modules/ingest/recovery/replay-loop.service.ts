/**
 * ReplayLoopService — the DB-driven infinite replay loop
 * (RPLY-LOOP-01/02/03).
 *
 * WHY: after the World Cup ends, `FixturesCronService` discovers no new
 * fixtures and the product looks dead to a judge browsing post-submission.
 * The operator cannot ship a code or env change at that point (no container
 * restart), so `replay_loop` (see AddReplayLoop1790200000000) is the ENTIRE
 * control surface — enable/disable, target fixture, delays, stall
 * detection, and iteration cap are all driven by a plain SQL UPDATE.
 *
 * WHAT THIS SERVICE DOES NOT DO: it never calls `ReplayStarterService` or
 * `StreamManagerService` directly. Cloning a game INSERTs a fresh row with
 * `status='scheduled'` and `starts_at=now()` — the SAME handoff shape
 * `FixturesCronService`/a manual DB flip already use. `SourceSchedulerService`
 * (@Cron every ~15s) is the ONLY place that claims a scheduled row and dispatches
 * a source (D-02's single is_replay source-switch scheduler rule). Keeping
 * this service source-agnostic preserves that invariant instead of growing
 * a second path that starts sources.
 *
 * CLONE FORWARD, NEVER RESET IN PLACE (LOCKED design decision — see the
 * quick-task plan's <design_constraints>): every iteration INSERTs a new
 * `game` row. Nothing is ever deleted or reset in place:
 *   - No FK in this schema has ON DELETE CASCADE, so deleting a `game` row
 *     with questions attached would throw.
 *   - `ReplayStarterService.wipeAndResetGame` only deletes `game_event`, so
 *     re-running an EXISTING replay row is already broken on take 2 — a
 *     fresh row sidesteps that entirely (zero events, the wipe is a no-op).
 *   - `user_score_profile`/`squad_score_profile` have no `game_id` and
 *     cannot be selectively rolled back — cloning lets judges' points
 *     accumulate across iterations, which is the desired behavior.
 *   - `LiveWindowRegistry.remove()`/`GameMutexRegistry.remove()` have zero
 *     callers — reset-in-place would inherit a stale open window/cooldown;
 *     a new `game_id` gets fresh registry entries for free.
 *   - `uq_game_fixture_live` is `UNIQUE(fixture_id) WHERE NOT is_replay`, so
 *     many `is_replay=true` rows may safely share one `fixture_id`, and
 *     replay source resolution (`ReplaySourceService.load`) is keyed on
 *     `fixture_id` — a clone carrying the same `fixture_id` resolves the
 *     identical source.
 *
 * STALL WATCHDOG closes the pending todo
 * `replay-restart-orphans-mid-flight-game`: a game stranded at
 * `status='live'` with no fresh events for `stall_timeout_seconds` is
 * conditionally force-finished so the loop keeps advancing unattended. This
 * covers three real (non-hypothetical) failure modes, all of which present
 * identically as "status=live + no new events for N seconds":
 *   (i) `SourceSchedulerService.startGame` claims scheduled->live BEFORE
 *       calling start() and never rolls the status back if start() throws;
 *   (ii) finalisation keys on the `game_finalised` ACTION
 *       (`GameFinalisationService`), so a replay source whose tail lacks
 *       that action never reaches 'finished' on its own;
 *   (iii) a crash mid-replay — boot recovery (`GameStateRebuildService`)
 *       deliberately rebuilds in-memory state but does not resume a replay
 *       source (`game-state-rebuild.service.ts:101-105`, D-02), which is
 *       exactly the open todo this watchdog closes.
 *
 * The tick body NEVER throws: every DB read/write that could fail is
 * wrapped, and a per-row failure is isolated (one bad row's error cannot
 * stop the other rows in the same tick) and persisted to
 * `replay_loop.last_error` (readable over psql) rather than escaping the
 * cron handler.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { UserGameEntity } from '../../../models/game/user-game.entity';
import { ReplayLoopEntity } from '../../../models/game/replay-loop.entity';
import { GameStatus } from '../../../models/game/enums';

const LAST_ERROR_MAX_LENGTH = 500;

@Injectable()
export class ReplayLoopService {
  private readonly logger = new Logger(ReplayLoopService.name);

  constructor(
    @InjectRepository(ReplayLoopEntity)
    private readonly loopRepo: Repository<ReplayLoopEntity>,
    @InjectRepository(GameEntity)
    private readonly gameRepo: Repository<GameEntity>,
    @InjectRepository(GameEventEntity)
    private readonly gameEventRepo: Repository<GameEventEntity>,
    @InjectRepository(UserGameEntity)
    private readonly userGameRepo: Repository<UserGameEntity>,
  ) {}

  @Cron('*/30 * * * * *') // 6-field cron, seconds granularity (matches SourceSchedulerService's form)
  async tick(): Promise<void> {
    let rows: ReplayLoopEntity[];
    try {
      rows = await this.loopRepo.find({ where: { enabled: true } });
    } catch (err) {
      // Nowhere to persist this — the read itself failed.
      this.logger.error(
        'ReplayLoopService.tick: failed to load enabled loop rows',
        err as Error,
      );
      return;
    }

    // Off-state hot path: with no enabled rows, this tick cost exactly one
    // indexed read (served by idx_replay_loop_enabled) and nothing else.
    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        await this.processRow(row);
        if (row.lastError !== null) {
          await this.loopRepo.update(
            { id: row.id },
            { lastError: null, updatedAt: new Date() },
          );
        }
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        const truncated = message.slice(0, LAST_ERROR_MAX_LENGTH);
        this.logger.error(
          `ReplayLoopService.tick: row ${row.id} failed — ${message}`,
          err as Error,
        );
        try {
          await this.loopRepo.update(
            { id: row.id },
            { lastError: truncated, updatedAt: new Date() },
          );
        } catch (persistErr) {
          // A DB failure while recording a failure still cannot escape the
          // cron handler.
          this.logger.error(
            `ReplayLoopService.tick: failed to persist last_error for row ${row.id}`,
            persistErr as Error,
          );
        }
      }
    }
  }

  private async processRow(row: ReplayLoopEntity): Promise<void> {
    const currentGame = row.currentGameId
      ? await this.gameRepo.findOne({ where: { id: row.currentGameId } })
      : null;

    // STALL WATCHDOG — runs BEFORE the advance check. Either branch (forced
    // finish, or live-and-fresh no-op) returns without advancing this tick —
    // a forced finish lets the NEXT tick perform the advance, which also
    // lets restart_delay_seconds apply cleanly.
    if (currentGame && currentGame.status === GameStatus.LIVE) {
      await this.handleStallWatchdog(row, currentGame);
      return;
    }

    // ADVANCE — reached only when the current game is null, FINISHED, or
    // CANCELLED (i.e. NOT the LIVE branch handled above).
    await this.advance(row, currentGame);
  }

  /**
   * Force-finishes `game` if its newest activity is older than
   * `row.stallTimeoutSeconds`; otherwise a no-op (live and fresh).
   */
  private async handleStallWatchdog(
    row: ReplayLoopEntity,
    game: GameEntity,
  ): Promise<void> {
    const latest = await this.gameEventRepo.findOne({
      where: { gameId: game.id },
      order: { receivedAt: 'DESC' },
    });

    // createdAt is NOT NULL, so this chain always terminates with a real
    // Date — never compare against null.
    const lastActivity =
      latest?.receivedAt ?? game.updatedAt ?? game.startsAt ?? game.createdAt;

    const staleMs = Date.now() - lastActivity.getTime();
    if (staleMs <= row.stallTimeoutSeconds * 1000) {
      return; // live and fresh — no-op
    }

    // Conditional claim: a real game_finalised landing concurrently wins
    // and this becomes a 0-row no-op (same pattern as
    // GameFinalisationService / SourceSchedulerService.startGame).
    const result = await this.gameRepo
      .createQueryBuilder()
      .update(GameEntity)
      .set({ status: GameStatus.FINISHED, updatedAt: new Date() })
      .where('id = :id', { id: game.id })
      .andWhere('status = :live', { live: GameStatus.LIVE })
      .execute();

    if (result.affected) {
      this.logger.log(
        `ReplayLoopService: loop ${row.id} force-finished stalled game ${game.id} (no activity for ${Math.round(staleMs / 1000)}s, timeout ${row.stallTimeoutSeconds}s)`,
      );
    }
  }

  private async advance(
    row: ReplayLoopEntity,
    currentGame: GameEntity | null,
  ): Promise<void> {
    if (
      row.lastRestartAt !== null &&
      Date.now() - row.lastRestartAt.getTime() < row.restartDelaySeconds * 1000
    ) {
      return;
    }

    if (row.maxIterations !== null && row.iterationsRun >= row.maxIterations) {
      return;
    }

    const template = row.templateGameId
      ? await this.gameRepo.findOne({ where: { id: row.templateGameId } })
      : null;
    const source = template ?? currentGame;

    const newGame = this.gameRepo.create({
      // The LOOP row's fixture_id is authoritative (not the source's) —
      // this is what makes the clone resolve the same replay source via
      // ReplaySourceService.load().
      fixtureId: row.fixtureId,
      isReplay: true,
      status: GameStatus.SCHEDULED,
      startsAt: new Date(),
      // Display-identity fields copied from source — a superset of the
      // request's team1Name/team2Name/competition: participant ids and
      // jersey colours are the same display-identity set and the UI
      // renders from them, so a clone missing them would show judges an
      // unstyled, unnamed match.
      team1Name: source?.team1Name ?? null,
      team2Name: source?.team2Name ?? null,
      competition: source?.competition ?? null,
      participant1Id: source?.participant1Id ?? null,
      participant2Id: source?.participant2Id ?? null,
      participant1IsHome: source?.participant1IsHome ?? true,
      team1JerseyColor: source?.team1JerseyColor ?? null,
      team2JerseyColor: source?.team2JerseyColor ?? null,
      // Fresh state — explicitly zeroed/nulled, never carried from source.
      scoreP1: 0,
      scoreP2: 0,
      currentStatusId: null,
      streamCursor: null,
      streamCursorAt: null,
    });
    await this.gameRepo.save(newGame);

    // Carry participation forward, but only when there was a previous game
    // (iteration 1 has none to copy from).
    if (row.currentGameId) {
      const prevParticipants = await this.userGameRepo.find({
        where: { gameId: row.currentGameId },
      });

      if (prevParticipants.length > 0) {
        await this.userGameRepo
          .createQueryBuilder()
          .insert()
          .into(UserGameEntity)
          .values(
            prevParticipants.map((p) => ({
              gameId: newGame.id,
              userId: p.userId,
              squadId: p.squadId,
            })),
          )
          .orIgnore()
          .execute();
      }
    }

    await this.loopRepo.update(
      { id: row.id },
      {
        currentGameId: newGame.id,
        lastRestartAt: new Date(),
        iterationsRun: row.iterationsRun + 1,
        lastError: null,
        updatedAt: new Date(),
      },
    );

    this.logger.log(
      `ReplayLoopService: loop ${row.id} cloned game ${row.currentGameId ?? '(none)'} -> ${newGame.id} (iteration ${row.iterationsRun + 1})`,
    );
  }
}
