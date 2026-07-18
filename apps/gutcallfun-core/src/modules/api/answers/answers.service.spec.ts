import { AnswersService } from './answers.service';

// Source: 02.1-03-PLAN.md Task 3 acceptance criteria (D-04, D-05).
describe('AnswersService', () => {
  let service: AnswersService;

  beforeEach(() => {
    service = new AnswersService();
  });

  describe('create', () => {
    it('returns awarded_points null, successful_outcome null, reward_multiplier 1', () => {
      const result = service.create({
        user_id: '33333333-3333-3333-3333-333333333333',
        game_question_id: '00000000-0000-4000-8000-0000000000f1',
        selected_option_id: '00000000-0000-4000-8000-000000000103',
      });

      expect(result.awarded_points).toBeNull();
      expect(result.successful_outcome).toBeNull();
      expect(result.reward_multiplier).toBe(1);
      expect(result.resolved_at).toBeNull();
    });
  });

  describe('findAll', () => {
    it('two successive calls are deeply equal (D-04)', () => {
      const first = service.findAll({});
      const second = service.findAll({});
      expect(first).toEqual(second);
    });

    it('filters by user_id', () => {
      const result = service.findAll({
        user_id: '11111111-1111-1111-1111-111111111111',
      });
      expect(
        result.items.every(
          (a) => a.user_id === '11111111-1111-1111-1111-111111111111',
        ),
      ).toBe(true);
    });
  });
});
