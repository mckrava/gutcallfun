import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
