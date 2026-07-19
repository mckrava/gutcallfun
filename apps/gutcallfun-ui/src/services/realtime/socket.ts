import { io, type Socket } from "socket.io-client";
import { WS_URL } from "@/services/api/config";
import type { ClientToServerEvents, ServerToClientEvents } from "@/services/api/types";
import { getSocketAuth } from "./getSocketAuth";

export type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Creates the (disconnected) typed socket. `auth` is resolved lazily before
// every (re)connect, so the auth seam can be async (ticket fetch) without the
// caller caring. Browser connects DIRECTLY to the backend — Next cannot proxy
// the socket.io upgrade.
export function createSocket(): LiveSocket {
  return io(WS_URL, {
    transports: ["websocket"],
    autoConnect: false,
    auth: (cb) => {
      void getSocketAuth()
        .then((auth) => cb(auth))
        .catch(() => cb({}));
    },
  });
}
