"use client";
import { useSyncLive } from "@/state/routeSync";
import { LiveScreen } from "@/components/screens/LiveScreen";
export default function Page() {
  useSyncLive();
  return <LiveScreen />;
}
