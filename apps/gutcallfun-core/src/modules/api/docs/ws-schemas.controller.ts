import { Controller, Get } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SnapshotDto } from '../../realtime/dto/snapshot.dto';
import { MatchClockDto } from '../../realtime/dto/match-clock.dto';
import { GameEventMessageDto } from '../../realtime/dto/game-event-message.dto';
import { QuestionMessageDto } from '../../realtime/dto/question-message.dto';
import { ResolutionMessageDto } from '../../realtime/dto/resolution-message.dto';
import { VoidMessageDto } from '../../realtime/dto/void-message.dto';
import { SubscribeDto } from '../../realtime/dto/subscribe.dto';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * Swagger/OpenAPI has no native WebSocket support (RESEARCH.md Pattern 6), so
 * without this controller the five server-to-client WS message DTOs would
 * never appear in `components.schemas` — half the contract this phase
 * freezes would be invisible in the published document. `@ApiExtraModels`
 * forces schema registration for classes that no REST route otherwise
 * references; this controller's own `GET /docs/ws-contract` route is a
 * secondary convenience (a machine-readable event-catalogue index), not the
 * primary reason this file exists.
 *
 * Registered directly on `ApiModule` rather than as a seventh resource
 * module (Task 1 instruction) — this documents a cross-cutting concern (the
 * WS wire contract), not a REST resource with its own service/fixtures.
 */
@ApiTags('websocket')
@ApiExtraModels(
  SnapshotDto,
  MatchClockDto,
  GameEventMessageDto,
  QuestionMessageDto,
  ResolutionMessageDto,
  VoidMessageDto,
  SubscribeDto,
)
@Controller('docs')
export class WsSchemasController {
  @Public()
  @Get('ws-contract')
  @ApiOperation({
    summary:
      'Machine-readable index of the WebSocket event catalogue (event name, direction, cadence, DTO schema name).',
    description:
      'Swagger cannot describe socket.io events natively — this route plus the ' +
      '`@ApiExtraModels`-registered schemas below (see the Schemas section at the bottom of ' +
      'this document) are, together, the discoverable WS contract. See docs/WS-CONTRACT.md in ' +
      'the repository for the full human-readable write-up (connection, CORS, auth, a timed ' +
      'one-cycle diagram, and the "this is a mock" disclosure).',
  })
  @ApiOkResponse({
    description:
      'The WS event catalogue: one entry per event, naming its direction, cadence, and the ' +
      'Swagger schema name to look up for its payload shape.',
  })
  getWsContract() {
    return {
      contract_doc: 'docs/WS-CONTRACT.md',
      events: [
        {
          event: 'subscribe',
          direction: 'client -> server',
          cadence: 'on demand',
          schema: 'SubscribeDto',
        },
        {
          event: 'unsubscribe',
          direction: 'client -> server',
          cadence: 'on demand',
          schema: 'SubscribeDto',
        },
        {
          event: 'snapshot',
          direction: 'server -> client',
          cadence: 'once, immediately on subscribe',
          schema: 'SnapshotDto',
        },
        {
          event: 'game_event',
          direction: 'server -> client',
          cadence: '~4s heartbeat while a room has a subscriber',
          schema: 'GameEventMessageDto',
        },
        {
          event: 'question',
          direction: 'server -> client',
          cadence: '~30s',
          schema: 'QuestionMessageDto',
        },
        {
          event: 'resolution',
          direction: 'server -> client',
          cadence: '~5s after its correlated question',
          schema: 'ResolutionMessageDto',
        },
        {
          event: 'void',
          direction: 'server -> client',
          cadence: 'never emitted this phase (shape frozen for Phase 4)',
          schema: 'VoidMessageDto',
        },
      ],
    };
  }
}
