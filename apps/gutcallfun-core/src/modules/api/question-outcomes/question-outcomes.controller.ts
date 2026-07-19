import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { QuestionOutcomeResponseDto } from './dto/question-outcome-response.dto';
import { QuestionOutcomesService } from './question-outcomes.service';

@ApiTags('question-outcomes')
@Controller('question-outcomes')
export class QuestionOutcomesController {
  constructor(
    private readonly questionOutcomesService: QuestionOutcomesService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary:
      'The four static outcome reference rows, ordered by ladder_position ascending.',
    description:
      'A static reference list — deliberately unpaginated. Lets the UI label outcomes from the API instead of hardcoding the four strings (fizzles/danger/shot/goal).',
  })
  @ApiOkResponse({ type: QuestionOutcomeResponseDto, isArray: true })
  findAll(): QuestionOutcomeResponseDto[] {
    return this.questionOutcomesService.findAll();
  }
}
