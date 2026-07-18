import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { LiveBroadcast } from './live-broadcast.event';

const BROADCAST_EVENT = 'live-broadcast';

/**
 * live engine -> WebSocket gateway seam. Same typed-native-EventEmitter
 * pattern as `GameStreamGapEmitter`/`LiveFeedEmitter`.
 *
 * Inverting the dependency this way (engine emits, gateway subscribes) keeps
 * `LiveModule` free of any import of `RealtimeModule`, so there is no module
 * cycle: RealtimeModule -> LiveModule only.
 */
@Injectable()
export class LiveBroadcastEmitter {
  private readonly emitter = new EventEmitter();

  emit(payload: LiveBroadcast): void {
    this.emitter.emit(BROADCAST_EVENT, payload);
  }

  on(handler: (payload: LiveBroadcast) => void): void {
    this.emitter.on(BROADCAST_EVENT, handler);
  }
}
