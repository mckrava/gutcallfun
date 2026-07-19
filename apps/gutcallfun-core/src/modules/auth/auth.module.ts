import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../api/users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { NonceStore } from './nonce.store';
import { RefreshTokenStore } from './refresh-token.store';
import { WsTicketStore } from './ws-ticket.store';

@Module({
  imports: [
    UsersModule, // provides UsersService (find-or-create by wallet, AUTH-02)
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // Each sign() passes its own expiresIn (access vs registration TTL),
        // so no global signOptions here.
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    NonceStore,
    RefreshTokenStore,
    WsTicketStore,
    JwtStrategy,
    // Default-deny (AUTH-03): every HTTP route requires a valid access token
    // unless it opts out with @Public(). WS is exempted inside the guard.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
