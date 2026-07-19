"use client";
import { useSyncNav } from "@/state/routeSync";
import { MatchesScreen } from "@/components/screens/MatchesScreen";
export default function Page() {
  useSyncNav("matches");
  return <MatchesScreen />;
}
