import { validate } from './app-config.schema';

describe('validate (fail-fast env validation)', () => {
  it('Test 1: returns a validated instance for a valid config (no throw)', () => {
    const result = validate({
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5488/db',
      PORT: '3000',
      NODE_ENV: 'development',
    });

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
        DATABASE_URL: 'not-a-postgres-url',
        PORT: '3000',
      }),
    ).toThrow();
  });

  it('Test 4: does not throw when extra unknown keys are present (pass-through)', () => {
    expect(() =>
      validate({
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5488/db',
        PORT: '3000',
        NODE_ENV: 'development',
        TXLINE_JWT: 'some-unrelated-secret-token',
      }),
    ).not.toThrow();
  });
});
