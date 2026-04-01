import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { isHex, type Hex } from "viem";
import { db } from "@/server/db";
import {
  refundRequests,
  paymentRequests,
  txIntents,
  businessMembers,
} from "@/server/db/schema";
import { writeAuditLog, AUDIT_ACTIONS } from "@/lib/business/auditLog";
import {
  canApproveRefund,
  canRejectRefund,
  canExecuteRefund,
} from "@/lib/policies/payment.policy";
import { logSecurityEvent } from "@/lib/security/logSecurityEvent";
import {
  withBusinessAuth,
  ok,
  ValidationError,
  NotFoundError,
} from "@/lib/api";
import { Permission } from "@/lib/permissions";
import type { TxIntentPayload } from "@/lib/tx-intents/types";
import {
  verifyTransaction,
  TxVerificationError,
} from "@/lib/transactions/verify";

const TX_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withBusinessAuth<RouteCtx>(
  Permission.REFUND_REVIEW,
  async (req: NextRequest, { auth, business, actor, ip, params }) => {
    const { id } = await params;
    const { action, txHash } = await req.json();

    const [refund] = await db
      .select()
      .from(refundRequests)
      .where(
        and(
          eq(refundRequests.id, id),
          eq(refundRequests.businessId, business.businessId),
        ),
      )
      .limit(1);

    if (!refund) throw new NotFoundError("refund request not found");

    const now = new Date();

    if (action === "approve") {
      const policy = canApproveRefund({ status: refund.status });
      if (!policy.allowed) {
        logSecurityEvent({
          actor,
          action: "approve_refund",
          result: "denied_policy",
          reason: policy.reason,
          ip,
          path: req.nextUrl.pathname,
        });
        throw new ValidationError(policy.reason);
      }

      // Fetch the original payment request to build the tx intent payload
      const [payment] = await db
        .select()
        .from(paymentRequests)
        .where(eq(paymentRequests.id, refund.paymentRequestId))
        .limit(1);

      if (!payment)
        throw new NotFoundError("original payment request not found");

      const operatorMember = payment.merchantWalletAddress
        ? await db.query.businessMembers.findFirst({
            where: and(
              eq(businessMembers.businessId, business.businessId),
              eq(businessMembers.walletAddress, payment.merchantWalletAddress),
            ),
            columns: { derivationIndex: true },
          })
        : null;

      // Build tx intent payload for the refund transaction
      const decimals = payment.tokenDecimals;
      const raw = BigInt(refund.amountToken);
      const divisor = BigInt(10 ** decimals);
      const whole = raw / divisor;
      const frac = raw % divisor;
      const fracStr = frac
        .toString()
        .padStart(decimals, "0")
        .replace(/0+$/, "");
      const amount = fracStr ? `${whole}.${fracStr}` : `${whole}`;

      const payload: TxIntentPayload = {
        to: refund.destinationAddress,
        amount,
        chainId: payment.chainId,
        token: {
          symbol: payment.tokenSymbol,
          address: payment.tokenAddress,
          type: payment.tokenAddress ? "erc20" : "native",
          decimals,
        },
        from: payment.merchantWalletAddress,
      };

      if (operatorMember?.derivationIndex != null) {
        payload.derivationIndex = operatorMember.derivationIndex;
      }

      // Intent must belong to the merchant (wallet owner), not the approver.
      // Tx-intent GET/sign/broadcast are scoped to intent.userId === session user;
      // only the merchant can sign txs from merchantWalletAddress.
      const [intent] = await db
        .insert(txIntents)
        .values({
          userId: payment.merchantId,
          type: "refund",
          payload,
          status: "pending",
          expiresAt: new Date(now.getTime() + TX_INTENT_TTL_MS),
        })
        .returning();

      await db
        .update(refundRequests)
        .set({
          status: "approved_pending_signature",
          reviewedAt: now,
          reviewedBy: auth.userId,
          approvedBy: auth.userId,
          approvedAt: now,
          txIntentId: intent.id,
        })
        .where(eq(refundRequests.id, id));

      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.REFUND_REQUEST_APPROVED,
        { refundId: id, txIntentId: intent.id },
        ip,
      );
      return ok({ ok: true, txIntentId: intent.id });
    }

    if (action === "reject") {
      const policy = canRejectRefund({ status: refund.status });
      if (!policy.allowed) {
        logSecurityEvent({
          actor,
          action: "reject_refund",
          result: "denied_policy",
          reason: policy.reason,
          ip,
          path: req.nextUrl.pathname,
        });
        throw new ValidationError(policy.reason);
      }
      await db
        .update(refundRequests)
        .set({ status: "rejected", reviewedAt: now, reviewedBy: auth.userId })
        .where(eq(refundRequests.id, id));

      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.REFUND_REQUEST_REJECTED,
        { refundId: id },
        ip,
      );
      return ok({ ok: true });
    }

    if (action === "mark_executed") {
      const policy = canExecuteRefund({ status: refund.status });
      if (!policy.allowed) {
        logSecurityEvent({
          actor,
          action: "execute_refund",
          result: "denied_policy",
          reason: policy.reason,
          ip,
          path: req.nextUrl.pathname,
        });
        throw new ValidationError(policy.reason);
      }
      if (!txHash || typeof txHash !== "string" || !isHex(txHash)) {
        throw new ValidationError(
          "txHash is required and must be a valid hex hash",
        );
      }

      // If the refund has a linked tx intent that is already confirmed with a
      // matching txHash, the tx was already verified on-chain by the intent
      // confirmation flow — skip redundant RPC verification.
      let alreadyVerified = false;
      if (refund.txIntentId) {
        const [intent] = await db
          .select()
          .from(txIntents)
          .where(eq(txIntents.id, refund.txIntentId))
          .limit(1);

        if (
          intent &&
          intent.status === "confirmed" &&
          intent.txHash === txHash
        ) {
          alreadyVerified = true;
        }
      }

      if (!alreadyVerified) {
        // Fetch the original payment to get chain info and build expected values
        const [payment] = await db
          .select()
          .from(paymentRequests)
          .where(eq(paymentRequests.id, refund.paymentRequestId))
          .limit(1);

        if (!payment)
          throw new NotFoundError("original payment request not found");

        // Verify the tx on-chain: must be a transfer from merchant to refund destination.
        // Retry up to 3 times for transient RPC errors (node lag, rate limits).
        let verified;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            verified = await verifyTransaction(txHash as Hex, {
              chainId: payment.chainId,
              from: payment.merchantWalletAddress,
              to: refund.destinationAddress,
              tokenAddress: payment.tokenAddress || undefined,
            });
            break;
          } catch (err) {
            if (err instanceof TxVerificationError) {
              throw new ValidationError(
                `Refund tx verification failed: ${err.message}`,
              );
            }
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 2_000));
              continue;
            }
            throw new ValidationError(
              "Refund transaction not found on-chain — RPC may be temporarily unavailable",
            );
          }
        }

        if (!verified || verified.status !== "confirmed") {
          throw new ValidationError(
            "Refund transaction has not been confirmed on-chain",
          );
        }
      }

      await db
        .update(refundRequests)
        .set({ status: "executed", txHash })
        .where(eq(refundRequests.id, id));

      writeAuditLog(
        business.businessId,
        auth.userId,
        AUDIT_ACTIONS.REFUND_REQUEST_EXECUTED,
        { refundId: id, txHash },
        ip,
      );
      return ok({ ok: true });
    }

    throw new ValidationError("invalid action");
  },
);
