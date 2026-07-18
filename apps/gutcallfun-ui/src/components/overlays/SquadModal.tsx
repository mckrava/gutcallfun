"use client";

import { useApp } from "@/state/context";
import { Fragment } from "react";

// Ported verbatim from the "modalOpen" bottom-sheet in the old template.
export function SquadModal() {
  const vm = useApp();
  if (!vm.modalOpen) return null;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", zIndex: 50 }}>
      <div onClick={vm.closeModal} style={{ position: "absolute", inset: 0, background: "rgba(3,6,12,.62)" }} />
      <div style={{ position: "relative", width: "100%", background: "#0C1424", borderRadius: "24px 24px 0 0", borderTop: "1px solid rgba(255,255,255,.12)", padding: "20px 22px 30px", animation: "kfSlideUp .3s ease", boxShadow: "0 -14px 44px rgba(0,0,0,.5)" }}>
        <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(255,255,255,.18)", margin: "0 auto 18px" }} />

        {vm.modalCreate && (
          <>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 24, letterSpacing: ".4px" }}>CREATE SQUAD</div>
            <div style={{ marginTop: 5, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>Name it and pick a crest. You'll get a code to share.</div>
            <input value={vm.formName} onChange={vm.setName} placeholder="Squad name" style={{ marginTop: 16, width: "100%", height: 48, borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", color: "#F2F6FC", fontFamily: "Barlow,sans-serif", fontSize: 15, padding: "0 14px", outline: "none" }} />
            <div style={{ marginTop: 12, fontSize: "9.5px", fontWeight: 700, letterSpacing: "1.8px", color: "rgba(220,230,245,.45)" }}>CREST</div>
            <div style={{ marginTop: 9, display: "flex", gap: 8 }}>
              {vm.emojiOpts.map((e, i) => (
                <Fragment key={i}>
                  <button onClick={e.pick} style={{ width: 46, height: 46, borderRadius: 12, background: e.bg, border: `1.5px solid ${e.bd}`, cursor: "pointer", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>{e.em}</button>
                </Fragment>
              ))}
            </div>
            <button onClick={vm.doCreate} style={{ marginTop: 20, width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".8px", cursor: "pointer" }}>CREATE</button>
          </>
        )}

        {vm.modalJoin && (
          <>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 24, letterSpacing: ".4px" }}>JOIN A SQUAD</div>
            <div style={{ marginTop: 5, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>Enter the code a friend shared with you.</div>
            <input value={vm.formCode} onChange={vm.setCode} placeholder="e.g. DEGEN" style={{ marginTop: 16, width: "100%", height: 52, borderRadius: 12, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", color: "#FFD84D", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 20, letterSpacing: 4, textAlign: "center", padding: "0 14px", outline: "none", textTransform: "uppercase" }} />
            <button onClick={vm.doJoin} style={{ marginTop: 20, width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".8px", cursor: "pointer" }}>JOIN SQUAD</button>
          </>
        )}

        {vm.modalPick && (
          <>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 24, letterSpacing: ".4px" }}>PICK SQUAD FOR THIS MATCH</div>
            <div style={{ marginTop: 5, fontSize: "12.5px", color: "rgba(220,230,245,.5)" }}>You'll duel this squad live during the game.</div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {vm.squadPickList.map((sq, i) => (
                <Fragment key={i}>
                  <button onClick={sq.pick} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, borderRadius: 13, padding: "12px 13px", background: sq.selBg, border: `1px solid ${sq.selBd}`, cursor: "pointer", color: "#F2F6FC" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: "#0D1626", boxShadow: `0 0 0 2px ${sq.ring}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{sq.emoji}</div>
                    <div style={{ flex: 1 }}><div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16 }}>{sq.name}</div><div style={{ fontSize: "10.5px", color: "rgba(220,230,245,.45)" }}>{sq.count}</div></div>
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
            <button onClick={vm.doAddMember} style={{ marginTop: 20, width: "100%", height: 50, borderRadius: 14, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 15, letterSpacing: ".8px", cursor: "pointer" }}>ADD TO SQUAD</button>
          </>
        )}

        <button onClick={vm.closeModal} style={{ marginTop: 10, width: "100%", height: 44, borderRadius: 14, background: "none", border: "none", color: "rgba(220,230,245,.5)", fontFamily: "Barlow,sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
