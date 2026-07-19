export enum GameStatus {
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  FINISHED = 'finished',
  CANCELLED = 'cancelled',
}

export enum QuestionState {
  OPEN = 'open',
  PENDING_CONFIRMATION = 'pending_confirmation',
  RESOLVED = 'resolved',
  VOIDED = 'voided',
}

export enum QuestionType {
  ATTACK_OUTCOME = 'attack_outcome',
  STATIC = 'static',
}
