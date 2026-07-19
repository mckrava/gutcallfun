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
  const { saveUsername, sessionCheckFailed } = useAppActions();
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const restore = () => {
      // Auth-dependent queries mount alongside this check and can lose the
      // race, 401-ing before the session is confirmed. With retry: 1 and no
      // refetch-on-focus they would stay empty for the rest of the session.
      // Only errored queries are refetched, not the whole cache.
      void qc.invalidateQueries({ predicate: (query) => query.state.status === "error" });
      saveUsername(); // valid session → authStep "done"
    };

    // One retry after a short delay. Mobile wallet in-app browsers occasionally
    // don't hand over the (now persistent) session cookie on the very first
    // request after a reload, then do a moment later — that's the "kicked to
    // sign-in, but a few more reloads log me back in" symptom. Retrying once
    // turns those manual reloads into an automatic recovery within one load; a
    // genuinely logged-out user just reaches the sign-in screen ~600ms later.
    // `notSignedIn` marks the session check DONE without authenticating, which
    // releases routeForState to send a genuinely signed-out user to /signin.
    // Until this (or restore) runs, the app holds the current URL — no flash.
    const notSignedIn = () => sessionCheckFailed();

    authApi
      .me()
      .then(restore)
      .catch(() => {
        setTimeout(() => {
          authApi.me().then(restore).catch(notSignedIn); // still 401 → go to sign-in
        }, 600);
      });
  }, [saveUsername, sessionCheckFailed, qc]);

  return null;
}
