import { ApiProperty } from '@nestjs/swagger';

export class WsTicketResponseDto {
  @ApiProperty({
    description:
      'Single-use, short-lived ticket. Pass it as socket.io `auth: { ticket }` on connect.',
  })
  ticket: string;

  @ApiProperty({ example: '2026-07-18T00:01:00.000Z' })
  expires_at: string;
}
