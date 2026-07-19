import { ApiProperty } from '@nestjs/swagger';
import { UserGameResponseDto } from './user-game-response.dto';

/**
 * `GET /games/:game_id/me` — the caller's own participation in a game.
 *
 * An envelope rather than a bare `UserGameResponseDto | null` so that "I have
 * not joined this game" is an ordinary 200 the client can branch on, not a 404
 * it has to catch. Not-joined is a normal state on every page load, and modelling
 * it as an error means every unjoined visitor generates console noise and a
 * react-query retry.
 *
 * Exists because `user_game.squad_id` is server state the UI cannot otherwise
 * read back: the squad a user picked for a match was held only in a client-side
 * store, so a page refresh lost it even though the row was correct in the DB.
 */
export class MyGameParticipationResponseDto {
  @ApiProperty({
    example: true,
    description: 'False when the caller has no user_game row for this game.',
  })
  joined: boolean;

  @ApiProperty({
    type: () => UserGameResponseDto,
    nullable: true,
    description: "The caller's user_game row, or null when joined is false.",
  })
  user_game: UserGameResponseDto | null;
}
