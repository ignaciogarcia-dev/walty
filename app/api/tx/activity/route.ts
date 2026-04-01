import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/server/db";
import { transactions, addresses } from "@/server/db/schema";
import { withErrorHandling, withAuth, ok } from "@/lib/api";
import { rateLimitByUser } from "@/lib/rate-limit";
import type { TransactionActivityItem } from "@/lib/activity/types";

export const GET = withErrorHandling(
  withAuth(async (req: NextRequest, { auth }) => {
    await rateLimitByUser(auth.userId, 20, 60_000)

    // Get user's addresses
    const userAddresses = await db
      .select({ address: addresses.address })
      .from(addresses)
      .where(eq(addresses.userId, auth.userId));

    if (userAddresses.length === 0) {
      return ok({ items: [], total: 0 });
    }

    const addressList = userAddresses.map((a) => a.address.toLowerCase());

    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type") || "all";
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
    const offset = Number(searchParams.get("offset") ?? 0);

    // Get all transactions where the user is sender OR receiver
    const allRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, auth.userId))
      .orderBy(desc(transactions.createdAt));

    // Classify each row from the user's perspective
    const classifiedRows = allRows
      .map((tx) => {
        const isSender = addressList.includes(tx.fromAddress.toLowerCase());
        const isReceiver = addressList.includes(tx.toAddress.toLowerCase());

        // Scanner-indexed direct receive (skip if self-transfer)
        if (tx.type === "receive" && !isSender) {
          return { tx, kind: "receive" as const };
        }
        // Cobro recibido por el merchant (type=null, dinero entrante via payment reconciler)
        if (tx.type === null && isReceiver && !isSender && tx.status === "confirmed") {
          return { tx, kind: "collected" as const };
        }
        // Refund: user is the receiver (money coming in), confirmed
        if (isReceiver && !isSender && tx.status === "confirmed") {
          return { tx, kind: "refund" as const };
        }
        // Payment: user is the sender, confirmed
        if (isSender && tx.status === "confirmed") {
          return { tx, kind: "payment" as const };
        }
        // Send: user is the sender, any status
        if (isSender) {
          return { tx, kind: "send" as const };
        }

        return null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Deduplicate by hash: if a transfer was recorded both by the payment-request
    // reconciler (type=null → payment/refund) and by scan-incoming (type='receive'),
    // keep the more specific classification and drop the 'receive' duplicate.
    const PRIORITY: Record<string, number> = { payment: 3, collected: 3, refund: 3, send: 2, receive: 1 }
    const byHash = new Map<string, typeof classifiedRows[number]>()
    for (const row of classifiedRows) {
      const existing = byHash.get(row.tx.hash)
      if (!existing || (PRIORITY[row.kind] ?? 0) > (PRIORITY[existing.kind] ?? 0)) {
        byHash.set(row.tx.hash, row)
      }
    }
    // Re-sort after Map iteration (Map preserves first-insertion order, not winner order)
    const deduped = Array.from(byHash.values()).sort(
      (a, b) => (b.tx.createdAt?.getTime() ?? 0) - (a.tx.createdAt?.getTime() ?? 0),
    )

    // Filter by typeParam
    let filteredRows = deduped;

    if (typeParam === "payments") {
      filteredRows = deduped.filter(
        (r) => r.kind === "payment" || r.kind === "refund",
      );
    } else if (typeParam === "sends") {
      filteredRows = deduped.filter((r) => r.kind === "send");
    }
    // "all" → no filter, keeps everything

    const paginatedRows = filteredRows.slice(offset, offset + limit);

    const items: TransactionActivityItem[] = paginatedRows.map(
      ({ tx, kind }) => ({
        id: tx.id,
        type: kind,
        hash: tx.hash,
        chainId: tx.chainId,
        fromAddress: tx.fromAddress,
        toAddress: tx.toAddress,
        value: tx.value,
        tokenSymbol: tx.tokenSymbol,
        status: tx.status as "pending" | "confirmed" | "failed",
        createdAt: tx.createdAt?.toISOString() ?? new Date().toISOString(),
      }),
    );

    return ok({ items, total: filteredRows.length });
  }),
);
