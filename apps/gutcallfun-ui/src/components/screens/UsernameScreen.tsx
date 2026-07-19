"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletAuth } from "@/services/auth/useWalletAuth";
import { useApp } from "@/state/context";
import arrow from "@/icons/arrow.svg";
import SolanaWhite from "@/icons/SolanaWhite.svg";

// Ported verbatim from the "Choose username" screen (isUsername block).
export function UsernameScreen() {
  const vm = useApp();
  const { publicKey, disconnect } = useWallet();
  const { register, busy, error } = useWalletAuth();
  const address = publicKey?.toBase58() ?? "";
  const shortAddress = address
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : "wallet";

  // Bail out of registration: drop the wallet connection and return to the
  // connect screen so a different wallet can sign in.
  const changeWallet = async () => {
    try {
      await disconnect();
    } catch {
      /* already disconnected — ignore */
    }
    vm.showOnboarding(); // authStep -> "connect" (routes to /signin), clears the input
  };

  return (
    <div
      data-screen-label="Choose username"
      style={{ position: "absolute", inset: 0, zIndex: 60, background: "radial-gradient(130% 70% at 50% -6%, #14213C 0%, #0A101D 46%, #060A12 100%)", display: "flex", flexDirection: "column", padding: "24px 30px 40px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, alignSelf: "center", background: "rgba(153,69,255,.14)", border: "1px solid rgba(153,69,255,.4)", borderRadius: 999, padding: "5px 12px" }}>
        <img src={SolanaWhite.src} alt="" style={{ height: 10, display: "block" }} />
        <span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11, color: "#CDBBFF" }}>{shortAddress} connected</span>
      </div>
      <button
        type="button"
        onClick={() => void changeWallet()}
        disabled={busy}
        style={{ marginTop: 9, alignSelf: "center", background: "none", border: "none", cursor: busy ? "default" : "pointer", fontFamily: "Barlow,sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.2px", color: "rgba(205,187,255,.75)", textDecoration: "underline", textUnderlineOffset: "3px", opacity: busy ? 0.5 : 1 }}
      >
        Change wallet
      </button>
      <div style={{ marginTop: 34, fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 32, letterSpacing: "0.5px" }}>CHOOSE YOUR USERNAME</div>
      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: "rgba(220,230,245,.55)" }}>This is how your squad and the leaderboards will see you. You can change it later.</div>
      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 8, height: 56, borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.14)", padding: "0 16px" }}>
        <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 22, color: "rgba(220,230,245,.4)" }}>@</span>
        <input
          value={vm.onbUser}
          onChange={vm.setOnb}
          placeholder="username"
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#F2F6FC", fontFamily: "Barlow,sans-serif", fontSize: 17 }}
        />
      </div>
      {error && (
        <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.4, color: "#FF8A94" }}>{error}</div>
      )}
      <div style={{ flex: 1 }} />
      <button
        onClick={() => void register(vm.onbUser)}
        disabled={busy}
        style={{ width: "100%", height: 56, borderRadius: 15, border: "none", background: "linear-gradient(135deg,#FFD84D,#FFB300)", color: "#221A00", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 17, letterSpacing: "0.8px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, boxShadow: "0 10px 30px rgba(255,200,0,.28)", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
      >
        {busy ? "SAVING…" : "ENTER GUTCALL"}<img src={arrow.src} alt="" style={{ height: 16, display: "block" }} />
      </button>
    </div>
  );
}
