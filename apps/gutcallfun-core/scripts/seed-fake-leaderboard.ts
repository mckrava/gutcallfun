/**
 * Dev seed: 50 fake users with resolved game activity, so every leaderboard
 * scope (global / per-game / per-squad) renders a populated, believable board.
 *
 * WHY IT WRITES ANSWERS, NOT total_points
 *   LeaderboardService derives every board at query time from
 *   `user_game_answer.awarded_points` (see the header block in
 *   modules/api/leaderboard/leaderboard.service.ts). `user_score_profile.
 *   total_points` is a decorative cache that nothing ranks on — writing only
 *   that column (as seed-profiles.ts does) moves no board. This script writes
 *   the answer rows first, then recomputes the counters from them so the
 *   derived boards and the cached counters agree.
 *
 * SCOPE REQUIREMENTS THAT FOLLOW
 *   - game board  → needs a `user_game` row per (user, game)
 *   - squad board → needs `squad_participant` AND `user_game.squad_id`
 *     (squad attribution is read from user_game, not from membership)
 *
 * SCORING (LOCKED — never recalibrate)
 *   correct → rewardMultiplier 1.000, awardedPoints = the winning option's
 *             frozen base_gain (5 fizzles / 7 danger / 15 shot / 100 goal)
 *   wrong   → rewardMultiplier 0.000, awardedPoints = 0
 *   base_gain is always read from the option row, never hardcoded here.
 *
 * DETERMINISTIC: user ids are fixed and every decision (answer / hit / which
 * wrong option) is an md5 of (user, question) — no Math.random(). Re-running
 * reproduces byte-identical scores.
 *
 * IDEMPOTENT: the cleanup pass matches ONLY the 'FAKE' wallet prefix and squad
 * ids 901-903, so real users and real squad membership are never touched. The
 * whole run is one transaction.
 *
 * Usage: npm run seed:fake-leaderboard
 */
import { createHash } from 'node:crypto';
import { EntityManager, In, Like } from 'typeorm';
import dataSource from '../src/db/data-source';
import { UserEntity } from '../src/models/account/user.entity';
import { UserScoreProfileEntity } from '../src/models/account/user-score-profile.entity';
import { GameEntity } from '../src/models/game/game.entity';
import { GameQuestionEntity } from '../src/models/game/game-question.entity';
import { GameQuestionOptionEntity } from '../src/models/game/game-question-option.entity';
import { UserGameEntity } from '../src/models/game/user-game.entity';
import { UserGameAnswerEntity } from '../src/models/game/user-game-answer.entity';
import { GameStatus, QuestionState } from '../src/models/game/enums';
import { SquadEntity } from '../src/models/squad/squad.entity';
import { SquadParticipantEntity } from '../src/models/squad/squad-participant.entity';
import { SquadScoreProfileEntity } from '../src/models/squad/squad-score-profile.entity';

const USER_COUNT = 50;
const WALLET_PREFIX = 'FAKE';
/** Far above anything SquadsService allocates (it uses max(id)+1), so no collision. */
const SEEDED_SQUAD_IDS = [901, 902, 903];
/**
 * Set to false to leave the existing local squad 1 untouched. When true, 8 fake
 * users join it so the real squad's board has competition to render.
 */
const STUFF_REAL_SQUAD_1 = true;
const REAL_SQUAD_ID = 1;
/** Postgres bulk-insert parameter limits: chunk the ~4.5k answer rows. */
const INSERT_CHUNK = 500;

