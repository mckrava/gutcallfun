import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        synchronize: false,
        autoLoadEntities: true,
        logging: config.get<string>('NODE_ENV') !== 'production',
        entities: [__dirname + '/../../models/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../../db/migrations/*{.ts,.js}'],
      }),
    }),
  ],
})
export class DatabaseModule {}
