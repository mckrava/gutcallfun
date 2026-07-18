import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Server } from 'socket.io';
import {
  buildGameEvent,
  buildQuestion,
  buildResolution,
} from '../../mocks/fixtures/realtime.fixtures';
import { QuestionMessageDto } from './dto/question-message.dto';

const HEARTBEAT_INTERVAL_MS = 4_000;
const QUESTION_INTERVAL_MS = 30_000;
const RESOLUTION_DELAY_MS = 5_000;

/**
 * Per-room fake game cycle (D-03): a `game_event` heartbeat every ~4s and a
 * `question`/`resolution` pair every ~30s, backed by `SchedulerRegistry` for
 * named, introspectable timers.
 *
 * Cleanup is mandatory, not advisory. Every interval and timeout this
 * service registers is `.unref()`'d AND swept on `onModuleDestroy`. Nest
 * triggers this hook because `main.ts` already calls `enableShutdownHooks()`,
 * but Nest does not clear provider-created timers for you — that is this
 * provider's job, and the suite already has a documented open-handles
 * problem (`.planning/todos/pending/stream-abort-unhandled-rejection-and-e2e-open-handles.md`)
 * that a leaked interval would turn from a warning into a hang.
 *
 * Emit callbacks are synchronous void functions, so the specific hazard
 * `stream-manager.service.ts` carries (a bare settlement-only combinator on
 * a floating promise that lets a rejection escape) does not arise here as
 * written. If a callback is ever made async (e.g. to await a real data
 * source in Phase 5), it must attach an explicit rejection handler that
 * logs and continues, exactly as `source-scheduler.service.ts` does for its
 * own fire-and-forget dispatch — never let one emission failure tear down
 * the loop.
 */
@Injectable()
export class FakeCycleService implements OnModuleDestroy {
  private readonly logger = new Logger(FakeCycleService.name);
  private readonly roomSeq = new Map<string, number>();

  constructor(private readonly scheduler: SchedulerRegistry) {}

  /**
   * Idempotent: if `heartbeat:{room}` already exists, return immediately
   * without registering a second interval — a second subscriber to an
   * already-active room is a no-op rather than a doubled event rate. Both
   * named intervals for a room are always registered and torn down
   * together, so checking only the heartbeat's existence is sufficient.
   */
  startCycleForRoom(room: string, gameId: number, server: Server): void {
    const heartbeatName = `heartbeat:${room}`;
    if (this.scheduler.doesExist('interval', heartbeatName)) {
      this.logger.debug(
        `Room ${room}: cycle already running — ignoring duplicate start`,
      );
      return;
    }

    this.roomSeq.set(room, 0);

    const heartbeat = setInterval(() => {
      try {
        const nextSeq = (this.roomSeq.get(room) ?? 0) + 1;
        this.roomSeq.set(room, nextSeq);
        server.to(room).emit('game_event', buildGameEvent(gameId, nextSeq));
      } catch (err) {
        this.logger.error(`Room ${room}: failed to emit game_event`, err as Error);
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();
    this.scheduler.addInterval(heartbeatName, heartbeat);

    const questionCycleName = `question-cycle:${room}`;
    const questionCycle = setInterval(() => {
      this.runQuestionCycle(room, gameId, server);
    }, QUESTION_INTERVAL_MS);
    questionCycle.unref();
    this.scheduler.addInterval(questionCycleName, questionCycle);
  }

  /** Stops both named intervals (and any pending resolution timeout) for a room. Safe to call on an already-stopped room. */
  stopCycleForRoom(room: string): void {
    for (const name of [`heartbeat:${room}`, `question-cycle:${room}`]) {
      if (this.scheduler.doesExist('interval', name)) {
        this.scheduler.deleteInterval(name);
      }
    }
    const resolutionName = `resolution:${room}`;
    if (this.scheduler.doesExist('timeout', resolutionName)) {
      this.scheduler.deleteTimeout(resolutionName);
    }
    this.roomSeq.delete(room);
  }

  /**
   * Emits a `question` built from the fixtures, then schedules a single
   * `setTimeout` `RESOLUTION_DELAY_MS` later that emits the matching
   * `resolution` for that same question object — passing the question
   * through, rather than rebuilding one, is what guarantees the resolution
   * is correlated by `game_question_id` and its resolved option is provably
   * one of that question's four options.
   */
  private runQuestionCycle(room: string, gameId: number, server: Server): void {
    let question: QuestionMessageDto;
    try {
      question = buildQuestion(gameId);
      server.to(room).emit('question', question);
    } catch (err) {
      this.logger.error(`Room ${room}: failed to emit question`, err as Error);
      return;
    }

    const resolutionName = `resolution:${room}`;
    if (this.scheduler.doesExist('timeout', resolutionName)) {
      this.scheduler.deleteTimeout(resolutionName);
    }

    const resolutionTimer = setTimeout(() => {
      try {
        server.to(room).emit('resolution', buildResolution(gameId, question));
      } catch (err) {
        this.logger.error(`Room ${room}: failed to emit resolution`, err as Error);
      }
      if (this.scheduler.doesExist('timeout', resolutionName)) {
        this.scheduler.deleteTimeout(resolutionName);
      }
    }, RESOLUTION_DELAY_MS);
    resolutionTimer.unref();
    this.scheduler.addTimeout(resolutionName, resolutionTimer);
  }

  /**
   * Belt-and-suspenders: sweeps every interval and timeout this service
   * registers. Nothing else in this codebase calls `addInterval`/
   * `addTimeout` on `SchedulerRegistry` (the only other dynamic-scheduling
   * consumer, `SourceSchedulerService`, uses the `@Cron` decorator, which
   * lives in a separate registry bucket) — so this sweep only ever touches
   * timers this service itself created. Guarantees no interval or timeout
   * outlives `app.close()`, which is what `test:e2e` relies on and what the
   * pre-existing open-handles issue is about.
   */
  onModuleDestroy(): void {
    for (const name of this.scheduler.getIntervals()) {
      this.scheduler.deleteInterval(name);
    }
    for (const name of this.scheduler.getTimeouts()) {
      this.scheduler.deleteTimeout(name);
    }
    this.roomSeq.clear();
  }
}
