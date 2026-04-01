"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PAYMENT_HOME_POLL_INTERVAL_MS } from "@/lib/payments/config";
import type { PaymentRequestView } from "@/lib/payments/types";
import { isPaymentRequestActive } from "@/lib/payments/types";

/**
 * Collect modal + active payment request polling shared by OwnerHome and CashierHome.
 */
export function useCollectFlow() {
  const queryClient = useQueryClient();
  const [collectOpen, setCollectOpen] = useState(false);

  const {
    data: activeRequest = null,
    isLoading: activeRequestPending,
  } = useQuery({
    queryKey: ["payment-requests-active"],
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
    refetchInterval: collectOpen ? false : PAYMENT_HOME_POLL_INTERVAL_MS,
    staleTime: PAYMENT_HOME_POLL_INTERVAL_MS,
  });

  const handleRequestChange = useCallback(
    (request: PaymentRequestView | null) => {
      const newActive =
        request && isPaymentRequestActive(request) ? request : null;
      queryClient.setQueryData(["payment-requests-active"], newActive);
    },
    [queryClient],
  );

  const clearActiveRequest = useCallback(() => {
    queryClient.setQueryData(["payment-requests-active"], null);
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
