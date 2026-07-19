"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useCurrentUser } from "@/services/api/hooks";
import { useSendReaction } from "@/services/realtime/LiveProvider";
import { avatarFor } from "@/services/adapters/avatar";
import { getRealData, subscribeRealData } from "@/state/realData";

// The five squad reactions. Same set the mock used — an emoji vocabulary, no
// free text, so nothing user-authored is ever relayed.
const REACTIONS = ["🔥", "😱", "⚽", "🤡", "👎"];

// The in-panel reaction buttons on the live match screen. Tapping one relays an
// ephemeral emoji to the rest of the caller's squad over the socket (see
// useSendReaction / the gateway). Nothing is stored. Disabled until we know the
// live game, the picked squad, and who "you" are — all three are needed to
// address and label the reaction.
export function ReactionBar() {
  const me = useCurrentUser();
  const sendReaction = useSendReaction();
  const gameId = useSyncExternalStore(subscribeRealData, () => getRealData().liveGameId ?? null, () => null);
  const squadId = useSyncExternalStore(subscribeRealData, () => getRealData().matchSquadId ?? null, () => null);

  // Brief highlight on the tapped button. The sender no longer sees their own
  // floating bubble (that is for squadmates), so this is the "sent" feedback.
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ready = gameId != null && squadId != null && !!me.data;
  const react = (emoji: string) => {
    if (!ready || !me.data) return;
    sendReaction({
      game_id: gameId,
      squad_id: squadId,
      emoji,
      handle: me.data.handle,
      avatar: me.data.emoji ?? avatarFor(me.data.id).emoji,
    });
    setFlash(emoji);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 300);
  };

  return (
    <div style={{ flex: 1, display: "flex", gap: 6, justifyContent: "space-between" }}>
      {REACTIONS.map((em) => {
        const lit = flash === em;
        return (
          <button
            key={em}
            onClick={() => react(em)}
            disabled={!ready}
            style={{ flex: 1, height: 38, borderRadius: 11, background: lit ? "rgba(255,216,77,.18)" : "rgba(255,255,255,.05)", border: `1px solid ${lit ? "rgba(255,216,77,.5)" : "rgba(255,255,255,.1)"}`, cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.4, fontSize: 19, display: "flex", alignItems: "center", justifyContent: "center", transform: lit ? "scale(1.12)" : "scale(1)", transition: "transform .15s ease, background .15s ease, border-color .15s ease" }}
          >
            {em}
          </button>
        );
      })}
    </div>
  );
}
