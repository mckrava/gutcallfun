"use client";

import { useApp } from "@/state/context";
import { Fragment } from "react";
import { useCurrentUser, useSquad, useSquadParticipants } from "@/services/api/hooks";
import { squadMembersToRows } from "@/services/adapters/squads";
import { avatarFor } from "@/services/adapters/avatar";

// Real Squad detail — the squad + its members come from the backend, keyed by
// the route's squad id. Back / add actions stay on the mock controller.
export function SquadDetailScreen({ squadId }: { squadId: number }) {
  const vm = useApp();
  const me = useCurrentUser();
  const squad = useSquad(squadId);
  const participants = useSquadParticipants(squadId);
  const { top3, rest } = squadMembersToRows(participants.data?.items ?? [], me.data?.id);
  const openSquad = {
    ring: avatarFor(String(squadId)).ring,
    emoji: squad.data?.emoji ?? "⚽",
    name: squad.data?.name ?? "Squad",
    count: `${squad.data?.member_count ?? top3.length + rest.length} members`,
    code: squad.data?.invite_code ?? "",
    top3,
    rest,
  };
  return (
    <div
      data-screen-label="Squad detail"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "24px 24px 92px" }}
    >
      <button onClick={vm.backSquadList} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "rgba(220,230,245,.55)", fontFamily: "Barlow,sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}>‹ Squads</button>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 13 }}>
        <div style={{ width: 52, height: 52, borderRadius: 15, background: "#0D1626", boxShadow: `0 0 0 2px ${openSquad.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>{openSquad.emoji}</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 26, letterSpacing: ".4px" }}>{openSquad.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: "11.5px", color: "rgba(220,230,245,.45)" }}>{openSquad.count}</span><span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "#FFD84D", background: "rgba(255,216,77,.12)", borderRadius: 6, padding: "2px 7px", fontFamily: "ui-monospace,Menlo,monospace" }}>#{openSquad.code}</span></div>
        </div>
        <button onClick={vm.openAdd} style={{ flexShrink: 0, alignSelf: "flex-start", background: "rgba(255,216,77,.14)", border: "1px solid rgba(255,216,77,.4)", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 13, color: "#FFD84D" }}>+ ADD</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", margin: "18px -6px 0", padding: "2px 6px 8px", display: "flex", flexDirection: "column", gap: 7 }}>
        {openSquad.top3.map((m, i) => (
          <Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 14, padding: "11px 13px", background: m.medalBg, border: `1px solid ${m.medalBd}` }}>
              <div style={{ width: 40, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 30, lineHeight: ".8", color: m.numCol, textAlign: "center" }}>#{m.rank}</div>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#0D1626", boxShadow: `0 0 0 2px ${m.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{m.emoji}</div>
              <div style={{ flex: 1, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: ".3px", color: m.nameCol }}>{m.name}</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 18, color: m.numCol }}>{m.pts}</div>
            </div>
          </Fragment>
        ))}
        {openSquad.rest.map((m, i) => (
          <Fragment key={i}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 13, padding: "10px 13px", background: m.rowBg, border: `1px solid ${m.rowBd}` }}>
              <div style={{ width: 40, textAlign: "center", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 16, color: m.rankCol }}>{m.rank}</div>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#0D1626", boxShadow: `0 0 0 2px ${m.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{m.emoji}</div>
              <div style={{ flex: 1, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, letterSpacing: ".3px", color: m.nameCol }}>{m.name}</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 17, color: m.ptsCol }}>{m.pts}</div>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
