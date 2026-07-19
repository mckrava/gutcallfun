import { GameEventMessageDto } from '../../realtime/dto/game-event-message.dto';
import { QuestionMessageDto } from '../../realtime/dto/question-message.dto';
import { ResolutionMessageDto } from '../../realtime/dto/resolution-message.dto';
import { VoidMessageDto } from '../../realtime/dto/void-message.dto';

/**
 * One outbound WebSocket push, already mapped onto its frozen wire DTO.
 *
 * The live engine emits these; `RealtimeGateway` is the only consumer and does
 * nothing but `server.to('game:{gameId}').emit(event, payload)`. Keeping the
 * DTO mapping on the producing side (not the gateway) means the gateway stays
 * a dumb transport and the wire contract has exactly one owner.
 *
 * `void` is part of the union because the contract freezes it, but nothing
 * emits it yet — RESL-04 (void/refund) is deliberately out of scope for this
 * run.
 */
export type LiveBroadcast =
  | { event: 'game_event'; gameId: number; payload: GameEventMessageDto }
  | { event: 'question'; gameId: number; payload: QuestionMessageDto }
  | { event: 'resolution'; gameId: number; payload: ResolutionMessageDto }
  | { event: 'void'; gameId: number; payload: VoidMessageDto };
