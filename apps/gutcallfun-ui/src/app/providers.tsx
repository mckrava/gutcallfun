"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { LiveProvider } from "@/services/realtime/LiveProvider";
import { WalletProvider } from "@/services/wallet/WalletProvider";

// Data-layer providers: Solana wallet + react-query (REST) + the live WS feed.
// WalletProvider is outermost so every screen (sign-in, onboarding) can read the
// connected wallet; it stays separate from the (mock) AppProvider so they
// compose cleanly.
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <WalletProvider>
      <QueryClientProvider client={client}>
        <LiveProvider>{children}</LiveProvider>
      </QueryClientProvider>
    </WalletProvider>
  );
}
