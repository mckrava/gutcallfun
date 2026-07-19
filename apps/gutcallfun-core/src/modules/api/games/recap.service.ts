import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import {
  RecapBestCallDto,
  RecapCallDto,
  RecapGameDto,
  RecapGoalDto,
  RecapMeDto,
  RecapPressurePointDto,
  RecapRankDto,
  RecapRanksDto,
  RecapResponseDto,
} from './dto/recap-response.dto';

/**
 * ============================================================================
 * WHY THIS SERVICE TAKES ONLY A DataSource (+ LeaderboardService)
 * ============================================================================
 * The recap exists for a FINISHED game. `GameStateRegistry` / `LiveWindowRegistry`
 * / `LiveStateService` are process-local, in-memory, and empty for a game that
 * is no longer live — a finished game's state was never rebuilt into them and
 * a process restart clears them entirely. Reaching for those registries here
 * would silently return blank data after any restart, which is exactly the
 * failure mode this endpoint is meant to prove it does NOT have. Everything
 * below reads Postgres, and only Postgres.
 * ============================================================================
 */
@Injectable()
export class RecapService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly leaderboardService: LeaderboardService,
  ) {}

  async getRecap(gameId: number, userId: string): Promise<RecapResponseDto> {
    const game = await this.findGameRow(gameId);
    const anchor = await this.findAnchor(gameId);

    const [squad, callRows, goalRows, pressureRows] = await Promise.all([
      this.findSquadIdentity(gameId, userId),
      this.findCallRows(gameId, userId),
      this.findGoalRows(gameId),
      this.findPressureRows(gameId),
    ]);

    const calls = callRows.map((row) => toCallDto(row, anchor));
    const me = buildMeDto(calls, squad);

    const goals = buildGoals(goalRows, anchor, game.score_p1, game.score_p2);
    const pressure = buildPressure(pressureRows, anchor);

    const [global, gameRank, squadRank] = await Promise.all([
      this.leaderboardService.findMyRank(userId),
      this.leaderboardService.findMyRank(userId, { gameId }),
      squad.squad_id !== null
        ? this.leaderboardService.findMyRank(userId, {
            gameId,
            squadId: squad.squad_id,
          })
        : Promise.resolve(null),
    ]);

    const ranks: RecapRanksDto = {
      global: toRankDto(global),
      game: toRankDto(gameRank),
      squad: toRankDto(squadRank),
    };

    return {
      game: toGameDto(game),
      me,
      ranks,
      goals,
      calls,
      pressure,
    };
  }

  private async findGameRow(gameId: number): Promise<GameRow> {
    const rows = await this.dataSource.query<GameRow[]>(
      `SELECT id, team1_name, team2_name, score_p1, score_p2, status,
              team1_jersey_color, team2_jersey_color, participant1_is_home,
              competition
         FROM game
        WHERE id = $1`,
      [gameId],
    );
    const game = rows[0];
    if (!game) {
      throw new NotFoundException(`Game ${gameId} not found`);
    }
    return game;
  }

  /** The match-minute anchor: the earliest persisted event for this game. */
  private async findAnchor(gameId: number): Promise<Date | null> {
    const rows = await this.dataSource.query<{ anchor: Date | null }[]>(
      `SELECT MIN(feed_ts) AS anchor FROM game_event WHERE game_id = $1`,
      [gameId],
    );
    return rows[0]?.anchor ?? null;
  }

  private async findSquadIdentity(
    gameId: number,
    userId: string,
  ): Promise<SquadIdentityRow> {
    const rows = await this.dataSource.query<SquadIdentityRow[]>(
      `SELECT ug.squad_id AS squad_id, sq.name AS squad_name
         FROM user_game ug
         LEFT JOIN squad sq ON sq.id = ug.squad_id
        WHERE ug.game_id = $1 AND ug.user_id = $2`,
      [gameId, userId],
    );
    return rows[0] ?? { squad_id: null, squad_name: null };
  }

  /**
   * Caller-scoped calls + the aggregates `me` is built from. The LEFT JOIN
   * on game_event is load-bearing: `game_question.trigger_event_id` is
   * nullable, and an INNER join would silently drop those calls from the
   * recap entirely rather than surfacing a null minute.
   *
   * Does NOT join game_question_outcome — ladder_delta / adjacent-vs-exact
   * is out of scope; MatchEkg colours green/red from successful_outcome alone.
   */
  private async findCallRows(
    gameId: number,
    userId: string,
  ): Promise<CallRow[]> {
    return this.dataSource.query<CallRow[]>(
      `SELECT gq.content AS question_content,
              gq.participant AS participant,
              gq.state AS state,
              sel.outcome_key AS picked_outcome,
              res.outcome_key AS actual_outcome,
              uga.awarded_points AS awarded_points,
              uga.successful_outcome AS successful_outcome,
              uga.created_at AS created_at,
              ge.payload AS payload,
              ge.feed_ts AS feed_ts
         FROM user_game_answer uga
         JOIN game_question gq ON gq.id = uga.game_question_id
         JOIN game_question_option sel ON sel.id = uga.selected_option_id
         LEFT JOIN game_question_option res ON res.id = gq.resolved_option_id
         LEFT JOIN game_event ge ON ge.id = gq.trigger_event_id
        WHERE uga.user_id = $1 AND uga.game_id = $2
        ORDER BY COALESCE(ge.feed_ts, uga.created_at) ASC`,
      [userId, gameId],
    );
  }

  /**
   * DISTINCT ON (action_id) collapses the unconfirmed-then-confirmed pair the
   * feed sends for one goal (see the `confirmed` fact in <context>) — keeping
   * the CONFIRMED row (ORDER BY feed_ts DESC picks the later, confirmed one
   * when both exist for the same action_id, since we already filter to
   * confirmed IS TRUE).
   */
  private async findGoalRows(gameId: number): Promise<GoalRow[]> {
    return this.dataSource.query<GoalRow[]>(
      `SELECT feed_ts, participant, payload
         FROM (
           SELECT DISTINCT ON (ge.action_id)
                  ge.feed_ts, ge.participant, ge.payload
             FROM game_event ge
            WHERE ge.game_id = $1 AND ge.type = 'goal' AND ge.confirmed IS TRUE
            ORDER BY ge.action_id, ge.feed_ts DESC
         ) g
        ORDER BY feed_ts ASC`,
      [gameId],
    );
  }

  /**
   * The settled SIMPLE mapping — NOT a possession.ts replay. No attack-run
   * segmentation, high-water marks, or 12s debounce here; that state machine
   * already exists upstream and replaying it would duplicate its logic for a
   * game that has already finished.
   */
  private async findPressureRows(gameId: number): Promise<PressureRow[]> {
    return this.dataSource.query<PressureRow[]>(
      `SELECT feed_ts, type, participant, payload
         FROM game_event
        WHERE game_id = $1
          AND type IN ('safe_possession', 'attack_possession', 'danger_possession', 'high_danger_possession')
        ORDER BY feed_ts ASC`,
      [gameId],
    );
  }
}

