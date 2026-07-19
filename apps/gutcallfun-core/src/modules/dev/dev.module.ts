import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { DevController } from './dev.controller';

// Dev-only WebSocket simulator. Imports RealtimeModule for the gateway it
// broadcasts through. FAIL-CLOSED: app.module.ts mounts this module ONLY when
// ENABLE_DEV_SIM === 'true', so its routes don't exist otherwise. assertDev()
// (NODE_ENV) in the controller is a second layer if the flag is ever on in prod.
@Module({
  imports: [RealtimeModule],
  controllers: [DevController],
})
export class DevModule {}
