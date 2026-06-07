import { getAddress, parseUnits, recoverAddress } from "viem"
import type { Token } from "@walty/shared/tokens/tokenRegistry"
import type { TxIntentPayload } from "@walty/shared/tx-intents/types"
import {
  getTxIntent,
  retryFailedTxIntent,
  signTxIntent,
} from "@/lib/tx-intents/client"
import { buildBaseTx } from "./build"
import { prepareTx } from "./prepare"
import { signHashForTx, assembleSignedTx } from "./mpcTx"
import { getMpcClient } from "@/lib/mpc/getMpcClient"
import type { MpcSecurityManager } from "@/lib/mpc/MpcSecurityManager"

/**
 * MPC counterpart of signIntent: fetch/retry the intent, build the same unsigned
 * EIP-1559 tx, then sign its hash via a device(0)+server(1) ceremony instead of a
 * local key, assemble the raw tx, and upload it. The device share (loaded under
 * the PIN by `mpcSecurity`) never leaves the worker; only the 32-byte hash is
 * sent to the server, so device and server provably sign the same bytes.
 *
 * Owner-only: operators (HD-derived from a mnemonic) don't exist under MPC, so
 * there is no derivationIndex here.
 */
export async function signIntentMpc(
  intentId: string,
  mpcSecurity: MpcSecurityManager,
  derivationIndex = 0,
): Promise<{ token: Token; payload: TxIntentPayload }> {
  let intent = await getTxIntent(intentId)
  if (intent.status === "failed") {
    intent = await retryFailedTxIntent(intentId)
  }

  const { payload } = intent
  const { to, amount, chainId, token: intentToken, from: fromPayload } = payload
  const from = getAddress(fromPayload)

  const token: Token = {
    symbol: intentToken.symbol,
    address: intentToken.address as `0x${string}` | null,
    type: intentToken.type,
    decimals: intentToken.decimals,
    name: intentToken.symbol,
    chainId,
    coingeckoId: "",
  }

  const signedRaw = await mpcSecurity.withDeviceShare(async ({ shareBytes, meta }) => {
    // The owner (master, index 0) signs from its own address. A cashier tx
    // (derivationIndex>=1) signs from the HD child address m/index, which the
    // device share meta doesn't carry — the recoverAddress check below verifies
    // the signature recovers `from` instead.
    if (derivationIndex === 0 && getAddress(meta.address) !== from) {
      throw new Error(
        "The unlocked wallet does not match the account that must sign this transaction",
      )
    }

    const base = buildBaseTx({ token, to, amount, chainId })
    const unsigned = await prepareTx(
      base,
      from,
      token.type === "erc20" && token.address
        ? {
            address: token.address as `0x${string}`,
            decimals: token.decimals,
            amount: parseUnits(amount, token.decimals),
          }
        : undefined,
    )

    const signHash = signHashForTx(unsigned)

    const client = getMpcClient()
    try {
      await client.connect()
      const { serverSignature } = await client.runSign(
        meta.keyId,
        shareBytes,
        signHash,
        derivationIndex,
      )
      if (!serverSignature) {
        throw new Error("MPC ceremony returned no signature")
      }
      // Defense-in-depth: the signature must recover the signing address before broadcast.
      const recovered = await recoverAddress({ hash: signHash, signature: serverSignature })
      if (getAddress(recovered) !== from) {
        throw new Error("MPC signature does not recover the signing address")
      }
      return assembleSignedTx(unsigned, serverSignature)
    } finally {
      await client.close()
    }
  })

  await signTxIntent(intentId, signedRaw)
  return { token, payload }
}
