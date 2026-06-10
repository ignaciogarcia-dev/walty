// The signer registry decides which signer signs every outgoing tx. A wrong
// dispatch here would route signing to the wrong backend, so the default,
// registration, activation guard, and lookup are all pinned. Module state is
// process-global, so each test re-imports a fresh module via resetModules.

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Signer } from "./types"

// getSigner only reads the WalletClient to hand it to a factory; the built-in
// web factory wraps it without calling it, so an empty stand-in is enough.
const fakeWalletClient = {} as never

describe("signer-registry", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("defaults to the web signer", async () => {
    const reg = await import("./signer-registry")
    expect(reg.getActiveSignerType()).toBe("web")
    expect(reg.getSigner(fakeWalletClient).type).toBe("web")
  })

  it("registers and activates a custom signer", async () => {
    const reg = await import("./signer-registry")
    const custom: Signer = { type: "external", signTransaction: vi.fn() }
    reg.registerSigner("external", () => custom)
    reg.setActiveSigner("external")

    expect(reg.getActiveSignerType()).toBe("external")
    expect(reg.getSigner(fakeWalletClient)).toBe(custom)
  })

  it("throws when activating an unregistered signer type", async () => {
    const reg = await import("./signer-registry")
    expect(() => reg.setActiveSigner("external")).toThrow(/No signer registered/)
  })

  it("keeps web active after a failed activation", async () => {
    const reg = await import("./signer-registry")
    expect(() => reg.setActiveSigner("external")).toThrow()
    expect(reg.getActiveSignerType()).toBe("web")
    expect(reg.getSigner(fakeWalletClient).type).toBe("web")
  })
})