const NAMES: ReadonlyArray<readonly [string, string]> = [
  ['pitch_prophet', '🔮'], ['volley_vera', '⚡'], ['nutmeg_nico', '🥜'],
  ['header_hana', '🎯'], ['offside_omar', '🚩'], ['counter_kira', '🏃'],
  ['sweeper_sam', '🧹'], ['far_post_fin', '📮'], ['tiki_taka_tom', '🎼'],
  ['gegen_greta', '🔥'], ['boot_room_bea', '👟'], ['chalk_on_boots', '🥅'],
  ['late_runner_lu', '⏱'], ['park_the_bus', '🚌'], ['panenka_pete', '🪶'],
  ['rabona_rosa', '🩰'], ['top_bins_teo', '🗑'], ['clean_sheet_cleo', '🧊'],
  ['derby_dana', '🏟'], ['stoppage_stig', '⏳'], ['wing_back_wes', '🪽'],
  ['false_nine_fay', '9️⃣'], ['low_block_leo', '🧱'], ['high_line_hugo', '📏'],
  ['set_piece_saskia', '📐'], ['through_ball_tia', '🪡'], ['first_touch_finn', '🤏'],
  ['box_to_box_bo', '🔁'], ['target_man_theo', '🗼'], ['poacher_pia', '🦊'],
  ['byline_bram', '📍'], ['cutback_cara', '↩️'], ['overlap_otto', '🔀'],
  ['press_trigger', '🎚'], ['half_space_hal', '◧'], ['switch_play_sia', '↔️'],
  ['long_ball_lars', '🏹'], ['dink_dora', '🪁'], ['chip_shot_chad', '🍟'],
  ['curler_cass', '🌀'], ['one_two_uma', '2️⃣'], ['give_and_go_gil', '🤝'],
  ['last_ditch_lena', '🛡'], ['goal_line_gus', '🥅'], ['extra_time_evie', '➕'],
  ['shootout_shay', '🎲'], ['terrace_tobi', '🪧'], ['away_end_ada', '✈️'],
  ['match_day_milo', '📅'], ['full_time_fritz', '🔔'],
];

const SEEDED_SQUADS: ReadonlyArray<{ id: number; name: string; emoji: string; inviteCode: string }> = [
  { id: 901, name: 'Total Football FC', emoji: '🟠', inviteCode: 'FAKE01' },
  { id: 902, name: 'Catenaccio Crew', emoji: '🔵', inviteCode: 'FAKE02' },
  { id: 903, name: 'Long Ball Legion', emoji: '🟢', inviteCode: 'FAKE03' },
];

// --------------------------------------------------------------------------
// Deterministic hashing. Mirrors the md5-based expressions the equivalent raw
// SQL used, so both produce identical scores for the same DB.
// --------------------------------------------------------------------------

/** First 32 bits of md5(seed) as an unsigned int. */
function hash32(seed: string): number {
  return parseInt(createHash('md5').update(seed).digest('hex').slice(0, 8), 16);
}

/** Deterministic float in [0, 1). */
function hash01(seed: string): number {
  return hash32(seed) / 0xffffffff;
}

interface FakeUser {
  index: number;
  id: string;
  profileId: string;
  walletAddress: string;
  shareCode: string;
  handle: string;
  emoji: string;
  /** Hit rate, 0.15 .. 0.55 — spread by hash so rank is not insertion order. */
  skill: number;
  /** Share of a game's questions they bother to answer, 0.60 .. 0.90. */
  answerRate: number;
  /** null = solo (exercises the no-squad participant path). */
  squadId: number | null;
  createdAt: Date;
}

function buildUsers(now: number): FakeUser[] {
  return NAMES.slice(0, USER_COUNT).map(([handle, emoji], idx) => {
    const i = idx + 1;
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    return {
      index: i,
      id,
      profileId: `usp_${id}`,
      walletAddress: `${WALLET_PREFIX}${createHash('md5')
        .update(`gutcall-fake-wallet-${i}`)
        .digest('hex')
        .toUpperCase()}`,
      // GC-XXXX-XXXX, Crockford-safe chars only (hex letters A-F all qualify).
      // The trailing hex index makes it unique by construction, not by luck.
      shareCode: `GC-${createHash('md5')
        .update(`gutcall-fake-share-${i}`)
        .digest('hex')
        .slice(0, 4)
        .toUpperCase()}-F${i.toString(16).toUpperCase().padStart(3, '0')}`,
      handle,
      emoji,
      skill: 0.15 + 0.4 * hash01(`skill-${i}`),
      answerRate: 0.6 + 0.3 * hash01(`part-${id}`),
      squadId: assignSquad(i),
      // Staggered so the board's `ORDER BY points DESC, created_at ASC`
      // tiebreak is deterministic.
      createdAt: new Date(now - (60 - i) * 60_000),
    };
  });
}

function assignSquad(i: number): number | null {
  if (i <= 8) return STUFF_REAL_SQUAD_1 ? REAL_SQUAD_ID : null;
  if (i <= 22) return 901;
  if (i <= 36) return 902;
  if (i <= 44) return 903;
  return null; // 45-50 stay solo
}

