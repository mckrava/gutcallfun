/**
 * Dev seed for the UI match lists (live hero / coming-up / past results).
 *
 * Inserts a genuinely LIVE game (so the client's "LIVE NOW" hero has real data
 * to show), a couple of extra SCHEDULED games (fuller "COMING UP"), and gives
 * the existing 0-0 FINISHED games real, varied scores (fuller "Your results").
 *
 * This is a demo/data-shaping tool only — it does NOT start any WS/replay
 * stream (that is the replay scheduler's job; see scripts/replay-create.ts and
 * SourceSchedulerService). It only shapes rows the REST match lists read.
 *
 * Idempotent: seeded rows are keyed by marker fixtureIds in the 900000+ range
 * (far from the real ~18M feed ids), so re-running upserts instead of
 * duplicating; finished-score backfill is deterministic from each row's id.
 *
 * Usage:
 *   npm run seed:matches
 */
import dataSource from '../src/db/data-source';
import { GameEntity } from '../src/models/game/game.entity';
import { GameStatus } from '../src/models/game/enums';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

interface SeedRow {
  fixtureId: number;
  status: GameStatus;
  team1Name: string;
  team2Name: string;
  competition: string;
  scoreP1: number;
  scoreP2: number;
  startsAt: Date;
}

function seededRows(now: number): SeedRow[] {
  return [
    // The ongoing match — kicked off ~50 minutes ago, currently 1-0.
    {
      fixtureId: 900001,
      status: GameStatus.LIVE,
      team1Name: 'Brazil',
      team2Name: 'Argentina',
      competition: 'World Cup',
      scoreP1: 1,
      scoreP2: 0,
      startsAt: new Date(now - 50 * MINUTE_MS),
    },
    // Extra upcoming fixtures so "COMING UP" isn't a single row.
    {
      fixtureId: 900002,
      status: GameStatus.SCHEDULED,
      team1Name: 'Portugal',
      team2Name: 'Spain',
      competition: 'World Cup',
      scoreP1: 0,
      scoreP2: 0,
      startsAt: new Date(now + 1 * DAY_MS),
    },
    {
      fixtureId: 900003,
      status: GameStatus.SCHEDULED,
      team1Name: 'Germany',
      team2Name: 'Netherlands',
      competition: 'World Cup',
      scoreP1: 0,
      scoreP2: 0,
      startsAt: new Date(now + 2 * DAY_MS),
    },
  ];
}

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(GameEntity);
    const now = Date.now();

    // 1) Upsert the seeded live/scheduled rows by marker fixtureId.
    for (const row of seededRows(now)) {
      const existing = await repo.findOne({ where: { fixtureId: row.fixtureId } });
      const entity = repo.create({
        ...(existing ?? {}),
        fixtureId: row.fixtureId,
        status: row.status,
        team1Name: row.team1Name,
        team2Name: row.team2Name,
        competition: row.competition,
        scoreP1: row.scoreP1,
        scoreP2: row.scoreP2,
        startsAt: row.startsAt,
        participant1IsHome: true,
        isReplay: false,
      });
      const saved = await repo.save(entity);
      // eslint-disable-next-line no-console
      console.log(
        `${existing ? 'updated' : 'inserted'} ${row.status} game id=${saved.id} ` +
          `fixtureId=${row.fixtureId} "${row.team1Name} ${row.scoreP1}-${row.scoreP2} ${row.team2Name}"`,
      );
    }

    // 2) Backfill real scores onto finished games that are still 0-0, so the
    //    "Your results" list shows genuine results. Deterministic from id →
    //    stable and idempotent across re-runs.
    const finished = await repo.find({ where: { status: GameStatus.FINISHED } });
    let backfilled = 0;
    for (const g of finished) {
      if (g.scoreP1 !== 0 || g.scoreP2 !== 0) continue; // leave already-scored rows
      g.scoreP1 = g.id % 4; // 0..3
      g.scoreP2 = (g.id * 3) % 4; // 0..3, different distribution
      await repo.save(g);
      backfilled++;
    }
    // eslint-disable-next-line no-console
    console.log(`backfilled scores on ${backfilled} finished game(s)`);
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
