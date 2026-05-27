"use client";

import { useSelfRevokeWatcher } from "@/hooks/useSelfRevokeWatcher";

export function SelfRevokeWatcher(): null {
  useSelfRevokeWatcher();
  return null;
}
