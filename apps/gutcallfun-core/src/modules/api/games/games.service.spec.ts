import { NotFoundException } from '@nestjs/common';
import { GAME_EVENTS_FIXTURE } from '../../../mocks/fixtures/game-events.fixtures';
import { GAMES_FIXTURE } from '../../../mocks/fixtures/games.fixtures';
import { GamesService } from './games.service';

// Source: 02.1-03-PLAN.md Task 2 acceptance criteria + must_haves.truths
// (GAME-02, GAME-03, D-04).
describe('GamesService', () => {
  let service: GamesService;

  beforeEach(() => {
    service = new GamesService();
  });

  describe('findAll', () => {
    it('returns items sorted by starts_at ascending', () => {
      const result = service.findAll({});
      const times = result.items.map((g) => Date.parse(g.starts_at as string));
      const sorted = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sorted);
    });

    it('two successive calls are deeply equal (D-04)', () => {
      const first = service.findAll({});
      const second = service.findAll({});
      expect(first).toEqual(second);
    });

    it('a status with no matching fixture (cancelled) returns an empty array with total 0', () => {
      const result = service.findAll({ status: 'cancelled' });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('limit: 1 returns exactly one item', () => {
      const result = service.findAll({ limit: 1 });
      expect(result.items).toHaveLength(1);
    });

    it('both games sharing an identical starts_at are present in the unfiltered result', () => {
      const result = service.findAll({});
      const tied = result.items.filter(
        (g) => g.starts_at === '2026-07-20T18:00:00.000Z',
      );
      expect(tied.map((g) => g.id).sort()).toEqual([1, 2]);
    });

    it('filters by user_id via the user_game fixture rows (GAME-03)', () => {
      const result = service.findAll({
        user_id: '11111111-1111-1111-1111-111111111111',
      });
      expect(result.items.map((g) => g.id).sort()).toEqual([1, 3]);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException on an absent id', () => {
      expect(() => service.findOne(9999)).toThrow(NotFoundException);
    });

    it('returns the matching game for a valid id', () => {
      const game = GAMES_FIXTURE[0];
      expect(service.findOne(game.id)).toEqual(game);
    });
  });

  describe('findEvents', () => {
    it('an after_seq equal to the highest fixture seq returns an empty array with next_seq null', () => {
      const highestSeq = Math.max(...GAME_EVENTS_FIXTURE.map((e) => e.seq));
      const result = service.findEvents(3, {
        after_seq: highestSeq,
        limit: 20,
      });
      expect(result.items).toEqual([]);
      expect(result.next_seq).toBeNull();
    });

    it('after_seq 0 returns items whose first seq is 1', () => {
      const result = service.findEvents(3, { after_seq: 0, limit: 20 });
      expect(result.items[0]?.seq).toBe(1);
    });

    it('throws NotFoundException when the game does not exist', () => {
      expect(() => service.findEvents(9999, { limit: 20 })).toThrow(
        NotFoundException,
      );
    });
  });

  describe('findQuestions', () => {
    it('every question has exactly four options whose base_gain values are 5, 7, 15, 100', () => {
      for (const game of GAMES_FIXTURE) {
        const questions = service.findQuestions(game.id, {});
        for (const question of questions) {
          expect(question.options).toHaveLength(4);
          expect(
            question.options.map((o) => o.base_gain).sort((a, b) => a - b),
          ).toEqual([5, 7, 15, 100]);
        }
      }
    });
  });

  describe('join', () => {
    it('returns a user_game shape with no surrogate id', () => {
      const result = service.join(1, {
        user_id: '33333333-3333-3333-3333-333333333333',
        squad_id: 7,
      });
      expect(result.game_id).toBe(1);
      expect(result.user_id).toBe('33333333-3333-3333-3333-333333333333');
      expect(result.squad_id).toBe(7);
      expect(typeof result.joined_at).toBe('string');
      expect(result).not.toHaveProperty('id');
    });

    it('throws NotFoundException when the game does not exist', () => {
      expect(() =>
        service.join(9999, { user_id: '33333333-3333-3333-3333-333333333333' }),
      ).toThrow(NotFoundException);
    });
  });
});
