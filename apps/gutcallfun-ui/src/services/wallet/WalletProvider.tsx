"use client";

import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SOLANA_RPC_URL } from "@/services/api/config";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Solana wallet context for the browser. This is the ONLY place the wallet
 * lives — sign-in uses `signMessage`, never a private key or a transaction.
 *
 * No explicit adapters are listed: modern wallets (Phantom, Solflare, Backpack…)
 * register themselves via the Wallet Standard and are auto-detected, so an empty
 * `wallets` array is correct and keeps the dependency surface small.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [], []);

  // autoConnect ON so selecting a wallet in the modal actually connects it.
  // The sign-in screen guards against reload popups by only signing in on an
  // explicit user click, not on any silent reconnect (see SignInScreen).
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
