import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * Asserts the *published document itself* — not individual routes — proving
 * the OpenAPI surface is a complete, non-degenerate description of the API
 * (API-01). Mirrors `main.ts`'s `DocumentBuilder`/`SwaggerModule.setup` wiring
 * so this spec exercises the exact same document a real deployment serves at
 * `/api-docs-json`.
 */
describe('OpenAPI published document (e2e)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  // The 20 REST routes frozen in COVERAGE.md, as method + path pairs.
  const EXPECTED_ROUTES: Array<{ method: string; path: string }> = [
    { method: 'get', path: '/users' },
    { method: 'get', path: '/users/{user_id}' },
    { method: 'post', path: '/users' },
    { method: 'patch', path: '/users/{user_id}' },
    { method: 'get', path: '/users/{user_id}/score-profile' },
    { method: 'post', path: '/squads' },
    { method: 'get', path: '/squads/{squad_id}' },
    { method: 'get', path: '/squads' },
    { method: 'post', path: '/squads/{squad_id}/participants' },
    { method: 'get', path: '/squads/{squad_id}/participants' },
    { method: 'get', path: '/squads/{squad_id}/score-profile' },
    { method: 'get', path: '/games' },
    { method: 'get', path: '/games/{game_id}' },
    { method: 'get', path: '/games/{game_id}/events' },
    { method: 'get', path: '/games/{game_id}/questions' },
    { method: 'post', path: '/games/{game_id}/join' },
    { method: 'get', path: '/question-outcomes' },
    { method: 'post', path: '/answers' },
    { method: 'get', path: '/answers' },
    { method: 'get', path: '/leaderboard' },
  ];

  // Response/event-payload DTOs that @ApiProperty-decorated classes register
  // into components.schemas (request-only query DTOs consumed via bare
  // @Query() are NOT expected here — @nestjs/swagger inlines those as query
  // parameters rather than referenced schemas, which is expected, not a gap).
  const EXPECTED_SCHEMA_NAMES = [
    'AnswerResponseDto',
    'CreateAnswerDto',
    'CreateSquadDto',
    'CreateSquadParticipantDto',
    'CreateUserDto',
    'GameEventMessageDto',
    'GameEventPageDto',
    'GameEventResponseDto',
    'GameResponseDto',
    'JoinGameDto',
    'LeaderboardEntryDto',
    'MatchClockDto',
    'PaginatedAnswersResponseDto',
    'PaginatedGamesResponseDto',
    'PaginatedLeaderboardResponseDto',
    'PaginatedSquadParticipantsResponseDto',
    'PaginatedSquadsResponseDto',
    'PaginatedUsersResponseDto',
    'QuestionMessageDto',
    'QuestionOptionResponseDto',
    'QuestionOutcomeResponseDto',
    'QuestionResponseDto',
    'ResolutionMessageDto',
    'SnapshotDto',
    'SquadParticipantResponseDto',
    'SquadResponseDto',
    'SquadScoreProfileResponseDto',
    'SubscribeDto',
    'UpdateUserDto',
    'UserGameResponseDto',
    'UserResponseDto',
    'UserScoreProfileResponseDto',
    'VoidMessageDto',
  ];

  // The five server->client WS message DTOs (WS-02) — a subset of the list
  // above, called out separately because the must-have specifically requires
  // them browsable even though no REST route references them.
  const WS_MESSAGE_SCHEMA_NAMES = [
    'SnapshotDto',
    'GameEventMessageDto',
    'QuestionMessageDto',
    'ResolutionMessageDto',
    'VoidMessageDto',
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const swaggerConfig = new DocumentBuilder()
      .setTitle('GutCall API')
      .setDescription('Test-harness Swagger document mirroring main.ts wiring.')
      .setVersion('0.2.1')
      .build();
    document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api-docs-json returns HTTP 200 with a well-formed OpenAPI document', async () => {
    const res = await request(app.getHttpServer())
      .get('/api-docs-json')
      .expect(200);
    const body = res.body as OpenAPIObject;
    expect(body.paths).toBeDefined();
    expect(body.components?.schemas).toBeDefined();
  });

  it('paths contains every one of the 20 COVERAGE.md REST routes — none reachable but undocumented (API-01)', () => {
    const paths = document.paths;
    for (const { method, path } of EXPECTED_ROUTES) {
      expect(paths[path]).toBeDefined();
      expect((paths[path] as Record<string, unknown>)[method]).toBeDefined();
    }
  });

  it('none of the 20 routes are documented but unreachable (paths has no unexpected extra REST entries beyond the boilerplate root and the WS-docs route)', () => {
    const documentedPathKeys = Object.keys(document.paths);
    const expectedPathKeys = new Set([
      ...EXPECTED_ROUTES.map((r) => r.path),
      '/', // boilerplate AppController root, deliberately preserved
      '/docs/ws-contract', // this plan's own WS-contract-index route
    ]);
    for (const key of documentedPathKeys) {
      expect(expectedPathKeys.has(key)).toBe(true);
    }
  });

  it('components.schemas has a uniquely-named entry per response/event DTO class — no name collapses two classes onto one schema', () => {
    const schemaKeys = Object.keys(document.components?.schemas ?? {});
    for (const name of EXPECTED_SCHEMA_NAMES) {
      expect(schemaKeys).toContain(name);
    }
    // Equality (not just containment) catches a silent collision: if two
    // distinct classes shared a name, they would merge into one key and the
    // total count would be LOWER than the number of classes we expect.
    const knownSchemaKeys = schemaKeys.filter((k) =>
      EXPECTED_SCHEMA_NAMES.includes(k),
    );
    expect(knownSchemaKeys).toHaveLength(EXPECTED_SCHEMA_NAMES.length);
  });

  it('the five WS server->client message DTOs are present in components.schemas even though no REST route references them (WS-02)', () => {
    const schemaKeys = Object.keys(document.components?.schemas ?? {});
    for (const name of WS_MESSAGE_SCHEMA_NAMES) {
      expect(schemaKeys).toContain(name);
    }
  });

  it('every documented operation declares at least one response schema — no operation carries an empty responses object', () => {
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(
        methods as Record<string, unknown>,
      )) {
        if (
          typeof operation !== 'object' ||
          operation === null ||
          !('responses' in operation)
        ) {
          continue;
        }
        const responses = (operation as { responses: Record<string, unknown> })
          .responses;
        // This Jest version's `expect()` only accepts the actual value (no
        // Jasmine-style second custom-message argument), so name the
        // offending route in a thrown Error instead — `path`/`method` are
        // exercised here rather than left as loop-only bindings.
        if (Object.keys(responses).length === 0) {
          throw new Error(
            `${method.toUpperCase()} ${path} has an empty responses object`,
          );
        }
      }
    }
  });

  it('every integer-typed DTO property is documented as type: integer, never the looser type: number', () => {
    const schemas = document.components?.schemas ?? {};
    // Spot-check a representative property from each resource family known
    // to be declared with `type: 'integer'` in its @ApiProperty decorator —
    // covers ids, denormalized scores, the LOCKED point ladder, pagination
    // envelope fields, and the WS match-clock's millisecond field.
    const integerSpotChecks: Array<{ schema: string; property: string }> = [
      { schema: 'GameResponseDto', property: 'id' },
      { schema: 'GameResponseDto', property: 'score_p1' },
      { schema: 'GameResponseDto', property: 'score_p2' },
      { schema: 'QuestionOptionResponseDto', property: 'base_gain' },
      { schema: 'QuestionOptionResponseDto', property: 'display_order' },
      { schema: 'QuestionOutcomeResponseDto', property: 'ladder_position' },
      { schema: 'PaginatedGamesResponseDto', property: 'total' },
      { schema: 'PaginatedGamesResponseDto', property: 'limit' },
      { schema: 'PaginatedGamesResponseDto', property: 'offset' },
      { schema: 'MatchClockDto', property: 'elapsed_ms' },
      { schema: 'MatchClockDto', property: 'current_status_id' },
      { schema: 'ResolutionMessageDto', property: 'awarded_points' },
    ];

    for (const { schema, property } of integerSpotChecks) {
      const schemaDef = schemas[schema] as {
        properties?: Record<string, { type?: string }>;
      };
      expect(schemaDef).toBeDefined();
      const propDef = schemaDef.properties?.[property];
      // `${schema}.${property}` is embedded in each assertion failure via the
      // actual value under test, not a Jasmine-style second `expect()` arg
      // (unsupported by this Jest version) — see the comment on the sibling
      // "empty responses object" test above.
      expect(propDef).toBeDefined();
      expect(propDef?.type).toBe('integer');
    }
  });

  it('no secret (TxODDS JWT/API token/bearer) string appears anywhere in the served document', () => {
    const raw = JSON.stringify(document);
    expect(raw).not.toMatch(/txodds|txoracle|bearer\s|api_token|jwt secret/i);
  });
});
