import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './app-config.schema';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate })],
  exports: [ConfigModule],
})
export class AppConfigModule {}
