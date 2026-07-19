import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit `.next/standalone` (a self-contained server.js + the traced subset of
  // node_modules) so the Docker runtime stage needs no `npm install` at all.
  output: "standalone",
  // REQUIRED in this monorepo, not cosmetic: npm workspaces hoists nearly every
  // dependency to the REPO-ROOT node_modules, which sits outside this app's
  // directory. Output-file tracing defaults to the project directory, so without
  // this the standalone bundle would silently omit the hoisted packages and the
  // container would crash on its first require. Points two levels up, at the
  // repo root that also holds package-lock.json.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Hide the dev-tools indicator (it overlaps the bottom-left nav button during
  // local dev / screenshotting). Has no effect on production builds.
  devIndicators: false,
  // Allow the dev server's internal /_next/* resources to be loaded when the app
  // is reached from other origins during development (phone on the LAN, ngrok
  // tunnel). Without this, Next.js blocks those cross-origin requests and the
  // client bundle never loads — the page renders its background but no content.
  allowedDevOrigins: [
    "192.168.2.57", // Mac's LAN IP — phone on the same Wi-Fi
    "*.ngrok-free.app", // any ngrok free tunnel host
  ],
};

export default nextConfig;
