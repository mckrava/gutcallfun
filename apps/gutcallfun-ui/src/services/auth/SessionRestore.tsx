"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/services/api/endpoints";
import { useAppActions } from "@/state/context";

/**
 * On load, ask the server whether the session cookie is still valid. If it is,
 * advance straight into the app (authStep → "done") — no wallet, no signature.
 * If not, do nothing and the user stays on the sign-in screen.
 *
 * This is what makes the server session actually save a reload: without it the
 * mock authStep resets to "connect" on every mount and a returning user would
 * be sent back to sign-in.
 */
export function SessionRestore() {
  const { saveUsername } = useAppActions();
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    authApi
      .me()
      .then(() => {
        // Auth-dependent queries mount alongside this check and can lose the
        // race, 401-ing before the session is confirmed. With retry: 1 and no
        // refetch-on-focus they would stay empty for the rest of the session.
        //
        // Only errored queries are refetched, not the whole cache: a normal
        // load where everything already succeeded must not pay for a second
        // round of every request.
        void qc.invalidateQueries({
          predicate: (query) => query.state.status === "error",
        });
        saveUsername(); // valid session → authStep "done"
      })
      .catch(() => {}); // 401 → stay on sign-in
  }, [saveUsername, qc]);

  return null;
}
