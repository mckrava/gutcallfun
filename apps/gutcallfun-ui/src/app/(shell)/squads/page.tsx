"use client";
import { useSyncNav } from "@/state/routeSync";
import { SquadsListScreen } from "@/components/screens/SquadsListScreen";
export default function Page() {
  useSyncNav("squad");
  return <SquadsListScreen />;
}
