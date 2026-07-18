"use client";
import { useSyncNav } from "@/state/routeSync";
import { ProfileScreen } from "@/components/screens/ProfileScreen";
export default function Page() {
  useSyncNav("profile");
  return <ProfileScreen />;
}
