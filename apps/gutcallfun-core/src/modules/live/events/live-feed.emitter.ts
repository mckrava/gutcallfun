import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { LiveFeedMessage } from './live-feed.event';

const FEED_EVENT = 'live-feed-message';

/**
 * Typed wrapper around a native Node EventEmitter — the exact pattern
 * `GameStreamGapEmitter` establishes (zero new pub/sub dependency, no
 * @nestjs/event-emitter, no RxJS).
 *
 * This is the ingest -> live-engine seam. Handlers are invoked SYNCHRONOUSLY
 * on the ingest call stack, so every handler must return immediately and must
 * never throw: a handler that throws here would propagate straight back into
 * `EventIngestService.processEvent` and stall the pipeline. The engine's
 * handler therefore does nothing but enqueue onto its own per-game promise
 * chain, and the emit site is additionally wrapped in try/catch as a
 * belt-and-suspenders guard.
 */
@Injectable()
export class LiveFeedEmitter {
  private readonly emitter = new EventEmitter();

  emit(payload: LiveFeedMessage): void {
    this.emitter.emit(FEED_EVENT, payload);
  }

  on(handler: (payload: LiveFeedMessage) => void): void {
    this.emitter.on(FEED_EVENT, handler);
  }
}
