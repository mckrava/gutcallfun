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
      'PROVISIONAL (D-02): user_id is caller-supplied and unverified this phase. Phase 3 replaces it with the session; Phase 4 adds real one-answer-per-question and expiry enforcement. Nothing is persisted this phase — the response is an illustrative unresolved shape (D-05).',
  })
  @ApiCreatedResponse({ type: AnswerResponseDto })
  create(@Body() dto: CreateAnswerDto): AnswerResponseDto {
    return this.answersService.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedAnswersResponseDto })
  findAll(@Query() query: ListAnswersQueryDto): PaginatedAnswersResponseDto {
    return this.answersService.findAll(query);
  }
}
