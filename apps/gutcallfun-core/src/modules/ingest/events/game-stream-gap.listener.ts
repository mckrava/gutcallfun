import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GameStreamGapEmitter } from './game-stream-gap.emitter';
import { GameStreamGapDetected } from './game-stream-gap.event';

// Phase 2: log-only listener (D-13 seam). Phase 4 replaces this listener
// body with real void+refund + goal-adjudication logic — do not extend this
// class with resolution behavior; swap the listener body wholesale then.
@Injectable()
export class GameStreamGapLogListener implements OnModuleInit {
  private readonly logger = new Logger(GameStreamGapLogListener.name);

  constructor(private readonly gapEmitter: GameStreamGapEmitter) {}

  onModuleInit(): void {
    this.gapEmitter.on((payload: GameStreamGapDetected) => this.handle(payload));
  }

  private handle(payload: GameStreamGapDetected): void {
    // PHASE-4 SEAM: replace this log-only body with void+refund + goal
    // adjudication (D-13). Same seam is reused for restart-hole detection
    // (RCVR-02).
    this.logger.warn(
      `Stream gap detected for game ${payload.gameId}: expected seq ${payload.expectedSeq}, got ${payload.actualSeq} (at ${payload.at.toISOString()})`,
    );
  }
}
