// Unit tests for MpcSecurityManager: PIN gating, callback wiring, and that the
// device-share bytes are zeroized after use. The storage/crypto layer
// (deviceShareStore) is mocked so this stays a focused unit test.

import { describe, it, expect, vi, beforeEach } from "vitest"
import { MpcSecurityManager } from "./MpcSecurityManager"
import type { DeviceShareMeta } from "./deviceShareStore"

vi.mock("./deviceShareStore", () => ({
  loadDeviceShare: vi.fn(),
}))

import { loadDeviceShare } from "./deviceShareStore"

const META: DeviceShareMeta = {
  keyId: "11111111-1111-4111-8111-111111111111",
  pubkey: "0xpub",
  address: "0xabc0000000000000000000000000000000000000",
}

function ref<T>(v: T): React.MutableRefObject<T> {
  return { current: v }
}

function manager(pin: string | null) {
  return new MpcSecurityManager(ref<string | null>(pin), ref(0))
}

describe("MpcSecurityManager", () => {
  beforeEach(() => {
    vi.mocked(loadDeviceShare).mockReset()
  })

  it("throws 'Wallet locked' when no PIN is set", async () => {
    const m = manager(null)
    await expect(m.withDeviceShare(async () => 1)).rejects.toThrow("Wallet locked")
    expect(loadDeviceShare).not.toHaveBeenCalled()
  })

  it("throws 'No device share found' when nothing is stored", async () => {
    vi.mocked(loadDeviceShare).mockResolvedValue(null)
    const m = manager("123456")
    await expect(m.withDeviceShare(async () => 1)).rejects.toThrow(
      "No device share found",
    )
  })

  it("passes the share + meta to the callback and returns its result", async () => {
    const shareBytes = new Uint8Array([1, 2, 3, 4])
    vi.mocked(loadDeviceShare).mockResolvedValue({ shareBytes, meta: META })
    const m = manager("123456")

    const seen: { keyId: string; len: number } = await m.withDeviceShare(
      async ({ shareBytes, meta }) => ({ keyId: meta.keyId, len: shareBytes.length }),
    )

    expect(loadDeviceShare).toHaveBeenCalledWith("123456")
    expect(seen).toEqual({ keyId: META.keyId, len: 4 })
  })

  it("zeroizes the share bytes after the callback (even though fn read them)", async () => {
    const shareBytes = new Uint8Array([9, 8, 7, 6])
    vi.mocked(loadDeviceShare).mockResolvedValue({ shareBytes, meta: META })
    const m = manager("123456")

    await m.withDeviceShare(async ({ shareBytes }) => {
      // bytes are still live inside the callback
      expect(Array.from(shareBytes)).toEqual([9, 8, 7, 6])
    })

    // and zeroized once the callback returns
    expect(Array.from(shareBytes)).toEqual([0, 0, 0, 0])
  })

  it("still zeroizes the share bytes when the callback throws", async () => {
    const shareBytes = new Uint8Array([5, 5, 5])
    vi.mocked(loadDeviceShare).mockResolvedValue({ shareBytes, meta: META })
    const m = manager("123456")

    await expect(
      m.withDeviceShare(async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(Array.from(shareBytes)).toEqual([0, 0, 0])
  })
})
