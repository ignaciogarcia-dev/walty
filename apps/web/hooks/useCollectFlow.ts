"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentRequestView } from "@walty/shared/payments/types";
import { isPaymentRequestActive } from "@walty/shared/payments/types";
import { getNamespaceSocket } from "@/lib/ws/socketClient";

const QUERY_KEY = ["payment-requests-active"] as const;

/**
 * Collect modal + active payment request, refreshed via socket.io.
 * The dashboard subscribes to /business; the server pushes
 * `business:active-changed` whenever a payment request is created,
 * cancelled, paid or expired, and we refetch /payment-requests once.
 */
export function useCollectFlow() {
  const queryClient = useQueryClient();
  const [collectOpen, setCollectOpen] = useState(false);

  const {
    data: activeRequest = null,
    isLoading: activeRequestPending,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/payment-requests");
      if (!res.ok) return null;
      const { data } = (await res.json()) as {
        data: { request: PaymentRequestView | null };
      };
      return data.request && isPaymentRequestActive(data.request)
        ? data.request
        : null;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const socket = getNamespaceSocket("/business");
    const refetch = () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    };
    socket.on("business:active-changed", refetch);
    socket.on("connect", refetch);
    return () => {
      socket.off("business:active-changed", refetch);
      socket.off("connect", refetch);
    };
  }, [queryClient]);

  const handleRequestChange = useCallback(
    (request: PaymentRequestView | null) => {
      const newActive =
        request && isPaymentRequestActive(request) ? request : null;
      queryClient.setQueryData(QUERY_KEY, newActive);
    },
    [queryClient],
  );

  const clearActiveRequest = useCallback(() => {
    queryClient.setQueryData(QUERY_KEY, null);
  }, [queryClient]);

  return {
    collectOpen,
    setCollectOpen,
    activeRequest,
    activeRequestPending,
    handleRequestChange,
    clearActiveRequest,
  };
}
