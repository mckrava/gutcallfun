"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/state/context";
import { useAddSquadParticipant, useCreateSquad, useCurrentUser, useJoinSquad, useMySquads } from "@/services/api/hooks";
import { usersApi } from "@/services/api/endpoints";
import { queryKeys } from "@/services/api/queryKeys";
import { setRealData } from "@/state/realData";
import { avatarFor } from "@/services/adapters/avatar";

const CRESTS = ["⚽", "🔥", "⚡", "🏆", "🐉", "👑"];

// Real squad create / join / add-member. Reads the name/code/username inputs
// from the mock controller's form state, but every submit hits the backend.
export function SquadModal() {
  const vm = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const createSquad = useCreateSquad();
  const joinSquad = useJoinSquad();
  const addMember = useAddSquadParticipant(vm.currentSquadId);
  const me = useCurrentUser();
  const mySquads = useMySquads(me.data?.id);
  const [crest, setCrest] = useState("⚽");
  const [err, setErr] = useState<string | null>(null);

  if (!vm.modalOpen) return null;

  const refetchSquads = () => qc.invalidateQueries({ queryKey: queryKeys.squads.all });
  const busy = createSquad.isPending || joinSquad.isPending || addMember.isPending;

  const onCreate = () => {
    const name = vm.formName.trim();
    if (!name) return setErr("Enter a squad name");
    setErr(null);
    createSquad.mutate(
      { name, emoji: crest },
      {
        onSuccess: (squad) => { vm.closeModal(); void refetchSquads(); router.push(`/squads/${squad.id}`); },
        onError: () => setErr("Could not create squad"),
      },
    );
  };

  const onJoin = () => {
    const code = vm.formCode.trim().toUpperCase();
    if (!code) return setErr("Enter an invite code");
    setErr(null);
    joinSquad.mutate(
      { invite_code: code },
      {
        onSuccess: (squad) => { vm.closeModal(); void refetchSquads(); router.push(`/squads/${squad.id}`); },
        onError: () => setErr("No squad found for that code"),
      },
    );
  };

  const onAdd = async () => {
    const handle = vm.formUser.trim().replace(/^@/, "");
    if (!handle) return setErr("Enter a username");
    setErr(null);
    try {
      const found = await usersApi.list({ handle, limit: 1 });
      const user = found.items[0];
      if (!user) return setErr(`No user @${handle}`);
      addMember.mutate(
        { user_id: user.id },
        {
          onSuccess: () => { vm.closeModal(); void refetchSquads(); void qc.invalidateQueries({ queryKey: queryKeys.squads.participants(vm.currentSquadId) }); },
          onError: () => setErr("Could not add member"),
        },
      );
    } catch {
      setErr("Could not look up user");
    }
  };

  const primaryBtn = { marginTop: 20, width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic" as const, fontWeight: 700, fontSize: 15, letterSpacing: ".8px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 };

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", zIndex: 50 }}>
      <div onClick={vm.closeModal} style={{ position: "absolute", inset: 0, background: "rgba(3,6,12,.62)" }} />
      <div style={{ position: "relative", width: "100%", background: "#0C1424", borderRadius: "24px 24px 0 0", borderTop: "1px solid rgba(255,255,255,.12)", padding: "20px 22px 30px", animation: "kfSlideUp .3s ease", boxShadow: "0 -14px 44px rgba(0,0,0,.5)" }}>
        <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(255,255,255,.18)", margin: "0 auto 18px" }} />

        {vm.modalCreate && (
          <>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 24, letterSpacing: ".4px" }}>CREATE SQUAD</div>
            <div style={{ marginTop: 5, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>Name it and pick a crest. You&rsquo;ll get a code to share.</div>
            <input value={vm.formName} onChange={vm.setName} placeholder="Squad name" style={{ marginTop: 16, width: "100%", height: 48, borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", color: "#F2F6FC", fontFamily: "Barlow,sans-serif", fontSize: 15, padding: "0 14px", outline: "none" }} />
            <div style={{ marginTop: 12, fontSize: "9.5px", fontWeight: 700, letterSpacing: "1.8px", color: "rgba(220,230,245,.45)" }}>CREST</div>
            <div style={{ marginTop: 9, display: "flex", gap: 8 }}>
              {CRESTS.map((em, i) => {
                const sel = crest === em;
                return (
                  <Fragment key={i}>
                    <button onClick={() => setCrest(em)} style={{ width: 46, height: 46, borderRadius: 12, background: sel ? "rgba(255,216,77,.16)" : "rgba(255,255,255,.05)", border: `1.5px solid ${sel ? "#FFD84D" : "rgba(255,255,255,.14)"}`, cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>{em}</button>
                  </Fragment>
                );
              })}
            </div>
            <button onClick={onCreate} disabled={busy} style={primaryBtn}>{createSquad.isPending ? "CREATING…" : "CREATE"}</button>
          </>
        )}

        {vm.modalJoin && (
          <>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 24, letterSpacing: ".4px" }}>JOIN A SQUAD</div>
            <div style={{ marginTop: 5, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>Enter the code a friend shared with you.</div>
            <input value={vm.formCode} onChange={vm.setCode} placeholder="e.g. GCSQ42" style={{ marginTop: 16, width: "100%", height: 52, borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", color: "#FFD84D", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 20, letterSpacing: 4, textAlign: "center", padding: "0 14px", outline: "none", textTransform: "uppercase" }} />
            <button onClick={onJoin} disabled={busy} style={primaryBtn}>{joinSquad.isPending ? "JOINING…" : "JOIN SQUAD"}</button>
          </>
        )}

        {vm.modalPick && (
          <>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 24, letterSpacing: ".4px" }}>PICK SQUAD FOR THIS MATCH</div>
            <div style={{ marginTop: 5, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>You&rsquo;ll duel this squad live during the game.</div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {(mySquads.data?.items ?? []).length === 0 && (
                <div style={{ textAlign: "center", fontSize: "12px", color: "rgba(220,230,245,.45)", padding: "8px 0" }}>You&rsquo;re not in a squad yet — create or join one first.</div>
              )}
              {(mySquads.data?.items ?? []).map((sq) => (
                <Fragment key={sq.id}>
                  <button onClick={() => { setRealData({ matchSquadId: sq.id }); vm.closeModal(); }} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, borderRadius: 13, padding: "12px 13px", background: "rgba(255,255,255,.035)", border: "1px solid rgba(255,255,255,.08)", cursor: "pointer", color: "#F2F6FC" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: "#0D1626", boxShadow: `0 0 0 2px ${avatarFor(String(sq.id)).ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{sq.emoji ?? "⚽"}</div>
                    <div style={{ flex: 1 }}><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16 }}>{sq.name}</div><div style={{ fontSize: "10.5px", color: "rgba(220,230,245,.45)" }}>{sq.member_count} {sq.member_count === 1 ? "member" : "members"}</div></div>
                  </button>
                </Fragment>
              ))}
            </div>
          </>
        )}

        {vm.modalAdd && (
          <>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 24, letterSpacing: ".4px" }}>ADD MEMBER</div>
            <div style={{ marginTop: 5, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>Invite a friend by their @username.</div>
            <input value={vm.formUser} onChange={vm.setUser} placeholder="@username" style={{ marginTop: 16, width: "100%", height: 48, borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", color: "#F2F6FC", fontFamily: "Barlow,sans-serif", fontSize: 15, padding: "0 14px", outline: "none" }} />
            <button onClick={() => void onAdd()} disabled={busy} style={primaryBtn}>{addMember.isPending ? "ADDING…" : "ADD TO SQUAD"}</button>
          </>
        )}

        {err && <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "#FF8A94" }}>{err}</div>}
        <button onClick={vm.closeModal} style={{ marginTop: 10, width: "100%", height: 44, borderRadius: 14, background: "none", border: "none", color: "rgba(220,230,245,.5)", fontFamily: "Barlow,sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
