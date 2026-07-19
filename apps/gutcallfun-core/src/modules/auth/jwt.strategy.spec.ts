import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessClaims } from './auth.types';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = {
    getOrThrow: jest.fn(() => 'a-very-long-test-secret-of-at-least-32-chars'),
  } as unknown as ConfigService;
  const strategy = new JwtStrategy(config);

  it('accepts an access token and returns the principal', () => {
    expect(strategy.validate({ sub: 'user-1', typ: 'access' })).toEqual({
      userId: 'user-1',
    });
  });

  it('rejects a registration token presented as an access token', () => {
    const regClaims = { sub: 'wallet', typ: 'reg' } as unknown as AccessClaims;
    expect(() => strategy.validate(regClaims)).toThrow(UnauthorizedException);
  });
});
