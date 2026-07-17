/**
 * Dev/admin arming tool (D-06, D-08, RPLY-03).
 *
 * Creates an `is_replay=true` game row for demo choreography — the
 * fixture-list-first, join-then-go-live sequence CONTEXT.md's Specifics
 * section describes. This script only INSERTS the row; it does not start
 * the replay itself (that is the ~15s replay-arm scheduler's job, Plan 07 —
 * D-06: "`starts_at<=now() AND status='scheduled'`" is the trigger rule for
 * ALL games, live or replay).
 *
 * Usage:
 *   npm run replay:create -- <fixtureId> [--speed N] [--team1 Name] [--team2 Name]
 *
 * `--speed N` (D-04) is a headless-testing-only knob: it is never persisted
 * as a game-row column (none exists in initial-db-structure.sql, and this
 * project does not add one — "DB schema is authoritative; deviations need
 * explicit justification", CLAUDE.md) and it is never reachable from any
 * user-facing surface. It is printed here as an operator instruction:
 * ReplayStarterService.start() reads a REPLAY_SPEED environment variable as
 * its headless-config fallback when no explicit speed argument is passed
 * (see replay-starter.service.ts) — set that env var on the app process
 * before manually triggering a non-1x playback, or wire it up when the
 * Plan-07 scheduler is built.
 */
import dataSource from '../src/db/data-source';
import { GameEntity } from '../src/models/game/game.entity';
import { GameStatus } from '../src/models/game/enums';

const THREE_MINUTES_MS = 3 * 60 * 1000;

export interface ReplayCreateArgs {
  fixtureId: number;
  speed: number;
  team1Name?: string;
  team2Name?: string;
}

/**
 * Parse `npm run replay:create -- <fixtureId> [--speed N] [--team1 Name] [--team2 Name]`
 * style argv (already stripped of `node`/script-path entries). Validates
 * fixtureId as a positive integer BEFORE any DB write (same discipline as
 * TxlineHttpClient.buildFixtureUrl — never let an unvalidated id reach a
 * network call or a database row).
 */
export function parseReplayCreateArgs(argv: string[]): ReplayCreateArgs {
  const positional: string[] = [];
  let speed = 1;
  let team1Name: string | undefined;
  let team2Name: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--speed' && i + 1 < argv.length) {
      const raw = parseFloat(argv[++i]);
      if (!Number.isFinite(raw) || raw <= 0) {
        throw new Error(`--speed must be a positive finite number; got "${argv[i]}"`);
      }
      speed = raw;
    } else if (arg === '--team1' && i + 1 < argv.length) {
      team1Name = argv[++i];
    } else if (arg === '--team2' && i + 1 < argv.length) {
      team2Name = argv[++i];
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  const fixtureIdRaw = positional[0];
  const fixtureId = Number(fixtureIdRaw);
  if (fixtureIdRaw === undefined || !Number.isInteger(fixtureId) || fixtureId <= 0) {
    throw new Error(
      `replay:create: fixtureId must be a positive integer; got "${String(fixtureIdRaw)}". ` +
        'Usage: npm run replay:create -- <fixtureId> [--speed N] [--team1 Name] [--team2 Name]',
    );
  }

  return { fixtureId, speed, team1Name, team2Name };
}

async function main(): Promise<void> {
  const args = parseReplayCreateArgs(process.argv.slice(2));

  await dataSource.initialize();
  try {
    const gameRepo = dataSource.getRepository(GameEntity);

    // D-08 choreography: starts_at = now() + ~3min so the fixture list
    // renders this as genuinely upcoming, giving time to record the
    // browse/join segment before the scheduler fires it live.
    const startsAt = new Date(Date.now() + THREE_MINUTES_MS);

    const game = gameRepo.create({
      fixtureId: args.fixtureId,
      status: GameStatus.SCHEDULED,
      startsAt,
      isReplay: true,
      team1Name: args.team1Name ?? `Fixture ${args.fixtureId} - Team 1`,
      team2Name: args.team2Name ?? `Fixture ${args.fixtureId} - Team 2`,
    });

    // uq_game_fixture_live is a PARTIAL unique index (WHERE NOT is_replay,
    // game.entity.ts) — inserting multiple is_replay=true rows for the SAME
    // fixtureId is permitted, so re-running this script for another take
    // never collides (RPLY-03: multiple takes = multiple replay rows).
    const saved = await gameRepo.save(game);

    // eslint-disable-next-line no-console
    console.log(
      `Created replay game id=${saved.id} fixtureId=${saved.fixtureId} ` +
        `starts_at=${saved.startsAt?.toISOString()} team1="${saved.team1Name}" team2="${saved.team2Name}"`,
    );
    if (args.speed !== 1) {
      // eslint-disable-next-line no-console
      console.log(
        `speed=${args.speed} requested (headless-testing only, D-04) — set ` +
          `REPLAY_SPEED=${args.speed} on the app process before this replay starts ` +
          '(never a user-facing control).',
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

// Only run when invoked directly (`npm run replay:create`), not when this
// module is imported by a test for parseReplayCreateArgs.
if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
