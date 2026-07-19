import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { AuthService, VerifyResult } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthPrincipal } from './auth.types';
import { Public } from './decorators/public.decorator';
import { ChallengeRequestDto } from './dto/challenge-request.dto';
import { ChallengeResponseDto } from './dto/challenge-response.dto';
import { VerifyRequestDto } from './dto/verify-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import {
  AuthenticatedResponseDto,
  LogoutResponseDto,
  RegistrationRequiredResponseDto,
  SessionTokensDto,
} from './dto/session-response.dto';
import { WsTicketResponseDto } from './dto/ws-ticket-response.dto';

// Every route here is @Public: sign-in must work before a session exists. Once
// the global JwtAuthGuard lands (Step 4) these opt out explicitly; product
// endpoints become default-deny.
@Controller('auth')
@ApiTags('auth')
@ApiExtraModels(AuthenticatedResponseDto, RegistrationRequiredResponseDto)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('challenge')
  @HttpCode(200)
  @ApiOkResponse({ type: ChallengeResponseDto })
  challenge(@Body() dto: ChallengeRequestDto): ChallengeResponseDto {
    return this.authService.createChallenge(dto);
  }

  @Public()
  @Post('verify')
  @HttpCode(200)
  @ApiOkResponse({
    description:
      'A known wallet returns a full session (status=authenticated); a first-time wallet ' +
      'returns a registration token (status=registration_required).',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AuthenticatedResponseDto) },
        { $ref: getSchemaPath(RegistrationRequiredResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Nonce invalid/expired/replayed, or signature mismatch.',
  })
  verify(@Body() dto: VerifyRequestDto): Promise<VerifyResult> {
    return this.authService.verify(dto);
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  @ApiCreatedResponse({ type: AuthenticatedResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Registration token invalid or expired.',
  })
  register(@Body() dto: RegisterRequestDto): Promise<AuthenticatedResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: SessionTokensDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token invalid or expired.' })
  refresh(@Body() dto: RefreshRequestDto): SessionTokensDto {
    return this.authService.refresh(dto);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOkResponse({ type: LogoutResponseDto })
  logout(@Body() dto: RefreshRequestDto): LogoutResponseDto {
    this.authService.logout(dto);
    return { success: true };
  }

  // NOT @Public: called server-side (Next.js BFF) with the session's Bearer
  // token. Mints a single-use socket ticket so the JWT never reaches the
  // browser — the browser connects the socket with the ticket alone.
  @Post('ws-ticket')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOkResponse({ type: WsTicketResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid session.' })
  wsTicket(@CurrentUser() user: AuthPrincipal): WsTicketResponseDto {
    return this.authService.issueWsTicket(user.userId);
  }
}
