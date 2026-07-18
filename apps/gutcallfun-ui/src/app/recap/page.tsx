"use client";
import { useSyncPost } from "@/state/routeSync";
import { PostScreen } from "@/components/screens/PostScreen";
export default function Page() {
  useSyncPost();
  return <PostScreen />;
}