interface GameRow {
  id: number;
  team1_name: string | null;
  team2_name: string | null;
  score_p1: number;
  score_p2: number;
  status: string;
  team1_jersey_color: string | null;
  team2_jersey_color: string | null;
  participant1_is_home: boolean;
  competition: string | null;
}

interface SquadIdentityRow {
  squad_id: number | null;
  squad_name: string | null;
}

interface CallRow {
  question_content: string;
  participant: number | null;
  state: string;
  picked_outcome: string;
  actual_outcome: string | null;
  awarded_points: number | string | null;
  successful_outcome: boolean | null;
  created_at: Date | string;
  payload: Record<string, unknown> | null;
  feed_ts: Date | string | null;
}

interface GoalRow {
  feed_ts: Date | string;
  participant: number | null;
  payload: Record<string, unknown>;
}

interface PressureRow {
  feed_ts: Date | string;
  type: string;
  participant: number | null;
  payload: Record<string, unknown>;
}

/**
 * Minute derivation — three branches, in order, per the settled design:
 *   (a) the trigger event's own Clock reading (through the `Update` wrapper
 *       as well as the bare shape — the feed wraps some messages as
 *       `{ Update: {...} }` and others not);
 *   (b) feed_ts minus the match-minute anchor;
 *   (c) null, when there is no trigger event at all (payload is null because
 *       the LEFT JOIN found no game_event row).
 * A null minute is a CORRECT outcome and must survive to the wire — never
 * substitute 0. Rounded to one decimal (the chart's x-scale is fractional)
 * and clamped to [0, 95] so a stoppage-time event cannot draw outside the
 * chart's viewBox. The clamp only applies once a minute has actually been
 * derived — clamping a null would fabricate a 0.
 */
