import { QuestionOutcomeResponseDto } from '../../modules/api/question-outcomes/dto/question-outcome-response.dto';

/**
 * The four seeded `game_question_outcome` reference rows, copied verbatim
 * from the `-- seed:` comment in `initial-request-src/initial-db-structure.sql`:
 * ('fizzles','Fizzles out',1) ('danger','Creates danger',2)
 * ('shot','Shot taken',3) ('goal','GOAL!',4). These are LOCKED project-wide
 * (CLAUDE.md "Game economy") — never reorder the ladder_position values.
 */
export const QUESTION_OUTCOMES_FIXTURE: QuestionOutcomeResponseDto[] = [
  { key: 'fizzles', content: 'Fizzles out', ladder_position: 1 },
  { key: 'danger', content: 'Creates danger', ladder_position: 2 },
  { key: 'shot', content: 'Shot taken', ladder_position: 3 },
  { key: 'goal', content: 'GOAL!', ladder_position: 4 },
];
