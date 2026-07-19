import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { RealtimeGateway } from '../realtime/realtime.gateway';

// ---------------------------------------------------------------------------
// Dev-only WebSocket simulator (never mounted in production — every handler
// calls assertDev()). It emits the exact wire events the real live engine
// emits (snapshot / question / resolution / game_event) straight into a game's
// room via the gateway, so the client's live "Match Details" screen can be
// exercised end-to-end without a real feed or recorded replay data.
//
//   POST /dev/live/:gameId/play?speed=2   → run a scripted ~40s match
//   POST /dev/live/:gameId/snapshot       → one snapshot (manual meter/score)
//   POST /dev/live/:gameId/question       → open a prediction window
//   POST /dev/live/:gameId/resolve        → resolve a window (awards points)
//   POST /dev/live/:gameId/goal           → a confirmed goal + new score
// ---------------------------------------------------------------------------

type Possession =
  | 'SafePossession'
  | 'AttackPossession'
  | 'DangerPossession'
  | 'HighDangerPossession';

type OutcomeKey = 'fizzles' | 'danger' | 'shot' | 'goal';

const LADDER: Record<OutcomeKey, number> = { fizzles: 5, danger: 7, shot: 15, goal: 100 };
const OUTCOMES: OutcomeKey[] = ['fizzles', 'danger', 'shot', 'goal'];

interface SimQuestion {
  id: string;
  options: { id: string; outcome_key: OutcomeKey; base_gain: number; display_order: number }[];
}

