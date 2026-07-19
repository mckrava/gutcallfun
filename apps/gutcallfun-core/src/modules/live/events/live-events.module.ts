import { Global, Module } from '@nestjs/common';
import { LiveFeedEmitter } from './live-feed.emitter';
import { LiveBroadcastEmitter } from './live-broadcast.emitter';

/**
 * @Global — mirrors `IngestSharedModule`. Both emitters are cross-module
 * singletons: `LiveFeedEmitter` is injected into `EventIngestService` (which
 * lives under `IngestModule`) while being consumed under `LiveModule`, and
 * `LiveBroadcastEmitter` is produced under `LiveModule` while being consumed
 * by `RealtimeGateway`. Registering them globally is what guarantees all
 * three modules share ONE instance — two instances would silently drop every
 * message.
 */
@Global()
@Module({
  providers: [LiveFeedEmitter, LiveBroadcastEmitter],
  exports: [LiveFeedEmitter, LiveBroadcastEmitter],
})
export class LiveEventsModule {}
