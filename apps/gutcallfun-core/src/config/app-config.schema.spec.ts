import { validate } from './app-config.schema';

const VALID_ENV = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5488/db',
  PORT: '3000',
  NODE_ENV: 'development',
  TXLINE_GUEST_JWT: 'guest-jwt-value',
  TXLINE_API_TOKEN: 'api-token-value',
  SERVICE_LEVEL_ID: '12',
  WEB_APP_ORIGIN: 'http://localhost:3001',
};

describe('validate (fail-fast env validation)', () => {
  it('Test 1: returns a validated instance for a valid config (no throw)', () => {
    const result = validate({ ...VALID_ENV });

    expect(result).toBeDefined();
    expect(result.DATABASE_URL).toBe('postgresql://u:p@127.0.0.1:5488/db');
    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
  });

  it('Test 2: throws when DATABASE_URL is missing', () => {
    expect(() =>
      validate({
        PORT: '3000',
        NODE_ENV: 'development',
      }),
    ).toThrow();
  });

  it('Test 3: throws when DATABASE_URL has an invalid protocol', () => {
    expect(() =>
      validate({
        ...VALID_ENV,
        DATABASE_URL: 'not-a-postgres-url',
      }),
    ).toThrow();
  });

  it('Test 4: does not throw when extra unknown keys are present (pass-through)', () => {
    expect(() =>
      validate({
        ...VALID_ENV,
        TXLINE_JWT: 'some-unrelated-secret-token',
      }),
    ).not.toThrow();
  });

  it('Test 5: valid env with SERVICE_LEVEL_ID=12 returns a validated instance', () => {
    const result = validate({ ...VALID_ENV, SERVICE_LEVEL_ID: '12' });

    expect(result).toBeDefined();
    expect(result.SERVICE_LEVEL_ID).toBe(12);
    expect(result.TXLINE_GUEST_JWT).toBe('guest-jwt-value');
    expect(result.TXLINE_API_TOKEN).toBe('api-token-value');
    expect(result.PAST_FIXTURES_COUNT).toBe(20);
  });

  it('Test 6: throws when TXLINE_GUEST_JWT is missing', () => {
    const { TXLINE_GUEST_JWT, ...rest } = VALID_ENV;
    void TXLINE_GUEST_JWT;
    expect(() => validate(rest)).toThrow();
  });

  it('Test 7: throws when TXLINE_API_TOKEN is missing', () => {
    const { TXLINE_API_TOKEN, ...rest } = VALID_ENV;
    void TXLINE_API_TOKEN;
    expect(() => validate(rest)).toThrow();
  });

  it('Test 8: throws with a service-level message when SERVICE_LEVEL_ID=1 (60s-delayed feed)', () => {
    expect(() => validate({ ...VALID_ENV, SERVICE_LEVEL_ID: '1' })).toThrow(/SERVICE_LEVEL_ID/);
  });

  it('Test 9: throws when SERVICE_LEVEL_ID is missing', () => {
    const { SERVICE_LEVEL_ID, ...rest } = VALID_ENV;
    void SERVICE_LEVEL_ID;
    expect(() => validate(rest)).toThrow();
  });

  it('Test 10: PAST_FIXTURES_COUNT accepts a custom value', () => {
    const result = validate({ ...VALID_ENV, PAST_FIXTURES_COUNT: '5' });
    expect(result.PAST_FIXTURES_COUNT).toBe(5);
  });

  it('Test 11: re-running validation twice on the same valid env produces identical output (idempotency)', () => {
    const first = validate({ ...VALID_ENV });
    const second = validate({ ...VALID_ENV });

    expect(second).toEqual(first);
  });

  // Source: PLAN.md 02.1-01 Task 2 acceptance criteria — WEB_APP_ORIGIN (D-06) fail-fast
  // contract: no default, no @IsOptional(), same fail-fast group as DATABASE_URL/
  // TXLINE_GUEST_JWT/TXLINE_API_TOKEN.
  it('Test 12: throws when WEB_APP_ORIGIN is absent', () => {
    const { WEB_APP_ORIGIN, ...rest } = VALID_ENV;
    void WEB_APP_ORIGIN;
    expect(() => validate(rest)).toThrow();
  });

  it('Test 13: throws when WEB_APP_ORIGIN is a protocol-less string', () => {
    expect(() => validate({ ...VALID_ENV, WEB_APP_ORIGIN: 'localhost:3001' })).toThrow();
  });

  it('Test 14: returns successfully for a protocol-qualified WEB_APP_ORIGIN', () => {
    const result = validate({ ...VALID_ENV, WEB_APP_ORIGIN: 'http://localhost:3001' });
    expect(result.WEB_APP_ORIGIN).toBe('http://localhost:3001');
  });
});