@Controller('dev/live')
export class DevController {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly config: ConfigService,
  ) {}

  private assertDev(): void {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('dev simulator is disabled in production');
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  private clock(elapsedMs: number) {
    return {
      current_status_id: 4,
      last_feed_ts: this.now(),
      period_started_feed_ts: this.now(),
      elapsed_ms: elapsedMs,
    };
  }

  private snapshotPayload(
    gameId: number,
    o: { score_p1: number; score_p2: number; possession_stage: Possession | null; elapsed_ms: number },
  ) {
    return {
      game_id: gameId,
      score_p1: o.score_p1,
      score_p2: o.score_p2,
      possession_stage: o.possession_stage,
      clock: this.clock(o.elapsed_ms),
      active_question: null,
      is_mock: true,
    };
  }

  private buildQuestion(
    gameId: number,
    o: { participant: 1 | 2; content: string; ttl: number },
  ): { message: Record<string, unknown>; q: SimQuestion } {
    const id = randomUUID();
    const options = OUTCOMES.map((k, i) => ({
      id: randomUUID(),
      game_question_id: id,
      outcome_key: k,
      base_gain: LADDER[k],
      display_order: i + 1,
    }));
    const message = {
      id,
      game_id: gameId,
      trigger_event_id: null,
      resolution_event_id: null,
      question_type: 'attack_outcome',
      content: o.content,
      participant: o.participant,
      state: 'open',
      resolved_option_id: null,
      answer_window_ttl: o.ttl,
      expires_at: new Date(Date.now() + o.ttl * 1000).toISOString(),
      created_at: this.now(),
      resolved_at: null,
      options,
      is_mock: true,
    };
    return { message, q: { id, options } };
  }

  private resolutionPayload(q: SimQuestion, outcome: OutcomeKey) {
    const opt = q.options.find((op) => op.outcome_key === outcome) ?? q.options[0];
    return {
      game_question_id: q.id,
      resolved_option_id: opt.id,
      resolved_outcome_key: outcome,
      awarded_points: opt.base_gain,
      successful_outcome: outcome === 'shot' || outcome === 'goal',
      resolved_at: this.now(),
      is_mock: true,
    };
  }

  private goalPayload(gameId: number, participant: 1 | 2, seq: number) {
    return {
      id: randomUUID(),
      game_id: gameId,
      type: 'goal',
      action_id: null,
      seq,
      confirmed: true,
      participant,
      status_id: null,
      feed_ts: this.now(),
      is_mock: true,
    };
  }

  // -- Granular manual control ------------------------------------------------

  @Public()
  @Post(':gameId/snapshot')
  snapshot(
    @Param('gameId', ParseIntPipe) gameId: number,
    @Body() body: { score_p1?: number; score_p2?: number; possession_stage?: Possession | null; elapsed_ms?: number },
  ) {
    this.assertDev();
    const payload = this.snapshotPayload(gameId, {
      score_p1: body.score_p1 ?? 0,
      score_p2: body.score_p2 ?? 0,
      possession_stage: body.possession_stage ?? 'SafePossession',
      elapsed_ms: body.elapsed_ms ?? 60000,
    });
    this.gateway.emitToGame(gameId, 'snapshot', payload);
    return { emitted: 'snapshot', payload };
  }

  @Public()
  @Post(':gameId/question')
  question(
    @Param('gameId', ParseIntPipe) gameId: number,
    @Body() body: { participant?: 1 | 2; content?: string; ttl?: number },
  ) {
    this.assertDev();
    const { message } = this.buildQuestion(gameId, {
      participant: body.participant ?? 1,
      content: body.content ?? 'Attack building — what happens?',
      ttl: body.ttl ?? 5,
    });
    this.gateway.emitToGame(gameId, 'question', message);
    return { emitted: 'question', payload: message };
  }

  @Public()
  @Post(':gameId/resolve')
  resolve(
    @Param('gameId', ParseIntPipe) gameId: number,
    @Body() body: { game_question_id: string; resolved_option_id: string; outcome?: OutcomeKey },
  ) {
    this.assertDev();
    const outcome = body.outcome ?? 'shot';
    const payload = {
      game_question_id: body.game_question_id,
      resolved_option_id: body.resolved_option_id,
      resolved_outcome_key: outcome,
      awarded_points: LADDER[outcome],
      successful_outcome: outcome === 'shot' || outcome === 'goal',
      resolved_at: this.now(),
      is_mock: true,
    };
    this.gateway.emitToGame(gameId, 'resolution', payload);
    return { emitted: 'resolution', payload };
  }

  @Public()
  @Post(':gameId/goal')
  goal(
    @Param('gameId', ParseIntPipe) gameId: number,
    @Body() body: { participant?: 1 | 2; seq?: number },
  ) {
    this.assertDev();
    const payload = this.goalPayload(gameId, body.participant ?? 1, body.seq ?? 1);
    this.gateway.emitToGame(gameId, 'game_event', payload);
    return { emitted: 'game_event(goal)', payload };
  }

  // -- Scripted match ---------------------------------------------------------

  @Public()
  @Post(':gameId/play')
  play(
    @Param('gameId', ParseIntPipe) gameId: number,
    @Query('speed') speedRaw?: string,
  ) {
    this.assertDev();
    const speed = Math.max(0.25, Math.min(10, Number(speedRaw) || 1));
    const emit = (event: string, payload: unknown) => this.gateway.emitToGame(gameId, event, payload);

    // A running score/seq the closures below mutate as the script plays.
    let score1 = 0;
    let score2 = 0;
    let seq = 100;
    let q1: SimQuestion;
    let q2: SimQuestion;
    let q3: SimQuestion;
    const possession = (participant: 1 | 2) => emit('game_event', { id: randomUUID(), game_id: gameId, type: 'attack_possession', action_id: null, seq: ++seq, confirmed: null, participant, status_id: null, feed_ts: this.now(), is_mock: true });

    // Each step is [baseSeconds, action]; baseSeconds are divided by speed.
    // Deliberately spaced out — one thing happens at a time, 5s answer windows,
    // and the two goals sit ~34s apart so each event can be watched on its own.
    const steps: [number, () => void][] = [
      [0, () => emit('snapshot', this.snapshotPayload(gameId, { score_p1: 0, score_p2: 0, possession_stage: 'SafePossession', elapsed_ms: 60_000 }))],
      [6, () => { possession(1); emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'AttackPossession', elapsed_ms: 300_000 })); }],
      [11, () => emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'DangerPossession', elapsed_ms: 420_000 }))],
      // Q1 opens (5s to answer), resolves well after the window closes.
      [14, () => { const b = this.buildQuestion(gameId, { participant: 1, content: 'Brazil surging forward — how does it end?', ttl: 5 }); q1 = b.q; emit('question', b.message); }],
      [22, () => { emit('resolution', this.resolutionPayload(q1, 'shot')); emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'SafePossession', elapsed_ms: 720_000 })); }],
      [32, () => { possession(2); emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'AttackPossession', elapsed_ms: 900_000 })); }],
      [37, () => emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'HighDangerPossession', elapsed_ms: 1_080_000 }))],
      // Q2 opens, then Argentina score (GOAL #1).
      [40, () => { const b = this.buildQuestion(gameId, { participant: 2, content: 'Argentina break away — big chance?', ttl: 5 }); q2 = b.q; emit('question', b.message); }],
      [48, () => { emit('resolution', this.resolutionPayload(q2, 'goal')); score2 += 1; emit('game_event', this.goalPayload(gameId, 2, ++seq)); emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'SafePossession', elapsed_ms: 1_800_000 })); }],
      [62, () => { possession(1); emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'AttackPossession', elapsed_ms: 2_640_000 })); }],
      // Q3 opens, then Brazil equalise (GOAL #2, ~34s after GOAL #1).
      [66, () => { const b = this.buildQuestion(gameId, { participant: 1, content: 'Last-gasp Brazil pressure — what happens?', ttl: 5 }); q3 = b.q; emit('question', b.message); }],
      [74, () => { emit('resolution', this.resolutionPayload(q3, 'goal')); score1 += 1; emit('game_event', this.goalPayload(gameId, 1, ++seq)); emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'SafePossession', elapsed_ms: 3_000_000 })); }],
      [84, () => emit('snapshot', this.snapshotPayload(gameId, { score_p1: score1, score_p2: score2, possession_stage: 'SafePossession', elapsed_ms: 3_600_000 }))],
    ];

    for (const [at, fn] of steps) {
      setTimeout(() => {
        try {
          fn();
        } catch {
          /* dev-only: never surface a scheduling error */
        }
      }, (at / speed) * 1000);
    }

    return {
      started: true,
      gameId,
      speed,
      durationSeconds: Math.round(84 / speed),
      note: 'Subscribe to this game in the UI to watch the scripted match. Use speed=1 (default) for a calm, watch-each-event pace.',
    };
  }
}
