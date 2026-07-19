"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { authApi } from "@/services/api/endpoints";
import { ApiError } from "@/services/api/http";
import { useAppActions } from "@/state/context";

/**
 * Drives the real sign-in handshake and maps its outcome onto the existing
 * authStep flow:
 *   signIn()   → authenticated (known wallet) advances straight to "done";
 *                a first-time wallet advances to "username".
 *   register() → creates the user with the chosen handle, then "done".
 *
 * The JWT never touches this code — verify/register post through the Next BFF,
 * which captures the tokens server-side and returns only { status, user }.
 */
export function useWalletAuth() {
  const { publicKey, signMessage, disconnect } = useWallet();
  const { connectWallet, saveUsername, restart } = useAppActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError("This wallet can't sign messages.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const wallet = publicKey.toBase58();
      const challenge = await authApi.challenge(wallet);
      const signature = await signMessage(new TextEncoder().encode(challenge.message));
      const result = await authApi.verify({
        wallet_address: wallet,
        nonce: challenge.nonce,
        signature: bs58.encode(signature),
      });
      if (result.status === "authenticated") {
        saveUsername(); // known wallet → straight into the app
      } else {
        connectWallet(); // first-time wallet → choose a handle
      }
    } catch (e) {
      setError(messageFor(e, "Sign-in failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [publicKey, signMessage, connectWallet, saveUsername]);

  const register = useCallback(
    async (handle: string) => {
      const trimmed = handle.trim();
      if (trimmed.length < 3) {
        setError("Username must be at least 3 characters.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await authApi.register(trimmed);
        saveUsername(); // → done
      } catch (e) {
        setError(messageFor(e, "Could not save your username."));
      } finally {
        setBusy(false);
      }
    },
    [saveUsername],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      // Clear the server session (best-effort), then drop the wallet so
      // autoConnect can't immediately re-sign-in on the sign-in screen.
      await authApi.logout().catch(() => {});
      await disconnect().catch(() => {});
    } finally {
      setBusy(false);
      restart(); // fresh app state → authStep "connect" → routes to /signin
    }
  }, [disconnect, restart]);

  return { signIn, register, signOut, error, busy };
}

function messageFor(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const body = e.body as { message?: string | string[] } | undefined;
    const m = body?.message;
    if (Array.isArray(m) && m.length > 0) return m[0];
    if (typeof m === "string") return m;
    if (e.status === 409) return "That username is already taken.";
  }
  // Wallet rejected the signature prompt.
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string" &&
    /reject|denied|cancel/i.test((e as { message: string }).message)
  ) {
    return "Signature request was cancelled.";
  }
  return fallback;
}