function deriveMinute(
  payload: Record<string, unknown> | null | undefined,
  feedTs: Date | string | null | undefined,
  anchor: Date | null,
): number | null {
  if (payload == null) return null;

  const inner =
    (payload as { Update?: Record<string, unknown> }).Update ?? payload;
  const clock = (inner as { Clock?: { Seconds?: unknown } } | undefined)
    ?.Clock;
  const seconds = clock?.Seconds;

  let minutes: number | null = null;
  if (seconds != null && seconds !== '' && !Number.isNaN(Number(seconds))) {
    minutes = Number(seconds) / 60;
  } else if (feedTs != null && anchor != null) {
    const feedMs = new Date(feedTs).getTime();
    const anchorMs = new Date(anchor).getTime();
    if (!Number.isNaN(feedMs) && !Number.isNaN(anchorMs)) {
      minutes = (feedMs - anchorMs) / 60000;
    }
  }

  if (minutes == null || Number.isNaN(minutes)) return null;

  const rounded = Math.round(minutes * 10) / 10;
  return Math.min(Math.max(rounded, 0), 95);
}

function toGameDto(row: GameRow): RecapGameDto {
  return {
    id: row.id,
    team1_name: row.team1_name,
    team2_name: row.team2_name,
    score_p1: Number(row.score_p1),
    score_p2: Number(row.score_p2),
    status: row.status,
    team1_jersey_color: row.team1_jersey_color,
    team2_jersey_color: row.team2_jersey_color,
    participant1_is_home: row.participant1_is_home,
    competition: row.competition,
  };
}

function toRankDto(
  rank: { rank: number; of: number } | null,
): RecapRankDto | null {
  if (rank == null) return null;
  return { rank: Number(rank.rank), of: Number(rank.of) };
}

interface MappedCall {
  minute: number | null;
  question_content: string;
  participant: number | null;
  picked_outcome: string;
  actual_outcome: string | null;
  awarded_points: number | null;
  successful_outcome: boolean | null;
  state: string;
}

function toCallDto(row: CallRow, anchor: Date | null): RecapCallDto {
  const minute = deriveMinute(row.payload, row.feed_ts, anchor);
  return {
    minute,
    question_content: row.question_content,
    participant: row.participant,
    picked_outcome: row.picked_outcome,
    actual_outcome: row.actual_outcome,
    awarded_points:
      row.awarded_points == null ? null : Number(row.awarded_points),
    successful_outcome: row.successful_outcome,
    state: row.state,
  };
}

function buildMeDto(calls: MappedCall[], squad: SquadIdentityRow): RecapMeDto {
  const answered = calls.length;
  const resolvedCalls = calls.filter((c) => c.awarded_points != null);
  const resolved = resolvedCalls.length;
  const total_points = resolvedCalls.reduce(
    (sum, c) => sum + (c.awarded_points ?? 0),
    0,
  );
  const exact = calls.filter(
    (c) => c.actual_outcome != null && c.picked_outcome === c.actual_outcome,
  ).length;
  const voided = calls.filter((c) => c.state === 'voided').length;
  const successfulCount = resolvedCalls.filter(
    (c) => c.successful_outcome === true,
  ).length;
  const hit_rate = resolved > 0 ? successfulCount / resolved : 0;

  const scoringCalls = resolvedCalls.filter(
    (c) => (c.awarded_points ?? 0) > 0,
  );
  let best_call: RecapBestCallDto | null = null;
  if (scoringCalls.length > 0) {
    const best = scoringCalls.reduce((a, b) => {
      const aPoints = a.awarded_points ?? 0;
      const bPoints = b.awarded_points ?? 0;
      if (aPoints !== bPoints) return aPoints > bPoints ? a : b;
      // Tie-break: earliest minute wins; a null minute never beats a real one.
      if (a.minute == null) return b;
      if (b.minute == null) return a;
      return a.minute <= b.minute ? a : b;
    });
    best_call = {
      minute: best.minute,
      points: best.awarded_points ?? 0,
      content: best.question_content,
    };
  }

  return {
    total_points,
    answered,
    resolved,
    exact,
    voided,
    hit_rate,
    best_call,
    squad_id: squad.squad_id,
    squad_name: squad.squad_name,
  };
}

