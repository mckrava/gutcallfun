"use client";
import { useSyncNav } from "@/state/routeSync";
import { RewardsScreen } from "@/components/screens/RewardsScreen";
export default function Page() {
  useSyncNav("rewards");
  return <RewardsScreen />;
}