/** A resolved question with its options, ready to be answered. */
interface ResolvedQuestion {
  id: string;
  gameId: number;
  resolvedOptionId: string;
  /** base_gain of the winning option — what a correct pick is worth. */
  winningGain: number;
  /** Non-winning options, ordered by display_order, for wrong picks. */
  wrongOptionIds: string[];
  resolvedAt: Date;
}

async function loadResolvedQuestions(manager: EntityManager): Promise<ResolvedQuestion[]> {
  // Eligible games are discovered, never hardcoded: finished only, so an
  // in-progress match is not retroactively stuffed with fake activity.
  const finishedGames = await manager.getRepository(GameEntity).find({
    where: { status: GameStatus.FINISHED },
    order: { id: 'ASC' },
  });
  if (finishedGames.length === 0) return [];

  const questions = await manager.getRepository(GameQuestionEntity).find({
    where: {
      gameId: In(finishedGames.map((g) => g.id)),
      state: QuestionState.RESOLVED,
    },
    order: { createdAt: 'ASC' },
  });
  const resolvable = questions.filter((q) => q.resolvedOptionId !== null && q.resolvedAt !== null);
  if (resolvable.length === 0) return [];

  const options = await manager.getRepository(GameQuestionOptionEntity).find({
    where: { gameQuestionId: In(resolvable.map((q) => q.id)) },
    order: { displayOrder: 'ASC' },
  });
  const byQuestion = new Map<string, GameQuestionOptionEntity[]>();
  for (const o of options) {
    const list = byQuestion.get(o.gameQuestionId);
    if (list) list.push(o);
    else byQuestion.set(o.gameQuestionId, [o]);
  }

  const out: ResolvedQuestion[] = [];
  for (const q of resolvable) {
    const opts = byQuestion.get(q.id) ?? [];
    const winner = opts.find((o) => o.id === q.resolvedOptionId);
    const wrong = opts.filter((o) => o.id !== q.resolvedOptionId);
    // A question with no winning row or no alternative is unusable: a wrong
    // pick would have no option to point at, and selected_option_id is NOT NULL.
    if (!winner || wrong.length === 0) continue;
    out.push({
      id: q.id,
      gameId: q.gameId,
      resolvedOptionId: q.resolvedOptionId as string,
      winningGain: winner.baseGain,
      wrongOptionIds: wrong.map((o) => o.id),
      resolvedAt: q.resolvedAt as Date,
    });
  }
  return out;
}

/**
 * Which games each user plays: a rotated window of 2-4 of the eligible games,
 * so they don't all pile into the first one.
 */
function pickGames(user: FakeUser, gameIds: number[]): number[] {
  if (gameIds.length === 0) return [];
  const take = Math.min(gameIds.length, 2 + (hash32(`games-${user.id}`) % 3));
  const start = hash32(`rot-${user.id}`) % gameIds.length;
  return Array.from({ length: take }, (_, k) => gameIds[(start + k) % gameIds.length]);
}

async function purgePreviousRun(manager: EntityManager): Promise<number> {
  const previous = await manager
    .getRepository(UserEntity)
    .find({ where: { walletAddress: Like(`${WALLET_PREFIX}%`) }, select: { id: true } });
  const ids = previous.map((u) => u.id);

  if (ids.length > 0) {
    await manager.getRepository(UserGameAnswerEntity).delete({ userId: In(ids) });
    await manager.getRepository(UserGameEntity).delete({ userId: In(ids) });
    await manager.getRepository(SquadParticipantEntity).delete({ userId: In(ids) });
    await manager.getRepository(UserEntity).delete({ id: In(ids) });
    await manager.getRepository(UserScoreProfileEntity).delete({
      id: In(ids.map((id) => `usp_${id}`)),
    });
  }

  // Any member of a seeded squad, then the squads themselves.
  await manager.getRepository(SquadParticipantEntity).delete({ squadId: In(SEEDED_SQUAD_IDS) });
  await manager.getRepository(SquadEntity).delete({ id: In(SEEDED_SQUAD_IDS) });
  await manager.getRepository(SquadScoreProfileEntity).delete({
    id: In(SEEDED_SQUAD_IDS.map((id) => `ssp_${id}`)),
  });

  return ids.length;
}

async function insertChunked<T extends object>(
  manager: EntityManager,
  target: new () => T,
  rows: T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await manager.getRepository(target).insert(rows.slice(i, i + INSERT_CHUNK) as never);
  }
}

