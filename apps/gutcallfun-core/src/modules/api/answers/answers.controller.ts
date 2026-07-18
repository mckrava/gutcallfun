import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AnswersService } from './answers.service';
import {
  AnswerResponseDto,
  PaginatedAnswersResponseDto,
} from './dto/answer-response.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { ListAnswersQueryDto } from './dto/list-answers-query.dto';

@ApiTags('answers')
@Controller('answers')
export class AnswersController {
  constructor(private readonly answersService: AnswersService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit an answer to an open prediction window.',
    description:
      'PROVISIONAL (D-02): user_id is caller-supplied and unverified this phase — Phase 3 replaces it with the session. The answer is persisted: the question must exist, its expires_at must still be in the future (409 otherwise), the selected option must belong to that question (400 otherwise), and one answer per (user, question) is enforced (409 otherwise). awarded_points and successful_outcome stay null until the resolver scores the window.',
  })
  @ApiCreatedResponse({ type: AnswerResponseDto })
  create(@Body() dto: CreateAnswerDto): Promise<AnswerResponseDto> {
    return this.answersService.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedAnswersResponseDto })
  findAll(@Query() query: ListAnswersQueryDto): Promise<PaginatedAnswersResponseDto> {
    return this.answersService.findAll(query);
  }
}
