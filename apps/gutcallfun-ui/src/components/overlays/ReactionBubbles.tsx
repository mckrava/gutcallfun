"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLiveGame } from "@/services/realtime/LiveProvider";
import { getRealData, subscribeRealData } from "@/state/realData";

// Hard cap on bubbles on screen at once. A burst of dozens of reactions must
// never grow past this and cover the match info — oldest bubbles are dropped.
const MAX_VISIBLE = 4;

interface Bubble {
  key: number;
  avatar: string;
  emoji: string;
  handle: string;
  /** Random horizontal spawn position (% of width), fixed once per bubble. */
  x: number;
}

// Floating squad-reaction bubbles over the live screen. Reads the reactions
// LiveProvider collects from the socket (own optimistic echo + squadmates'),
// keeps only those for the caller's picked squad, and floats each up once. Each
// bubble removes itself when its animation ends — no timers to leak or cancel.
// Rendered from the Overlays dispatcher, which already gates it to the /live
// route, so reactions never surface on another screen.
export function ReactionBubbles() {
  const gameId = useSyncExternalStore(subscribeRealData, () => getRealData().liveGameId ?? null, () => null);
  const squadId = useSyncExternalStore(subscribeRealData, () => getRealData().matchSquadId ?? null, () => null);
  const reactions = useLiveGame(gameId)?.reactions;

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const shown = useRef<Set<number>>(new Set());
  const seeded = useRef(false);

  useEffect(() => {
    if (!reactions) return;
    // On (re)mount, treat everything already in the provider's bounded log as
    // already-seen. LiveProvider lives in the root layout and retains recent
    // reactions, but this overlay unmounts when leaving /live and remounts with
    // an empty `shown` set — without this watermark, re-entering the match would
    // replay the entire backlog of reactions at once.
    if (!seeded.current) {
      seeded.current = true;
      for (const r of reactions) shown.current.add(r._id);
      return;
    }
    if (squadId == null) return;
    const fresh = reactions.filter((r) => r.squad_id === squadId && !shown.current.has(r._id));
    if (fresh.length === 0) return;
    for (const r of fresh) shown.current.add(r._id);
    setBubbles((prev) =>
      [
        ...prev,
        // Random horizontal spawn (18–82% of width) so a burst scatters across
        // the screen instead of stacking on one line — computed once here, not
        // per render, so a bubble never jumps sideways while it rises.
        ...fresh.map((r) => ({ key: r._id, avatar: r.avatar, emoji: r.emoji, handle: r.handle, x: 18 + Math.random() * 64 })),
      ].slice(-MAX_VISIBLE),
    );
  }, [reactions, squadId]);

  if (bubbles.length === 0) return null;
  // A bottom-anchored line: every bubble spawns at the same height and floats up
  // on its own, dissolving as it rises (see kfReactFloat). The outer wrapper only
  // places the spawn point — same bottom, RANDOM horizontal x — for a scattered,
  // chaotic stream; the inner element does the rise + fade so its transform
  // animation doesn't fight the horizontal placement.
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 96, height: 0, zIndex: 39, pointerEvents: "none" }}>
      {bubbles.map((b) => (
        <div key={b.key} style={{ position: "absolute", bottom: 0, left: `${b.x}%`, transform: "translateX(-50%)" }}>
          <div
            onAnimationEnd={() => setBubbles((prev) => prev.filter((x) => x.key !== b.key))}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 13px 5px 5px", borderRadius: 999, background: "rgba(13,18,30,.92)", border: "1px solid rgba(255,255,255,.12)", boxShadow: "0 8px 20px rgba(0,0,0,.45)", whiteSpace: "nowrap", animation: "kfReactFloat 2.8s ease-out forwards" }}
          >
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#0D1626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{b.avatar}</div>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 12, letterSpacing: ".3px", color: "rgba(220,230,245,.7)" }}>@{b.handle}</span>
            <span style={{ fontSize: 20 }}>{b.emoji}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