async function seed(manager: EntityManager): Promise<void> {
  const purged = await purgePreviousRun(manager);
  if (purged > 0) {
    // eslint-disable-next-line no-console
    console.log(`cleaned up ${purged} user(s) from a previous run`);
  }

  const users = buildUsers(Date.now());

  // Reversed FK: user.score_profile → user_score_profile.id, so profiles first.
  await insertChunked(
    manager,
    UserScoreProfileEntity,
    users.map((u) => ({ id: u.profileId, totalPoints: '0', gamesPlayed: 0 }) as UserScoreProfileEntity),
  );
  await insertChunked(
    manager,
    UserEntity,
    users.map(
      (u) =>
        ({
          id: u.id,
          walletAddress: u.walletAddress,
          shareCode: u.shareCode,
          handle: u.handle,
          emoji: u.emoji,
          scoreProfile: u.profileId,
          createdAt: u.createdAt,
        }) as UserEntity,
    ),
  );
  // eslint-disable-next-line no-console
  console.log(`inserted ${users.length} fake user(s)`);

  // --- squads -------------------------------------------------------------
  await insertChunked(
    manager,
    SquadScoreProfileEntity,
    SEEDED_SQUADS.map(
      (s) => ({ id: `ssp_${s.id}`, totalPoints: '0', gamesPlayed: 0 }) as SquadScoreProfileEntity,
    ),
  );
  await insertChunked(
    manager,
    SquadEntity,
    SEEDED_SQUADS.map(
      (s) =>
        ({
          id: s.id,
          name: s.name,
          emoji: s.emoji,
          inviteCode: s.inviteCode,
          active: true,
        }) as SquadEntity,
    ),
  );

  // Squad 1 is a real row that may not exist on a fresh DB — only claim it if
  // it does, and reuse its own score profile rather than inventing one.
  const realSquad1 = STUFF_REAL_SQUAD_1
    ? await manager.getRepository(SquadEntity).findOne({ where: { id: REAL_SQUAD_ID } })
    : null;

  const participants = users
    .filter((u) => u.squadId !== null)
    .filter((u) => u.squadId !== REAL_SQUAD_ID || realSquad1 !== null)
    .map(
      (u) =>
        ({
          squadId: u.squadId as number,
          userId: u.id,
          active: true,
          scoreProfile: `ssp_${u.squadId}`,
        }) as SquadParticipantEntity,
    );
  await insertChunked(manager, SquadParticipantEntity, participants);
  // eslint-disable-next-line no-console
  console.log(
    `inserted ${SEEDED_SQUADS.length} squad(s) and ${participants.length} membership(s)` +
      (realSquad1 ? ` (incl. squad ${REAL_SQUAD_ID})` : ''),
  );

  // --- participation + answers --------------------------------------------
  const questions = await loadResolvedQuestions(manager);
  if (questions.length === 0) {
    // eslint-disable-next-line no-console
    console.log('no finished games with resolved questions — users seeded with no activity');
    return;
  }

  const questionsByGame = new Map<number, ResolvedQuestion[]>();
  for (const q of questions) {
    const list = questionsByGame.get(q.gameId);
    if (list) list.push(q);
    else questionsByGame.set(q.gameId, [q]);
  }
  const gameIds = [...questionsByGame.keys()].sort((a, b) => a - b);

  const joins: UserGameEntity[] = [];
  const answers: UserGameAnswerEntity[] = [];

  for (const user of users) {
    for (const gameId of pickGames(user, gameIds)) {
      const gameQuestions = questionsByGame.get(gameId) ?? [];
      const firstAt = gameQuestions[0]?.resolvedAt ?? new Date();
      joins.push({
        gameId,
        userId: user.id,
        squadId: user.squadId,
        joinedAt: new Date(firstAt.getTime() - 3 * 60_000),
      } as UserGameEntity);

      for (const q of gameQuestions) {
        // Independent salted hashes so the three decisions can't correlate.
        if (hash01(`ans-${user.id}${q.id}`) >= user.answerRate) continue;

        const correct = hash01(`hit-${user.id}${q.id}`) < user.skill;
        const selectedOptionId = correct
          ? q.resolvedOptionId
          : q.wrongOptionIds[hash32(`wrong-${user.id}${q.id}`) % q.wrongOptionIds.length];

        answers.push({
          userId: user.id,
          gameId,
          gameQuestionId: q.id,
          selectedOptionId,
          rewardMultiplier: correct ? '1.000' : '0.000',
          // A correct pick's selected option IS the winning option, so this is
          // its own frozen base_gain. A wrong pick multiplies by 0.
          awardedPoints: correct ? q.winningGain : 0,
          successfulOutcome: correct,
          // Picked a few seconds inside the 5s window, resolved with the question.
          createdAt: new Date(q.resolvedAt.getTime() - 4000),
          resolvedAt: q.resolvedAt,
        } as UserGameAnswerEntity);
      }
    }
  }

  await insertChunked(manager, UserGameEntity, joins);
  await insertChunked(manager, UserGameAnswerEntity, answers);
  // eslint-disable-next-line no-console
  console.log(
    `inserted ${joins.length} game join(s) and ${answers.length} answer(s) ` +
      `across ${gameIds.length} finished game(s): ${gameIds.join(', ')}`,
  );

  await reconcileCounters(manager, users);
}

