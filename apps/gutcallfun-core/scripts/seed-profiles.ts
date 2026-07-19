/**
 * Dev seed: gives existing users a persisted avatar emoji (backfilling rows
 * created before the emoji column) and a score profile with varied points, so
 * the (now DB-backed) leaderboard / rankings / squad standings show meaningful
 * real data. Idempotent — re-running upserts the same values.
 *
 * Usage: npm run seed:profiles
 */
import dataSource from '../src/db/data-source';
import { UserEntity } from '../src/models/account/user.entity';
import { UserScoreProfileEntity } from '../src/models/account/user-score-profile.entity';
import { UserGameEntity } from '../src/models/game/user-game.entity';
import { GameEntity } from '../src/models/game/game.entity';
import { GameStatus } from '../src/models/game/enums';

const EMOJIS = ['🦊', '🐸', '🐙', '🐼', '🚀', '🐢', '🐵', '🐺', '🐝', '🐳', '🦁', '🐧', '🦉', '🐰', '🐨', '🐯'];
// Descending points so the leaderboard has a clear ranking.
const POINTS = [820, 710, 640, 512, 430, 388, 305, 260, 190, 145, 96, 60];

async function main(): Promise<void> {
  await dataSource.initialize();
  const usersRepo = dataSource.getRepository(UserEntity);
  const profilesRepo = dataSource.getRepository(UserScoreProfileEntity);
  const users = await usersRepo.find({ order: { createdAt: 'ASC' } });

  let i = 0;
  for (const user of users) {
    if (!user.emoji) user.emoji = EMOJIS[i % EMOJIS.length];

    const profileId = `usp_${user.id}`;
    const points = POINTS[i % POINTS.length];
    await profilesRepo.upsert(
      { id: profileId, totalPoints: String(points), gamesPlayed: 3, updatedAt: new Date() },
      ['id'],
    );
    user.scoreProfile = profileId;
    await usersRepo.save(user);

    // eslint-disable-next-line no-console
    console.log(`  ${user.handle}: emoji=${user.emoji} points=${points}`);
    i++;
  }
  // Join a few users to the live game so the "who's in" strip has real data.
  const liveGame = await dataSource
    .getRepository(GameEntity)
    .findOne({ where: { status: GameStatus.LIVE } });
  if (liveGame) {
    const ugRepo = dataSource.getRepository(UserGameEntity);
    for (const user of users.slice(0, 4)) {
      await ugRepo
        .createQueryBuilder()
        .insert()
        .into(UserGameEntity)
        .values({ gameId: liveGame.id, userId: user.id, squadId: null })
        .orIgnore()
        .execute();
    }
    // eslint-disable-next-line no-console
    console.log(`joined ${Math.min(4, users.length)} user(s) to live game ${liveGame.id}`);
  }

  // eslint-disable-next-line no-console
  console.log(`seeded ${users.length} user profile(s)`);
  await dataSource.destroy();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
