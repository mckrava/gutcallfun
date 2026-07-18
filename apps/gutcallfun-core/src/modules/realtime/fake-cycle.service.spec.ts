import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Server } from 'socket.io';
import { FakeCycleService } from './fake-cycle.service';

describe('FakeCycleService', () => {
  let service: FakeCycleService;
  let scheduler: SchedulerRegistry;
  let emit: jest.Mock;
  let to: jest.Mock;
  let server: Server;

  beforeEach(async () => {
    jest.useFakeTimers();

    emit = jest.fn();
    to = jest.fn().mockReturnValue({ emit });
    server = { to } as unknown as Server;

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [FakeCycleService, SchedulerRegistry],
    }).compile();

    service = moduleRef.get(FakeCycleService);
    scheduler = moduleRef.get(SchedulerRegistry);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('registers exactly two intervals total when subscribed twice for the same room', () => {
    service.startCycleForRoom('game:3', 3, server);
    service.startCycleForRoom('game:3', 3, server);

    expect(scheduler.getIntervals()).toHaveLength(2);
    expect(scheduler.getIntervals()).toEqual(
      expect.arrayContaining(['heartbeat:game:3', 'question-cycle:game:3']),
    );
  });

  it('emits exactly one game_event after advancing 4000ms', () => {
    service.startCycleForRoom('game:3', 3, server);

    jest.advanceTimersByTime(4_000);

    const gameEventEmits = emit.mock.calls.filter(([event]) => event === 'game_event');
    expect(gameEventEmits).toHaveLength(1);
    expect(to).toHaveBeenCalledWith('game:3');
  });

  it('does not double the heartbeat rate when subscribed twice for the same room', () => {
    service.startCycleForRoom('game:3', 3, server);
    service.startCycleForRoom('game:3', 3, server);

    jest.advanceTimersByTime(4_000);

    const gameEventEmits = emit.mock.calls.filter(([event]) => event === 'game_event');
    expect(gameEventEmits).toHaveLength(1);
  });

  it('emits a question then its correlated resolution after 30000ms + 5000ms', () => {
    service.startCycleForRoom('game:3', 3, server);

    jest.advanceTimersByTime(30_000);
    const questionEmits = emit.mock.calls.filter(([event]) => event === 'question');
    expect(questionEmits).toHaveLength(1);
    const question = questionEmits[0][1] as { id: string; options: { id: string }[] };

    jest.advanceTimersByTime(5_000);
    const resolutionEmits = emit.mock.calls.filter(([event]) => event === 'resolution');
    expect(resolutionEmits).toHaveLength(1);
    const resolution = resolutionEmits[0][1] as {
      game_question_id: string;
      resolved_option_id: string;
    };

    expect(resolution.game_question_id).toBe(question.id);
    expect(question.options.map((option) => option.id)).toContain(
      resolution.resolved_option_id,
    );
  });

  it('stopCycleForRoom removes both intervals', () => {
    service.startCycleForRoom('game:3', 3, server);

    service.stopCycleForRoom('game:3');

    expect(scheduler.getIntervals()).toHaveLength(0);
  });

  it('onModuleDestroy leaves getIntervals() empty', () => {
    service.startCycleForRoom('game:3', 3, server);
    service.startCycleForRoom('game:4', 4, server);

    service.onModuleDestroy();

    expect(scheduler.getIntervals()).toHaveLength(0);
    expect(scheduler.getTimeouts()).toHaveLength(0);
  });
});
