"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  GameEventMessage,
  PossessionStage,
  Question,
  ResolutionMessage,
  Snapshot,
  VoidMessage,
} from "@/services/api/types";
import { createSocket, type LiveSocket } from "./socket";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

// `snapshot` is emitted once per subscribe, so its `possession_stage` is only a
// seed — every later possession change arrives as a `game_event` whose `type` is
// one of the four staged feed actions. Exact-string lookup, never substring
// matching: the bare `possession` marker (ball-holder change) is deliberately
// absent and must leave the stage untouched, not read as a danger stage.
// Mirrors ACTION_TO_STAGE in gutcallfun-core's ingest/state/possession.ts.
const EVENT_TYPE_TO_STAGE: Record<string, PossessionStage> = {
  safe_possession: "SafePossession",
  attack_possession: "AttackPossession",
  danger_possession: "DangerPossession",
  high_danger_possession: "HighDangerPossession",
};

export interface LiveGameState {
  gameId: number;
  snapshot: Snapshot | null;
  /** Currently open prediction window (from snapshot or a `question` event); cleared on resolve/void. */
  activeQuestion: Question | null;
  /** Live possession stage: seeded by `snapshot`, then advanced by staged `game_event`s. */
  possessionStage: PossessionStage | null;
  lastResolution: ResolutionMessage | null;
  lastGameEvent: GameEventMessage | null;
  lastVoid: VoidMessage | null;
  /** Every resolution seen for this game, in order (for post-match recap/EKG). */
  resolutions: ResolutionMessage[];
}

interface LiveContextValue {
  status: ConnectionStatus;
  games: Record<number, LiveGameState>;
  subscribe: (gameId: number) => void;
  unsubscribe: (gameId: number) => void;
}

const LiveContext = createContext<LiveContextValue | null>(null);

function emptyGame(gameId: number): LiveGameState {
  return { gameId, snapshot: null, activeQuestion: null, possessionStage: null, lastResolution: null, lastGameEvent: null, lastVoid: null, resolutions: [] };
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<LiveSocket | null>(null);
  const refCounts = useRef<Map<number, number>>(new Map());
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [games, setGames] = useState<Record<number, LiveGameState>>({});

  // Immutably patch one game's live state.
  const patch = useCallback((gameId: number, fn: (prev: LiveGameState) => LiveGameState) => {
    setGames((all) => ({ ...all, [gameId]: fn(all[gameId] ?? emptyGame(gameId)) }));
  }, []);

  // resolution/void carry only game_question_id (no game_id) — route them to the
  // game whose currently-open question matches.
  const patchByQuestion = useCallback((questionId: string, fn: (prev: LiveGameState) => LiveGameState) => {
    setGames((all) => {
      const entry = Object.values(all).find((g) => g.activeQuestion?.id === questionId);
      if (!entry) return all;
      return { ...all, [entry.gameId]: fn(entry) };
    });
  }, []);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      // socket.io does not rejoin application rooms after a reconnect — re-emit
      // every active subscription (subscribe is idempotent server-side).
      for (const [gameId, count] of refCounts.current) {
        if (count > 0) socket.emit("subscribe", { game_id: gameId });
      }
    });
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.io.on("reconnect_attempt", () => setStatus("connecting"));

    socket.on("snapshot", (s: Snapshot) => {
      // Re-seeds the stage: on a reconnect this is authoritative server state,
      // so it intentionally supersedes whatever the events had advanced it to.
      patch(s.game_id, (prev) => ({
        ...prev,
        snapshot: s,
        activeQuestion: s.active_question,
        possessionStage: s.possession_stage,
      }));
    });
    socket.on("question", (q) => {
      patch(q.game_id, (prev) => ({ ...prev, activeQuestion: q }));
    });
    socket.on("resolution", (r: ResolutionMessage) => {
      patchByQuestion(r.game_question_id, (prev) => ({
        ...prev,
        activeQuestion: null,
        lastResolution: r,
        resolutions: [...prev.resolutions, r],
      }));
    });
    socket.on("game_event", (e: GameEventMessage) => {
      // Unmapped types (goals, cards, the bare `possession` marker, …) still
      // record as lastGameEvent but leave the stage exactly where it was.
      const staged = EVENT_TYPE_TO_STAGE[e.type];
      patch(e.game_id, (prev) => ({
        ...prev,
        lastGameEvent: e,
        possessionStage: staged ?? prev.possessionStage,
      }));
    });
    socket.on("void", (v: VoidMessage) => {
      patchByQuestion(v.game_question_id, (prev) => ({ ...prev, activeQuestion: null, lastVoid: v }));
    });

    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [patch, patchByQuestion]);

  const subscribe = useCallback((gameId: number) => {
    const next = (refCounts.current.get(gameId) ?? 0) + 1;
    refCounts.current.set(gameId, next);
    if (next === 1) socketRef.current?.emit("subscribe", { game_id: gameId });
  }, []);

  const unsubscribe = useCallback((gameId: number) => {
    const next = (refCounts.current.get(gameId) ?? 1) - 1;
    if (next <= 0) {
      refCounts.current.delete(gameId);
      socketRef.current?.emit("unsubscribe", { game_id: gameId });
    } else {
      refCounts.current.set(gameId, next);
    }
  }, []);

  const value = useMemo<LiveContextValue>(() => ({ status, games, subscribe, unsubscribe }), [status, games, subscribe, unsubscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

function useLiveContext(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive* must be used within <LiveProvider>");
  return ctx;
}

export function useLiveConnection(): ConnectionStatus {
  return useLiveContext().status;
}

/** Subscribe to a game's live feed for the lifetime of the calling component. */
export function useLiveGame(gameId: number | null): LiveGameState | undefined {
  const { games, subscribe, unsubscribe } = useLiveContext();
  useEffect(() => {
    if (gameId == null) return;
    subscribe(gameId);
    return () => unsubscribe(gameId);
  }, [gameId, subscribe, unsubscribe]);
  return gameId != null ? games[gameId] : undefined;
}
