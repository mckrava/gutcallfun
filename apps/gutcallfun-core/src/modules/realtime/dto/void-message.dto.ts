import { ApiProperty } from '@nestjs/swagger';

/**
 * The `void` push message. Shape frozen now even though the fake cycle in
 * this phase never emits it — Phase 4 owns the real void conditions
 * (suspend/disconnect/seq-gap/restart-hole), and adding this shape later
 * would be a contract change, which is exactly what this phase exists to
 * prevent.
 */
export class VoidMessageDto {
  @ApiProperty({
    format: 'uuid',
    example: '00000000-0000-4000-8000-0000000000f1',
  })
  game_question_id: string;

  @ApiProperty({ example: '2026-07-18T15:12:08.000Z' })
  voided_at: string;

  @ApiProperty({
    example: 'suspend',
    description:
      'Void reason. Phase 4 owns the real void conditions; this shape is frozen but never emitted by the fake cycle.',
  })
  reason: string;

  @ApiProperty({
    example: true,
    description:
      'Always true once real void logic lands — this shape is frozen but the fake cycle in this phase never emits it.',
  })
  is_mock: boolean;
}
