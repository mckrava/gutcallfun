import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { GameStreamGapDetected } from './game-stream-gap.event';

const GAP_EVENT = 'game-stream-gap';

// Typed wrapper around a native Node EventEmitter (RESEARCH Standard Stack:
// zero new pub/sub dependency, ~15 lines, sufficient for exactly one event
// type with one Phase-2 listener). D-13 seam — see game-stream-gap.event.ts.
@Injectable()
export class GameStreamGapEmitter {
  private readonly emitter = new EventEmitter();

  emit(payload: GameStreamGapDetected): void {
    this.emitter.emit(GAP_EVENT, payload);
  }

  on(handler: (payload: GameStreamGapDetected) => void): void {
    this.emitter.on(GAP_EVENT, handler);
  }
}
