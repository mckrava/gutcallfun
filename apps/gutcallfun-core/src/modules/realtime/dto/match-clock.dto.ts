import { ApiProperty } from '@nestjs/swagger';

/**
 * D-07 match clock. Three of the four fields are grounded directly in a
 * primitive that exists in the Phase 2 state machine today:
 *  - `current_status_id` <- `GameState.currentStatusId`
 *  - `last_feed_ts`      <- `GameState.lastFeedTs`
 *  - `elapsed_ms`        <- the existing `feedElapsedMs(fromTs, toTs)` helper
 *
 * The fourth, `period_started_feed_ts`, is a FLAGGED ASSUMPTION: no anchor
 * for "when did the current period start" exists yet in `GameState`
 * (confirmed by direct inspection of `src/modules/ingest/state/clock.ts` and
 * `game-state.types.ts` — see 02.1-04-PLAN.md `<flagged_assumptions>`). The
 * mock returns a fixed deterministic value for it (D-04). Phase 5 must add a
 * `periodStartedFeedTs: number | null` field to `GameState`, set when
 * `currentStatusId` transitions into a play period, before this field can
 * carry a real value.
 *
 * Exposing the anchor alongside the derived value is the load-bearing design
 * choice: a client holding only `elapsed_ms` has a clock that is stale the
 * instant it arrives, whereas a client holding `period_started_feed_ts` can
 * tick locally between events.
 *
 * Deliberately excluded: injury/stoppage time, half length, a period
 * ordinal, and any preformatted display string ("63:12") — none of those
 * have a backing primitive, and freezing a wrong shape into the wire
 * contract is the expensive mistake this phase exists to prevent.
 */
export class MatchClockDto {
  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: 4,
    description:
      'Raw TxLINE StatusId — an open set (100 observed in the wild), never a closed enum. Tells the UI which period is running.',
  })
  current_status_id: number | null;

  @ApiProperty({
    nullable: true,
    example: '2026-07-18T15:12:03.000Z',
    description:
      'Match-time clock reading of the most recently processed event for this game.',
  })
  last_feed_ts: string | null;

  @ApiProperty({
    nullable: true,
    example: '2026-07-18T15:00:00.000Z',
    description:
      'The anchor the current period elapsed time is measured from. No backing state-machine field exists yet — see class-level doc comment (flagged assumption).',
  })
  period_started_feed_ts: string | null;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    example: 723000,
    description:
      'Elapsed match time in integer milliseconds, derived from period_started_feed_ts/last_feed_ts via the existing feedElapsedMs helper. Always an integer millisecond count — never a float, never a preformatted display string.',
  })
  elapsed_ms: number | null;
}
