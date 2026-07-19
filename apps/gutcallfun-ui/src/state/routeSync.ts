"use client";

import { useEffect } from "react";
import { useAppActions } from "./context";
import type { NavTab } from "./types";

// Route → engine-state sync helpers. Each route page calls one of these on mount
// so deep-links / back-button keep the engine consistent with the URL. In-app
// navigation goes the other way (engine state → URL, see MatchController).

export function useSyncNav(tab: NavTab) {
  const { setNav } = useAppActions();
  useEffect(() => {
    setNav(tab);
  }, [setNav, tab]);
}

export function useSyncSquadDetail(idx: number) {
  const { openSquadRoute } = useAppActions();
  useEffect(() => {
    openSquadRoute(idx);
  }, [openSquadRoute, idx]);
}

export function useSyncLive() {
  const { enterLive } = useAppActions();
  useEffect(() => {
    enterLive();
  }, [enterLive]);
}

export function useSyncPost() {
  const { goPost } = useAppActions();
  useEffect(() => {
    goPost();
  }, [goPost]);
}

// Deep-link entry for /recap/[game_id]: a specific past match's recap, as
// opposed to the bare /recap route's live-or-most-recent-finished heuristic.
export function useSyncPostGame(gameId: number) {
  const { goPost } = useAppActions();
  useEffect(() => {
    goPost(gameId);
  }, [goPost, gameId]);
}
