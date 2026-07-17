/**
 * ReplaySourceService (D-01) — resolves the ordered raw-event array for a
 * replay game, trying Source A (historical fetch, cached in-memory) first
 * and falling back to Source B (captured NDJSON file, then the game's own
 * game_event rows ORDER BY seq) when Source A comes back empty (RESEARCH
 * Pitfall 2: the historical endpoint's 2wk-6h retention window).
 *
 * Source B's "own game_event rows" branch is the SAME read pattern the
 * Plan-07 boot-recovery service reuses (RCVR-01, D-01: "build once, use
 * twice") — an ordered `SELECT ... WHERE game_id = ? ORDER BY seq` over the
 * append-only log.
 *
 * Never depends on TxLINE VirtualFixture (D-05, absent from the OpenAPI
 * spec / unverified) — Source B has no dependency on TxLINE at all.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { GameEntity } from '../../../models/game/game.entity';
import { GameEventEntity } from '../../../models/game/game-event.entity';
import { HistoricalClient } from './historical.client';

// Convention-based capture directory for Source B's NDJSON branch — a
// git-ignored operator-supplied directory of `<fixtureId>.ndjson` files
// (the "19 captured matches" referenced in CONTEXT.md Specifics), overridable
// via REPLAY_CAPTURES_DIR for a demo machine that keeps captures elsewhere.
// Not routed through the fail-fast AppConfig schema: this is an optional,
// non-security-critical convenience path with a safe default (an empty/
// absent directory simply falls through to the game_event-rows branch).
function capturesDir(): string {
  return process.env.REPLAY_CAPTURES_DIR ?? join(process.cwd(), 'replay-captures');
}

@Injectable()
export class ReplaySourceService {
  private readonly logger = new Logger(ReplaySourceService.name);

  constructor(
    private readonly historicalClient: HistoricalClient,
    @InjectRepository(GameEventEntity)
    private readonly gameEventRepo: Repository<GameEventEntity>,
  ) {}

  /**
   * Resolve the ordered raw-event array to replay for `game`. Source A
   * first; on empty, Source B (NDJSON capture file, then the game's own
   * game_event rows). Never throws for a legitimate "no data anywhere"
   * outcome — returns `[]` so the caller can surface a clear "nothing to
   * replay" error instead of an opaque one.
   */
  async load(game: GameEntity): Promise<Record<string, unknown>[]> {
    const historical = await this.historicalClient.fetch(game.fixtureId);
    if (historical.length > 0) {
      return historical;
    }

    this.logger.warn(
      `Source A (historical) empty for fixture ${game.fixtureId} (gameId ${game.id}) — falling back to Source B`,
    );
    return this.loadSourceB(game);
  }

  private async loadSourceB(game: GameEntity): Promise<Record<string, unknown>[]> {
    const fromCapture = this.tryReadNdjsonCapture(game.fixtureId);
    if (fromCapture.length > 0) {
      return fromCapture;
    }

    return this.loadOwnGameEventRows(game.id);
  }

  private tryReadNdjsonCapture(fixtureId: number): Record<string, unknown>[] {
    const filePath = join(capturesDir(), `${fixtureId}.ndjson`);
    if (!existsSync(filePath)) {
      return [];
    }

    try {
      return this.parseNdjsonCapture(readFileSync(filePath, 'utf8'));
    } catch (err) {
      this.logger.warn(
        `Failed to read NDJSON capture ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /**
   * Reference-repo NDJSON capture format: each line is either a data
   * record `{ receivedAt, seq, raw: "<json-string>" }` or a meta record
   * (heartbeats etc., no `raw` field). Only data records feed the
   * downstream pipeline — `raw` is JSON.parse'd back into the actual raw
   * feed message object; meta records are skipped (they never went through
   * processEvent live either).
   */
  private parseNdjsonCapture(content: string): Record<string, unknown>[] {
    const events: Record<string, unknown>[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;

      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue; // malformed line — skip, never throw (defensive parse)
      }

      if (typeof record.raw !== 'string') {
        continue; // meta record — not a replayable feed message
      }

      try {
        const parsed: unknown = JSON.parse(record.raw);
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          events.push(parsed as Record<string, unknown>);
        }
      } catch {
        continue;
      }
    }

    return events;
  }

  private async loadOwnGameEventRows(gameId: number): Promise<Record<string, unknown>[]> {
    const rows = await this.gameEventRepo.find({
      where: { gameId },
      order: { seq: 'ASC' },
    });
    return rows.map((row) => row.payload);
  }
}
