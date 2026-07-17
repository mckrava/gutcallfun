// D-13 seam: typed in-process event fired on Seq-gap detection. Same seam
// is reused for restart-hole detection (RCVR-02). Contract frozen here —
// Phase 2 ships a log-only listener (GameStreamGapLogListener); Phase 4
// replaces the listener body with real void+refund + goal adjudication.
export interface GameStreamGapDetected {
  gameId: number;
  expectedSeq: number;
  actualSeq: number;
  at: Date;
}
