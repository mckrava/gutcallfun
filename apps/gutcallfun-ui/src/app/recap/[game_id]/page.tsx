"use client";
import { use } from "react";
import { useSyncPostGame } from "@/state/routeSync";
import { PostScreen } from "@/components/screens/PostScreen";
export default function Page({ params }: { params: Promise<{ game_id: string }> }) {
  const { game_id } = use(params);
  useSyncPostGame(Number(game_id));
  return <PostScreen />;
}