/**
 * Guards against a confirmed-then-VAR-discarded goal by dropping any row
 * whose payload score total exceeds the game row's final score_p1 + score_p2
 * — an approximation chosen over replaying discards.
 */
function buildGoals(
  rows: GoalRow[],
  anchor: Date | null,
  finalScoreP1: number,
  finalScoreP2: number,
): RecapGoalDto[] {
  const finalTotal = Number(finalScoreP1) + Number(finalScoreP2);

  return rows
    .map((row) => {
      const inner =
        (row.payload as { Update?: Record<string, unknown> }).Update ??
        row.payload;
      const score = (
        inner as {
          Score?: {
            Participant1?: { Total?: { Goals?: unknown } };
            Participant2?: { Total?: { Goals?: unknown } };
          };
        }
      )?.Score;
      const scoreP1 = Number(score?.Participant1?.Total?.Goals ?? 0);
      const scoreP2 = Number(score?.Participant2?.Total?.Goals ?? 0);
      return {
        minute: deriveMinute(row.payload, row.feed_ts, anchor),
        participant: row.participant,
        score_p1: scoreP1,
        score_p2: scoreP2,
      };
    })
    .filter((g) => g.score_p1 + g.score_p2 <= finalTotal);
}

const STAGE_MAGNITUDE: Record<string, number> = {
  safe_possession: 1,
  attack_possession: 2,
  danger_possession: 3,
  high_danger_possession: 3,
};

const PRESSURE_BUCKETS = 40;

/**
 * Downsamples the raw stage stream to at most 40 {minute, value} points by
 * bucketing the derived minutes into 40 equal buckets across the observed
 * minute range and averaging each bucket's value. Rows with a null minute
 * are excluded before bucketing. No possession rows (or none with a
 * derivable minute) yields an empty array, not a throw.
 */
function buildPressure(
  rows: PressureRow[],
  anchor: Date | null,
): RecapPressurePointDto[] {
  const points = rows
    .map((row) => {
      const minute = deriveMinute(row.payload, row.feed_ts, anchor);
      if (minute == null) return null;
      const magnitude = STAGE_MAGNITUDE[row.type] ?? 0;
      const base = magnitude / 3;
      const value = row.participant === 2 ? -base : base;
      return { minute, value };
    })
    .filter((p): p is { minute: number; value: number } => p != null);

  if (points.length === 0) return [];

  const minutes = points.map((p) => p.minute);
  const minMinute = Math.min(...minutes);
  const maxMinute = Math.max(...minutes);
  const range = maxMinute - minMinute || 1;

  const sums = new Array<number>(PRESSURE_BUCKETS).fill(0);
  const counts = new Array<number>(PRESSURE_BUCKETS).fill(0);

  for (const p of points) {
    let idx = Math.floor(((p.minute - minMinute) / range) * PRESSURE_BUCKETS);
    if (idx >= PRESSURE_BUCKETS) idx = PRESSURE_BUCKETS - 1;
    if (idx < 0) idx = 0;
    sums[idx] += p.value;
    counts[idx] += 1;
  }

  const out: RecapPressurePointDto[] = [];
  for (let i = 0; i < PRESSURE_BUCKETS; i++) {
    if (counts[i] === 0) continue;
    const bucketMinute = minMinute + ((i + 0.5) / PRESSURE_BUCKETS) * range;
    out.push({
      minute: Math.round(bucketMinute * 10) / 10,
      value: Math.round((sums[i] / counts[i]) * 1000) / 1000,
    });
  }
  return out;
}
