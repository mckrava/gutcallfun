"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAnswers, useGames, useSubmitAnswer } from "@/services/api/hooks";
import { queryKeys } from "@/services/api/queryKeys";
import { useLiveGame } from "@/services/realtime/LiveProvider";
import { deriveLiveGoal, deriveLiveMatch, deriveLiveWindow } from "@/services/adapters/live";
import { setRealData } from "@/state/realData";

// Bridges a real live game's WebSocket feed into the mock LiveScreen + overlays.
// Finds the current live game, subscribes to its socket room (snapshot /
// question / resolution / game_event), and pushes three derived view-models
// into the real-data store:
//   • liveMatch  — score + pressure meter (every snapshot)
//   • liveWindow — the open prediction window (WS `question`; answering POSTs)
//   • liveGoal   — a ~2.6s goal celebration (WS `game_event` type=goal)
// Renders nothing. Must sit inside <LiveProvider> (it does, via the layout).
export function LiveMatchBridge() {
  const games = useGames({ limit: 100 });
  const liveGame = games.data?.items.find((g) => g.status === "live") ?? null;
  const live = useLiveGame(liveGame?.id ?? null);
  const submitAnswer = useSubmitAnswer();
  const qc = useQueryClient();

  // --- YOUR POINTS: sum of my answers' awarded points for this game ----------
  const answers = useAnswers(liveGame ? { game_id: liveGame.id, limit: 100 } : undefined);
  const lastResolutionId = live?.lastResolution?.game_question_id ?? null;
  useEffect(() => {
    if (!liveGame) return;
    // A resolution just landed — the backend set awarded_points on my answer.
    void qc.invalidateQueries({ queryKey: queryKeys.answers.all });
  }, [lastResolutionId, liveGame, qc]);
  useEffect(() => {
    if (!liveGame) {
      setRealData({ liveDispPts: undefined });
      return;
    }
    const mine = answers.data?.items ?? [];
    const total = mine.reduce((sum, a) => sum + (a.awarded_points ?? 0), 0);
    setRealData({ liveDispPts: String(total) });
  }, [answers.data, liveGame]);

  // --- Score + pressure meter -------------------------------------------------
  useEffect(() => {
    if (!liveGame) {
      setRealData({ liveMatch: null });
      return;
    }
    setRealData({ liveMatch: deriveLiveMatch(liveGame, live) });
  }, [liveGame, live]);

  // --- Prediction window (WS `question`) --------------------------------------
  const question = live?.activeQuestion ?? null;
  const questionId = question?.id ?? null;
  const [picked, setPicked] = useState<{ qid: string; optionId: string } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Reset the locked answer whenever a new question opens.
  useEffect(() => {
    setPicked(null);
  }, [questionId]);

  // Tick the countdown ring while a window is open.
  useEffect(() => {
    if (!questionId) return;
    const t = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(t);
  }, [questionId]);

  useEffect(() => {
    if (!question || !liveGame) {
      setRealData({ liveWindow: null });
      return;
    }
    const pickedOptionId = picked?.qid === question.id ? picked.optionId : null;
    setRealData({
      liveWindow: deriveLiveWindow(question, {
        pickedOptionId,
        nowMs,
        onPick: (optionId) => {
          setPicked({ qid: question.id, optionId });
          submitAnswer.mutate({ game_question_id: question.id, selected_option_id: optionId });
        },
      }),
    });
  }, [question, liveGame, picked, nowMs, submitAnswer]);

  // --- Goal celebration (WS `game_event` type=goal) ---------------------------
  const goalEvent =
    live?.lastGameEvent && live.lastGameEvent.type === "goal" ? live.lastGameEvent : null;
  const goalId = goalEvent?.id ?? null;
  const shownGoalId = useRef<string | null>(null);
  const goalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Fire once per goal id. The auto-dismiss timer lives in a ref (not effect
    // cleanup) so unrelated WS messages re-running this effect don't cancel it.
    if (!goalId || !liveGame || shownGoalId.current === goalId) return;
    shownGoalId.current = goalId;
    const participant = goalEvent?.participant === 2 ? 2 : 1;
    const s1 = live?.snapshot?.score_p1 ?? liveGame.score_p1;
    const s2 = live?.snapshot?.score_p2 ?? liveGame.score_p2;
    setRealData({ liveGoal: deriveLiveGoal(liveGame, participant, s1, s2) });
    if (goalTimer.current) clearTimeout(goalTimer.current);
    goalTimer.current = setTimeout(() => setRealData({ liveGoal: null }), 4500);
  }, [goalId, liveGame, live, goalEvent]);

  return null;
}
