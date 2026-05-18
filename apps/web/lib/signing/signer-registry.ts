import type { Account, Chain, Transport, WalletClient } from "viem"
import type { Signer, SignerType } from "./types"
import { WebSigner } from "./web-signer"

type AccountWalletClient = WalletClient<Transport, Chain, Account>

type SignerFactory = (walletClient: AccountWalletClient) => Signer

const factories = new Map<SignerType, SignerFactory>()

// Register the built-in web signer
factories.set("web", (wc) => new WebSigner(wc))

/** Register a custom signer factory (e.g. for mobile, hardware wallet). */
export function registerSigner(type: SignerType, factory: SignerFactory): void {
  factories.set(type, factory)
}

/** The active signer type. Defaults to "web". */
let activeType: SignerType = "web"

/** Switch the active signer type for new transactions. */
export function setActiveSigner(type: SignerType): void {
  if (!factories.has(type)) {
    throw new Error(`No signer registered for type "${type}"`)
  }
  activeType = type
}

export function getActiveSignerType(): SignerType {
  return activeType
}

/**
 * Create a Signer using the active type.
 * Falls back to WebSigner if the active type has no factory.
 */
export function getSigner(walletClient: AccountWalletClient): Signer {
  const factory = factories.get(activeType) ?? factories.get("web")!
  return factory(walletClient)
}
