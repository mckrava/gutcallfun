import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../api/users/users.service';
import { AccessClaims, RegistrationClaims } from './auth.types';
import { ChallengeRequestDto } from './dto/challenge-request.dto';
import { ChallengeResponseDto } from './dto/challenge-response.dto';
import { VerifyRequestDto } from './dto/verify-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import {
  AuthenticatedResponseDto,
  RegistrationRequiredResponseDto,
  SessionTokensDto,
} from './dto/session-response.dto';
import { WsTicketResponseDto } from './dto/ws-ticket-response.dto';
import { NonceStore } from './nonce.store';
import { RefreshTokenStore } from './refresh-token.store';
import { WsTicketStore } from './ws-ticket.store';
import { buildSiwsMessage, verifySiwsSignature } from './siws';

// Challenge lifetime — how long a user has to sign after tapping "connect".
const NONCE_TTL_MS = 5 * 60 * 1000;
// A first-time wallet gets this short-lived token to complete registration
// (choose a handle) before it must sign in again.
const REGISTRATION_TTL_SEC = 10 * 60;
const SIWS_STATEMENT =
  'Sign in to GutCall. This request will not trigger a blockchain transaction or cost any fees.';
// A WS ticket only has to survive the round trip from "mint" to "socket
// connect", so it is deliberately very short-lived.
const WS_TICKET_TTL_MS = 60 * 1000;

export type VerifyResult =
  AuthenticatedResponseDto | RegistrationRequiredResponseDto;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly nonces: NonceStore,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly wsTickets: WsTicketStore,
    private readonly users: UsersService,
  ) {}

  /**
   * Step 1 — issue a single-use SIWS challenge for a wallet. The returned
   * `message` is the exact text the wallet must sign; `nonce` is echoed back on
   * verify so the server can look the challenge up.
   */
  createChallenge(dto: ChallengeRequestDto): ChallengeResponseDto {
    const issued = this.nonces.issue(
      dto.wallet_address,
      ({ nonce, issuedAt, expiresAt }) =>
        buildSiwsMessage({
          domain: this.resolveDomain(),
          address: dto.wallet_address,
          statement: SIWS_STATEMENT,
          uri: this.config.getOrThrow<string>('WEB_APP_ORIGIN'),
          nonce,
          issuedAt: new Date(issuedAt).toISOString(),
          expirationTime: new Date(expiresAt).toISOString(),
        }),
      NONCE_TTL_MS,
    );
    return {
      message: issued.message,
      nonce: issued.nonce,
      expires_at: new Date(issued.expiresAt).toISOString(),
    };
  }

  /**
   * Step 2 — verify a signed challenge. The nonce is consumed (single-use); the
   * signature is checked against the server-authored message. A known wallet is
   * signed straight in; an unknown one gets a registration token instead.
   */
  async verify(dto: VerifyRequestDto): Promise<VerifyResult> {
    const record = this.nonces.consume(dto.nonce, dto.wallet_address);
    if (!record) {
      throw new UnauthorizedException(
        'Challenge is invalid, expired, or already used',
      );
    }
    if (
      !verifySiwsSignature(record.message, dto.signature, dto.wallet_address)
    ) {
      throw new UnauthorizedException('Signature does not match the wallet');
    }

    const user = await this.users.findByWallet(dto.wallet_address);
    if (user) {
      return { status: 'authenticated', user, ...this.issueSession(user.id) };
    }

    this.logger.log(
      `First sign-in for wallet ${dto.wallet_address} — registration required`,
    );
    const registration_token = this.jwt.sign(
      { sub: dto.wallet_address, typ: 'reg' } satisfies RegistrationClaims,
      { expiresIn: REGISTRATION_TTL_SEC },
    );
    return {
      status: 'registration_required',
      registration_token,
      wallet_address: dto.wallet_address,
    };
  }

  /**
   * Step 2b — complete first-time registration. The registration token proves a
   * wallet was verified moments ago; the handle is chosen now, so the user row
   * is created here (handle non-null) and a full session is returned.
   */
  async register(dto: RegisterRequestDto): Promise<AuthenticatedResponseDto> {
    let claims: RegistrationClaims;
    try {
      claims = this.jwt.verify<RegistrationClaims>(dto.registration_token);
    } catch {
      throw new UnauthorizedException(
        'Registration token is invalid or expired',
      );
    }
    if (claims.typ !== 'reg') {
      throw new UnauthorizedException('Wrong token type for registration');
    }

    const user = await this.users.create({
      wallet_address: claims.sub,
      handle: dto.handle,
      image: dto.image,
    });
    return { status: 'authenticated', user, ...this.issueSession(user.id) };
  }

  /** Step 3 — exchange a refresh token for a new session (rotating the refresh). */
  refresh(dto: RefreshRequestDto): SessionTokensDto {
    const userId = this.refreshTokens.resolve(dto.refresh_token);
    if (!userId) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    const rotated = this.refreshTokens.rotate(
      dto.refresh_token,
      this.refreshTtlMs(),
    );
    // Non-null: we just resolved it and this is single-threaded.
    return this.session(userId, rotated!.token);
  }

  /** Revoke a refresh token (logout). Idempotent. */
  logout(dto: RefreshRequestDto): void {
    this.refreshTokens.revoke(dto.refresh_token);
  }

  /**
   * Mint a single-use socket ticket for an already-authenticated user. Called
   * server-side (Next.js BFF) with the user's session, so the JWT never has to
   * reach the browser — only this short-lived ticket does.
   */
  issueWsTicket(userId: string): WsTicketResponseDto {
    const { ticket, expiresAt } = this.wsTickets.issue(
      userId,
      WS_TICKET_TTL_MS,
    );
    return { ticket, expires_at: new Date(expiresAt).toISOString() };
  }

  /** Exchange a socket ticket for its user id at connection time, or null. */
  consumeWsTicket(ticket: string): string | null {
    return this.wsTickets.consume(ticket);
  }

  private issueSession(userId: string): SessionTokensDto {
    const refresh = this.refreshTokens.issue(userId, this.refreshTtlMs());
    return this.session(userId, refresh.token);
  }

  private session(userId: string, refreshToken: string): SessionTokensDto {
    const expires_in = this.accessTtlSec();
    const access_token = this.jwt.sign(
      { sub: userId, typ: 'access' } satisfies AccessClaims,
      { expiresIn: expires_in },
    );
    return {
      access_token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in,
    };
  }

  private accessTtlSec(): number {
    return this.config.get<number>('JWT_ACCESS_TTL', 900);
  }

  private refreshTtlMs(): number {
    return this.config.get<number>('JWT_REFRESH_TTL', 2_592_000) * 1000;
  }

  private resolveDomain(): string {
    const explicit = this.config.get<string>('AUTH_DOMAIN');
    if (explicit) return explicit;
    return new URL(this.config.getOrThrow<string>('WEB_APP_ORIGIN')).host;
  }
}
