"use client";

import { useEffect, useRef } from "react";
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
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    authApi
      .me()
      .then(() => saveUsername()) // valid session → authStep "done"
      .catch(() => {}); // 401 → stay on sign-in
  }, [saveUsername]);

  return null;
}
