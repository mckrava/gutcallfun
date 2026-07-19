import { ScoreProfileService } from './score-profile.service';

/**
 * These specs pin the CONTRACT the callers depend on — derived ids, the
 * two-statement create-then-link ordering the reversed FK forces, and the
 * "only credit the squad you played for" join — without a Postgres connection.
 *
 * The SQL itself is verified against a real database by the scratch proof
 * described in the phase record; what cannot be mocked meaningfully is asserted
 * there, not here.
 */
describe('ScoreProfileService', () => {
  describe('derived ids', () => {
    it('derives the user profile id from the user id', () => {
      expect(ScoreProfileService.userProfileId('abc-123')).toBe('usp_abc-123');
    });

    it('derives the squad profile id from the squad id', () => {
      expect(ScoreProfileService.squadProfileId(7)).toBe('ssp_7');
    });

    it('is stable — the same input always yields the same id', () => {
      // This is what makes every ensure*/link* call idempotent without a
      // lookup. A random id here would create a second profile per call.
      expect(ScoreProfileService.userProfileId('u1')).toBe(
        ScoreProfileService.userProfileId('u1'),
      );
    });
  });

  /**
   * Recording query-builder mock: captures the ORDER of operations, which is
   * the part that matters. `user.score_profile` FKs to `user_score_profile.id`,
   * so linking before inserting is a foreign-key violation at runtime.
   */
  type Builder = Record<string, jest.Mock>;

  interface ManagerMock {
    createQueryBuilder: jest.Mock<Builder, []>;
    query: jest.Mock<Promise<unknown[]>, [string, unknown[]?]>;
  }

  function createManagerMock(calls: string[]): ManagerMock {
    const builder: Builder = {};
    const chain = (name: string): jest.Mock =>
      jest.fn((arg?: unknown) => {
        if (name === 'into' || name === 'update') {
          const target = arg as { name?: string } | undefined;
          calls.push(`${name}:${target?.name ?? String(arg)}`);
        } else {
          calls.push(name);
        }
        return builder;
      });
    for (const m of [
      'insert',
      'into',
      'values',
      'orIgnore',
      'update',
      'set',
      'where',
    ]) {
      builder[m] = chain(m);
    }
    builder.execute = jest.fn(() => {
      calls.push('execute');
      return Promise.resolve({ affected: 1 });
    });
    return {
      createQueryBuilder: jest.fn(() => builder),
      query: jest.fn(() => Promise.resolve([])),
    };
  }

  function build() {
    const calls: string[] = [];
    const manager = createManagerMock(calls);
    // The service only ever touches `dataSource.manager` when a caller omits
    // an explicit manager; every spec below passes one, so this is enough.
    const dataSource = { manager } as unknown as ConstructorParameters<
      typeof ScoreProfileService
    >[0];
    return { service: new ScoreProfileService(dataSource), manager, calls };
  }

  /** Typed accessor for `manager.query` call args — avoids `any` in assertions. */
  const queryCall = (
    manager: ManagerMock,
    index: number,
  ): { sql: string; params: unknown[] } => {
    const call = manager.query.mock.calls[index];
    return { sql: call[0], params: call[1] ?? [] };
  };

  describe('ensureUserProfile', () => {
    it('inserts the profile BEFORE linking the user at it', async () => {
      const { service, manager, calls } = build();

      const id = await service.ensureUserProfile('u1', manager as never);

      expect(id).toBe('usp_u1');
      const insertAt = calls.indexOf('insert');
      const updateAt = calls.findIndex((c) => c.startsWith('update:'));
      expect(insertAt).toBeGreaterThanOrEqual(0);
      expect(updateAt).toBeGreaterThanOrEqual(0);
      // Reversed FK: the profile row must exist before user.score_profile can
      // reference it. Swapping these is a 23503 at runtime.
      expect(insertAt).toBeLessThan(updateAt);
    });

    it('inserts with orIgnore so a concurrent create is a no-op, not a crash', async () => {
      const { service, manager, calls } = build();
      await service.ensureUserProfile('u1', manager as never);
      expect(calls).toContain('orIgnore');
    });

    it('guards the link on score_profile IS NULL so it never clobbers an existing one', async () => {
      const { service, manager } = build();
      await service.ensureUserProfile('u1', manager as never);

      const builder = manager.createQueryBuilder();
      const whereCalls = builder.where.mock.calls as unknown[][];
      const whereArgs = whereCalls.map((c) => String(c[0]));
      expect(whereArgs.some((w) => w.includes('score_profile IS NULL'))).toBe(
        true,
      );
    });
  });

  describe('linkParticipantProfile', () => {
    it('ensures the squad profile exists before pointing the membership at it', async () => {
      const { service, manager, calls } = build();

      const id = await service.linkParticipantProfile(
        3,
        'u1',
        manager as never,
      );

      expect(id).toBe('ssp_3');
      const insertAt = calls.indexOf('insert');
      const updateAt = calls.findIndex((c) => c.startsWith('update:'));
      expect(insertAt).toBeLessThan(updateAt);
    });

    it('links every member of a squad at the SAME profile row', async () => {
      const { service, manager } = build();

      const a = await service.linkParticipantProfile(
        3,
        'userA',
        manager as never,
      );
      const b = await service.linkParticipantProfile(
        3,
        'userB',
        manager as never,
      );

      // One profile per squad — not one per membership. This is the decision
      // that makes GET /squads/:id/score-profile a real row read.
      expect(a).toBe(b);
      expect(a).toBe('ssp_3');
    });
  });

  describe('applyResolutionPoints', () => {
    it('credits users and squads in two aggregate statements, not one per answer', async () => {
      const { service, manager } = build();

      await service.applyResolutionPoints(manager as never, 'q1', 42);

      expect(manager.query).toHaveBeenCalledTimes(2);
    });

    it('scopes squad credit to the squad the user joined the game as', async () => {
      const { service, manager } = build();

      await service.applyResolutionPoints(manager as never, 'q1', 42);

      const { sql: squadSql } = queryCall(manager, 1);
      // user_game.squad_id — NOT every squad the user belongs to. A user in
      // three squads must not credit all three from one answer.
      expect(squadSql).toContain('"user_game"');
      expect(squadSql).toMatch(/ug\.game_id\s*=\s*\$2/);
      expect(squadSql).toMatch(/ug\.squad_id\s+IS NOT NULL/);
    });

    it('skips answers that are not yet resolved', async () => {
      const { service, manager } = build();

      await service.applyResolutionPoints(manager as never, 'q1', 42);

      for (let i = 0; i < manager.query.mock.calls.length; i++) {
        expect(queryCall(manager, i).sql).toContain(
          'awarded_points IS NOT NULL',
        );
      }
    });

    it('passes the question id and game id as bound parameters', async () => {
      const { service, manager } = build();

      await service.applyResolutionPoints(manager as never, 'q1', 42);

      expect(queryCall(manager, 0).params).toEqual(['q1']);
      expect(queryCall(manager, 1).params).toEqual(['q1', 42]);
    });
  });
});
