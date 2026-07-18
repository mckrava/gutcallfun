"use client";
import { use } from "react";
import { useSyncSquadDetail } from "@/state/routeSync";
import { SquadDetailScreen } from "@/components/screens/SquadDetailScreen";
export default function Page({ params }: { params: Promise<{ idx: string }> }) {
  const { idx } = use(params);
  useSyncSquadDetail(Number(idx));
  return <SquadDetailScreen />;
}
