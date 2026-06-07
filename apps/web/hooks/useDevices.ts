"use client";

import { useCallback, useEffect, useState } from "react";
import { unwrap } from "@/lib/api/unwrap";
import { getNamespaceSocket } from "@/lib/ws/socketClient";

export interface Device {
  id: string;
  label: string;
  trusted: boolean;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

interface DevicesResponse {
  devices: Device[];
}

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/devices");
      if (res.status === 401) return;
      if (!res.ok) throw new Error("devices-fetch-failed");
      const body = unwrap<DevicesResponse>(await res.json());
      setDevices(body.devices ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const socket = getNamespaceSocket("/devices");
    const onChange = () => {
      refetch();
    };
    socket.on("device:list-changed", onChange);
    return () => {
      socket.off("device:list-changed", onChange);
    };
  }, [refetch]);

  const renameDevice = useCallback(
    async (sid: string, label: string): Promise<void> => {
      const res = await fetch(`/api/devices/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("rename-failed");
    },
    [],
  );

  const revokeDevice = useCallback(async (sid: string): Promise<void> => {
    const res = await fetch(`/api/devices/${sid}/revoke`, { method: "POST" });
    if (!res.ok) throw new Error("revoke-failed");
  }, []);

  return { devices, loading, error, refetch, renameDevice, revokeDevice };
}
