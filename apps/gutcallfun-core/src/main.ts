import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const webAppOrigin = configService.get<string>('WEB_APP_ORIGIN');

  // T-02.1-01: single resolved origin only — never a wildcard, never `true`,
  // never a reflect-any-origin callback. D-02: no auth/session/cookie, so
  // credentials: false is correct.
  app.enableCors({ origin: webAppOrigin, credentials: false });

  // T-02.1-02: whitelist strips undeclared properties and the "forbid" flag
  // upgrades that strip into a 400 (mass-assignment control); transform
  // coerces string query params into the numbers the DTOs declare.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // T-02.1-03: this document is world-readable once deployed — never place a
  // credential, connection string, or TxODDS token in the description or in
  // any @ApiProperty example.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('GutCall API')
    .setDescription(
      'Placeholder contract for the GutCall API (Phase 2.1). Every payload on this surface is ' +
        'static, deterministic mock data with no persistence behind it — no endpoint is ' +
        'authenticated, and `user_id` is a caller-supplied parameter that Phase 3 will replace ' +
        'with a real session. Field names and types match initial-db-structure.sql.',
    )
    .setVersion('0.2.1')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDocument);

  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
