import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthPrincipal } from '../../auth/auth.types';
import { AnswersService } from './answers.service';
import {
  AnswerResponseDto,
  PaginatedAnswersResponseDto,
} from './dto/answer-response.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { ListAnswersQueryDto } from './dto/list-answers-query.dto';

@ApiTags('answers')
@ApiBearerAuth()
@Controller('answers')
export class AnswersController {
  constructor(private readonly answersService: AnswersService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit an answer to an open prediction window.',
    description:
      'The answering user is the authenticated caller (AUTH-03). The answer is persisted: the question must exist, its expires_at must still be in the future (409 otherwise), the selected option must belong to that question (400 otherwise), and one answer per (user, question) is enforced (409 otherwise). awarded_points and successful_outcome stay null until the resolver scores the window.',
  })
  @ApiCreatedResponse({ type: AnswerResponseDto })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: CreateAnswerDto,
  ): Promise<AnswerResponseDto> {
    return this.answersService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated caller's answers." })
  @ApiOkResponse({ type: PaginatedAnswersResponseDto })
  findAll(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: ListAnswersQueryDto,
  ): Promise<PaginatedAnswersResponseDto> {
    return this.answersService.findAll(user.userId, query);
  }
}
