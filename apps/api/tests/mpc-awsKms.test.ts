// apps/api/tests/mpc-awsKms.test.ts
import { describe, it, expect, afterEach } from "vitest"
import { randomBytes, createCipheriv, createDecipheriv } from "crypto"
import { EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms"

import { AwsKms, type KmsSendClient } from "../src/services/mpc/awsKms.js"

// A stand-in for KMSClient that performs real AES-256-GCM under a local KEK and
// binds the EncryptionContext as AAD — so it enforces the same context-binding
// guarantee KMS does. No network, no credentials. Output blob = [nonce|ct|tag].
class FakeKmsClient {
  private readonly kek = randomBytes(32)

  private aad(ec: Record<string, string> | undefined): Buffer {
    const entries = Object.entries(ec ?? {}).sort(([a], [b]) => a.localeCompare(b))
    return Buffer.from(entries.map(([k, v]) => `${k}=${v}`).join("|"))
  }

  async send(command: EncryptCommand | DecryptCommand): Promise<unknown> {
    if (command instanceof EncryptCommand) {
      const { Plaintext, EncryptionContext } = command.input
      const nonce = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", this.kek, nonce)
      cipher.setAAD(this.aad(EncryptionContext))
      const ct = Buffer.concat([cipher.update(Buffer.from(Plaintext as Uint8Array)), cipher.final()])
      const tag = cipher.getAuthTag()
      return { CiphertextBlob: Buffer.concat([nonce, ct, tag]) }
    }
    if (command instanceof DecryptCommand) {
      const { CiphertextBlob, EncryptionContext } = command.input
      const blob = Buffer.from(CiphertextBlob as Uint8Array)
      const nonce = blob.subarray(0, 12)
      const tag = blob.subarray(blob.length - 16)
      const ct = blob.subarray(12, blob.length - 16)
      const decipher = createDecipheriv("aes-256-gcm", this.kek, nonce)
      decipher.setAAD(this.aad(EncryptionContext))
      decipher.setAuthTag(tag)
      // Throws on EncryptionContext / ciphertext mismatch, mirroring KMS.
      return { Plaintext: Buffer.concat([decipher.update(ct), decipher.final()]) }
    }
    throw new Error("FakeKmsClient: unexpected command")
  }
}

function makeKms(): AwsKms {
  return new AwsKms("alias/test-key", new FakeKmsClient() as unknown as KmsSendClient)
}

const ctx = { keyId: "key-abc-123", version: 1 }

describe("AwsKms", () => {
  it("round-trips a 32-byte DEK", async () => {
    const kms = makeKms()
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek, ctx)
    const unwrapped = await kms.unwrapDek(wrapped, ctx)
    expect(unwrapped).toEqual(dek)
  })

  it("fails to unwrap under a different version (EncryptionContext mismatch)", async () => {
    const kms = makeKms()
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek, ctx)
    await expect(kms.unwrapDek(wrapped, { ...ctx, version: 2 })).rejects.toThrow()
  })

  it("fails to unwrap under a different keyId (EncryptionContext mismatch)", async () => {
    const kms = makeKms()
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek, ctx)
    await expect(kms.unwrapDek(wrapped, { ...ctx, keyId: "key-evil" })).rejects.toThrow()
  })

  it("fails to unwrap a tampered blob", async () => {
    const kms = makeKms()
    const dek = randomBytes(32)
    const wrapped = await kms.wrapDek(dek, ctx)
    wrapped[20] ^= 0xff
    await expect(kms.unwrapDek(wrapped, ctx)).rejects.toThrow()
  })

  it("throws when constructed without a keyId", () => {
    expect(() => new AwsKms("", new FakeKmsClient() as unknown as KmsSendClient)).toThrow(/keyId/)
  })

  it("throws when KMS returns no CiphertextBlob", async () => {
    const emptyClient = { send: async () => ({}) } as unknown as KmsSendClient
    const kms = new AwsKms("alias/test-key", emptyClient)
    await expect(kms.wrapDek(randomBytes(32), ctx)).rejects.toThrow(/CiphertextBlob/)
  })
})

describe("getKms provider selection", () => {
  const saved = { ...process.env }

  afterEach(async () => {
    process.env = { ...saved }
    const { _resetKmsInstance } = await import("../src/services/mpc/kms.js")
    _resetKmsInstance()
  })

  it("selects AwsKms when MPC_KMS_PROVIDER=aws", async () => {
    process.env.MPC_KMS_PROVIDER = "aws"
    process.env.MPC_KMS_AWS_KEY_ID = "alias/walty-mpc-shares"
    const { getKms, _resetKmsInstance } = await import("../src/services/mpc/kms.js")
    _resetKmsInstance()
    expect(getKms()).toBeInstanceOf(AwsKms)
  })

  it("throws when MPC_KMS_PROVIDER=aws but key id is missing", async () => {
    process.env.MPC_KMS_PROVIDER = "aws"
    delete process.env.MPC_KMS_AWS_KEY_ID
    const { getKms, _resetKmsInstance } = await import("../src/services/mpc/kms.js")
    _resetKmsInstance()
    expect(() => getKms()).toThrow(/MPC_KMS_AWS_KEY_ID/)
  })

  it("throws on an unsupported provider", async () => {
    process.env.MPC_KMS_PROVIDER = "azure"
    const { getKms, _resetKmsInstance } = await import("../src/services/mpc/kms.js")
    _resetKmsInstance()
    expect(() => getKms()).toThrow(/not supported/)
  })
})