/**
 * The counters are decorative — nothing ranks on them — but
 * GET /users/:id/score-profile and the squad aggregates read them, so keep
 * them consistent with the answers just written.
 *
 * Squad 1's own `ssp_1` is deliberately NOT recomputed: this seed does not
 * mutate real rows beyond adding members. Its derived board is correct
 * regardless.
 */
async function reconcileCounters(manager: EntityManager, users: FakeUser[]): Promise<void> {
  const ids = users.map((u) => u.id);

  await manager.query(
    `UPDATE "user_score_profile" usp
        SET total_points = agg.pts, games_played = agg.games, updated_at = now()
       FROM (
         SELECT u.score_profile AS pid,
                COALESCE(SUM(uga.awarded_points), 0) AS pts,
                (SELECT COUNT(*) FROM "user_game" ug WHERE ug.user_id = u.id) AS games
           FROM "user" u
           LEFT JOIN "user_game_answer" uga
                  ON uga.user_id = u.id AND uga.awarded_points IS NOT NULL
          WHERE u.id = ANY($1) AND u.score_profile IS NOT NULL
          GROUP BY u.id, u.score_profile
       ) agg
      WHERE usp.id = agg.pid`,
    [ids],
  );

  await manager.query(
    `UPDATE "squad_score_profile" ssp
        SET total_points = agg.pts, games_played = agg.games, updated_at = now()
       FROM (
         SELECT 'ssp_' || ug.squad_id AS pid,
                COALESCE(SUM(uga.awarded_points), 0) AS pts,
                COUNT(DISTINCT ug.game_id) AS games
           FROM "user_game" ug
           LEFT JOIN "user_game_answer" uga
                  ON uga.user_id = ug.user_id
                 AND uga.game_id = ug.game_id
                 AND uga.awarded_points IS NOT NULL
          WHERE ug.squad_id = ANY($1)
          GROUP BY ug.squad_id
       ) agg
      WHERE ssp.id = agg.pid`,
    [SEEDED_SQUAD_IDS],
  );
}

/** Print the board the app will now render, as a sanity check. */
async function reportBoard(manager: EntityManager): Promise<void> {
  const rows: Array<{ handle: string; emoji: string | null; total_points: string }> =
    await manager.query(
      `SELECT u.handle, u.emoji, COALESCE(SUM(uga.awarded_points), 0) AS total_points
         FROM "user" u
         LEFT JOIN "user_game_answer" uga
                ON uga.user_id = u.id AND uga.awarded_points IS NOT NULL
        GROUP BY u.id, u.handle, u.emoji, u.created_at
        ORDER BY total_points DESC, u.created_at ASC
        LIMIT 10`,
    );
  // eslint-disable-next-line no-console
  console.log('\nglobal leaderboard (top 10):');
  rows.forEach((r, i) => {
    // eslint-disable-next-line no-console
    console.log(`  ${String(i + 1).padStart(2)}. ${r.emoji ?? ' '} ${r.handle.padEnd(18)} ${r.total_points}`);
  });
}

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    // One transaction: a partial seed would leave boards half-populated.
    await dataSource.transaction(async (manager) => {
      await seed(manager);
    });
    await reportBoard(dataSource.manager);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
