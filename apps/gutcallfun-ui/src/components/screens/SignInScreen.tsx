"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletAuth } from "@/services/auth/useWalletAuth";
import SolanaWhite from "@/icons/SolanaWhite.svg";

// Ported verbatim from the "Sign in" screen in the old template (isAuth block).
export function SignInScreen() {
  const { connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { signIn, error, busy } = useWalletAuth();

  // Only sign in when the user explicitly asks to — NOT on any `connected`
  // transition. autoConnect silently reconnects the wallet on reload; without
  // this intent gate that would pop a signature request on every refresh
  // (SessionRestore, not the wallet, keeps a returning user signed in).
  //
  // wantSignIn: set when the user opens the modal to connect; the effect then
  // signs in once the wallet connects. ran: dedupes that effect-driven sign-in.
  const wantSignIn = useRef(false);
  const ran = useRef(false);
  useEffect(() => {
    if (connected && wantSignIn.current && !ran.current) {
      ran.current = true;
      void signIn();
    }
    if (!connected) {
      ran.current = false;
      wantSignIn.current = false;
    }
  }, [connected, signIn]);

  // The button: if a wallet is already connected, sign in now (also the retry
  // path after a failed signature — the button is disabled while busy, so no
  // overlap); otherwise open the modal and let the effect sign in on connect.
  const handleConnect = () => {
    if (connected) {
      void signIn();
    } else {
      wantSignIn.current = true;
      setVisible(true);
    }
  };

  const pending = connecting || busy;

  return (
    <div
      data-screen-label="Sign in"
      style={{ position: "absolute", inset: 0, zIndex: 60, overflow: "hidden", display: "flex", flexDirection: "column", padding: "24px 26px 30px" }}
    >
      <div style={{ position: "absolute", top: "-14%", left: "-24%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,216,77,.24),transparent 68%)", animation: "kfGlow 5s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "6%", right: "-26%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,rgba(127,184,232,.22),transparent 68%)", animation: "kfGlow 6s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(115deg,transparent 0 38px,rgba(255,255,255,.014) 38px 39px)", pointerEvents: "none" }} />

      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 11 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 40, lineHeight: 1, color: "#F2F6FC" }}>GC</div>
          <svg viewBox="0 0 40 12" width="44" height="13">
            <polyline points="2,6 12,6 16,2 20,10 24,6 30,6 33,4 38,6" fill="none" stroke="#FFD84D" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ width: 1, height: 44, background: "rgba(255,255,255,.14)" }} />
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 34, letterSpacing: 1 }}>
          GUT<span style={{ color: "#FFD84D" }}>CALL</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative" }}>
        <div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 58, lineHeight: 0.92, letterSpacing: "0.5px", color: "#F2F6FC", textWrap: "balance" }}>
            TRUST YOUR<br />GUT.<br /><span style={{ color: "#FFD84D" }}>CALL</span> THE GAME.
          </div>
          <div style={{ marginTop: 16, fontSize: "14.5px", lineHeight: 1.55, color: "rgba(220,230,245,.6)", maxWidth: 280 }}>
            Read every live moment, duel your squad in real time, and climb the global ranks.
          </div>
        </div>
      </div>

      <button
        onClick={handleConnect}
        disabled={pending}
        style={{ position: "relative", width: "100%", height: 58, borderRadius: 16, border: "none", background: "linear-gradient(135deg,#9945FF 0%,#7A5CFF 50%,#14F195 100%)", color: "#fff", fontFamily: "'Barlow Condensed',sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: 18, letterSpacing: "0.8px", cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1, boxShadow: "0 14px 38px rgba(153,69,255,.45)", display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
      >
        <img src={SolanaWhite.src} alt="" style={{ width: 18, height: 16, display: "block" }} /> {connecting ? "CONNECTING…" : busy ? "SIGNING IN…" : "CONNECT SOLANA WALLET"}
      </button>
      {error && (
        <div style={{ position: "relative", marginTop: 12, textAlign: "center", fontSize: 12, lineHeight: 1.4, color: "#FF8A94" }}>{error}</div>
      )}
      <div style={{ position: "relative", marginTop: 13, textAlign: "center", fontSize: 11, lineHeight: 1.5, color: "rgba(220,230,245,.4)" }}>
        No crypto knowledge needed — your wallet is just your login.<br />By continuing you agree to the Terms &amp; Privacy.
      </div>
    </div>
  );
}
