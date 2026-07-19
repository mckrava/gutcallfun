import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { UsersService } from '../api/users/users.service';
import { UserResponseDto } from '../api/users/dto/user-response.dto';
import { AuthService } from './auth.service';
import { AuthenticatedResponseDto } from './dto/session-response.dto';
import { NonceStore } from './nonce.store';
import { RefreshTokenStore } from './refresh-token.store';
import { WsTicketStore } from './ws-ticket.store';

const TEST_SECRET = 'unit-test-access-secret-at-least-32-characters';

function makeConfig(): ConfigService {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      const vals: Record<string, unknown> = {
        JWT_ACCESS_TTL: 900,
        JWT_REFRESH_TTL: 2_592_000,
        AUTH_DOMAIN: undefined,
      };
      return key in vals ? (vals[key] ?? def) : def;
    }),
    getOrThrow: jest.fn((key: string) => {
      const vals: Record<string, string> = {
        WEB_APP_ORIGIN: 'http://localhost:3001',
        JWT_ACCESS_SECRET: TEST_SECRET,
      };
      return vals[key];
    }),
  } as unknown as ConfigService;
}

describe('AuthService', () => {
  const keypair = nacl.sign.keyPair();
  const wallet = bs58.encode(keypair.publicKey);

  let jwt: JwtService;
  let nonces: NonceStore;
  let refresh: RefreshTokenStore;
  let wsTickets: WsTicketStore;
  let users: jest.Mocked<Pick<UsersService, 'findByWallet' | 'create'>>;
  let service: AuthService;

  const USER: UserResponseDto = {
    id: '00000000-0000-4000-8000-0000000000aa',
    wallet_address: wallet,
    share_code: 'GC-AB12-CD34',
    handle: 'gutcaller',
    image: null,
    score_profile: null,
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: null,
  };

  beforeEach(() => {
    jwt = new JwtService({ secret: TEST_SECRET });
    nonces = new NonceStore();
    refresh = new RefreshTokenStore();
    wsTickets = new WsTicketStore();
    users = { findByWallet: jest.fn(), create: jest.fn() };
    service = new AuthService(
      makeConfig(),
      jwt,
      nonces,
      refresh,
      wsTickets,
      users as unknown as UsersService,
    );
  });

  /** Full challenge → sign → return signature for the test wallet. */
  function signChallenge(): { nonce: string; signature: string } {
    const challenge = service.createChallenge({ wallet_address: wallet });
    const sig = nacl.sign.detached(
      new TextEncoder().encode(challenge.message),
      keypair.secretKey,
    );
    return { nonce: challenge.nonce, signature: bs58.encode(sig) };
  }

  it('createChallenge returns a SIWS message bound to the wallet and nonce', () => {
    const challenge = service.createChallenge({ wallet_address: wallet });
    expect(challenge.message).toContain(wallet);
    expect(challenge.message).toContain(`Nonce: ${challenge.nonce}`);
    expect(challenge.message).toContain('localhost'); // domain from WEB_APP_ORIGIN host
  });

  it('verify signs in a KNOWN wallet with a valid access + refresh session', async () => {
    users.findByWallet.mockResolvedValue(USER);
    const { nonce, signature } = signChallenge();

    const result = await service.verify({
      wallet_address: wallet,
      nonce,
      signature,
    });

    expect(result.status).toBe('authenticated');
    const authed = result as AuthenticatedResponseDto;
    expect(authed.user).toEqual(USER);
    expect(authed.token_type).toBe('Bearer');
    const claims = jwt.verify<{ sub: string; typ: string }>(
      authed.access_token,
    );
    expect(claims.sub).toBe(USER.id);
    expect(claims.typ).toBe('access');
    expect(refresh.resolve(authed.refresh_token)).toBe(USER.id);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('verify routes an UNKNOWN wallet to registration (no user created yet)', async () => {
    users.findByWallet.mockResolvedValue(null);
    const { nonce, signature } = signChallenge();

    const result = await service.verify({
      wallet_address: wallet,
      nonce,
      signature,
    });

    expect(result.status).toBe('registration_required');
    if (result.status !== 'registration_required')
      throw new Error('unreachable');
    const claims = jwt.verify<{ sub: string; typ: string }>(
      result.registration_token,
    );
    expect(claims.sub).toBe(wallet);
    expect(claims.typ).toBe('reg');
    expect(users.create).not.toHaveBeenCalled();
  });

  it('register consumes a registration token, creates the user, and issues a session', async () => {
    users.findByWallet.mockResolvedValue(null);
    const { nonce, signature } = signChallenge();
    const reg = await service.verify({
      wallet_address: wallet,
      nonce,
      signature,
    });
    if (reg.status !== 'registration_required')
      throw new Error('expected registration');

    users.create.mockResolvedValue(USER);
    const result = await service.register({
      registration_token: reg.registration_token,
      handle: 'gutcaller',
    });

    expect(users.create).toHaveBeenCalledWith({
      wallet_address: wallet,
      handle: 'gutcaller',
      image: undefined,
    });
    expect(result.status).toBe('authenticated');
    expect(jwt.verify<{ sub: string }>(result.access_token).sub).toBe(USER.id);
  });

  it('register rejects a malformed/forged registration token', async () => {
    await expect(
      service.register({ registration_token: 'not-a-jwt', handle: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('register rejects an access token used in place of a registration token', async () => {
    users.findByWallet.mockResolvedValue(USER);
    const { nonce, signature } = signChallenge();
    const authed = (await service.verify({
      wallet_address: wallet,
      nonce,
      signature,
    })) as AuthenticatedResponseDto;

    await expect(
      service.register({
        registration_token: authed.access_token,
        handle: 'x',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verify rejects a replayed nonce', async () => {
    users.findByWallet.mockResolvedValue(USER);
    const { nonce, signature } = signChallenge();
    await service.verify({ wallet_address: wallet, nonce, signature });

    await expect(
      service.verify({ wallet_address: wallet, nonce, signature }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verify rejects a bad signature', async () => {
    const challenge = service.createChallenge({ wallet_address: wallet });
    const other = nacl.sign.keyPair();
    const forged = bs58.encode(
      nacl.sign.detached(
        new TextEncoder().encode(challenge.message),
        other.secretKey,
      ),
    );

    await expect(
      service.verify({
        wallet_address: wallet,
        nonce: challenge.nonce,
        signature: forged,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh rotates the refresh token and issues a fresh access token', async () => {
    users.findByWallet.mockResolvedValue(USER);
    const { nonce, signature } = signChallenge();
    const session = (await service.verify({
      wallet_address: wallet,
      nonce,
      signature,
    })) as AuthenticatedResponseDto;

    const next = service.refresh({ refresh_token: session.refresh_token });

    expect(next.refresh_token).not.toBe(session.refresh_token);
    expect(refresh.resolve(session.refresh_token)).toBeNull(); // old rotated out
    expect(jwt.verify<{ sub: string }>(next.access_token).sub).toBe(USER.id);
  });

  it('refresh rejects an unknown token; logout revokes a live one', async () => {
    expect(() => service.refresh({ refresh_token: 'nope' })).toThrow(
      UnauthorizedException,
    );

    users.findByWallet.mockResolvedValue(USER);
    const { nonce, signature } = signChallenge();
    const session = (await service.verify({
      wallet_address: wallet,
      nonce,
      signature,
    })) as AuthenticatedResponseDto;

    service.logout({ refresh_token: session.refresh_token });
    expect(() =>
      service.refresh({ refresh_token: session.refresh_token }),
    ).toThrow(UnauthorizedException);
  });

  it('issues a single-use WS ticket that consumes back to the user', () => {
    const { ticket } = service.issueWsTicket(USER.id);
    expect(service.consumeWsTicket(ticket)).toBe(USER.id);
    expect(service.consumeWsTicket(ticket)).toBeNull(); // single-use
  });
});
