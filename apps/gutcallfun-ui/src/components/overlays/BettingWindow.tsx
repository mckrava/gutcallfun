"use client";

import { useApp } from "@/state/context";
import { Fragment } from "react";

export function BettingWindow() {
  const vm = useApp();
  if (!vm.winOpen) return null;
  return (
    <div data-screen-label="Betting window" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", zIndex: 30 }}>
      <div onClick={vm.dismissWin} style={{ position: "absolute", inset: 0, background: "rgba(3,6,12,.62)" }} />
      <div onPointerDown={vm.winDown} onPointerMove={vm.winMove} onPointerUp={vm.winUp} style={{ position: "relative", width: "100%", background: "#0C1424", borderTop: "1px solid rgba(255,255,255,.12)", borderRadius: "24px 24px 0 0", padding: "14px 18px 40px", boxShadow: "0 -14px 44px rgba(0,0,0,.55)", animation: "kfSlideUp .34s cubic-bezier(.22,1.2,.36,1)", transform: `translateY(${vm.winDragT})`, touchAction: "none" }}>
        <div style={{ width: "38px", height: "4px", borderRadius: "999px", background: "rgba(255,255,255,.18)", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ fontSize: "12px" }}>⚡</div>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "2px", color: vm.winTeamColor }}>ATTACK STARTING</div>
            </div>
            <div style={{ marginTop: "5px", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: "23px", lineHeight: "1.1", letterSpacing: ".5px" }}>{vm.winHead}</div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "rgba(220,230,245,.55)" }}>How far does this one go?</div>
          </div>
          <div style={{ position: "relative", width: "52px", height: "52px", flexShrink: 0 }}>
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)", display: "block" }}>
              <circle cx="26" cy="26" r="21" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4.5" />
              <circle cx="26" cy="26" r="21" fill="none" stroke={vm.ringColor} strokeWidth="4.5" strokeLinecap="round" strokeDasharray="131.9" strokeDashoffset={vm.ringOffset} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "20px", color: vm.ringColor }}>{vm.ringNum}</div>
          </div>
        </div>
        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {vm.winOpts.map((o, i) => (
            <Fragment key={i}>
              <button onClick={o.on} style={{ height: "48px", borderRadius: "13px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", background: o.bg, border: `1.5px solid ${o.bd}`, opacity: o.op, cursor: "pointer" }}>
                <span style={{ fontFamily: "Barlow,sans-serif", fontSize: "15px", fontWeight: 600, color: o.col }}>{o.label}</span>
                <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: "19px", color: o.ptsCol }}>{o.pts}</span>
              </button>
            </Fragment>
          ))}
        </div>
        <div style={{ marginTop: "11px", textAlign: "center", fontSize: "11.5px", fontWeight: 600, letterSpacing: ".5px", color: "rgba(220,230,245,.5)" }}>{vm.winNote}</div>
      </div>
    </div>
  );
}
