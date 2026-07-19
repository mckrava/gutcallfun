"use client";
import { useSyncNav } from "@/state/routeSync";
import { RankingsScreen } from "@/components/screens/RankingsScreen";
export default function Page() {
  useSyncNav("ranks");
  return <RankingsScreen />;
}
