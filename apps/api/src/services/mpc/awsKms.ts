// AWS KMS implementation of the Kms interface. Wraps/unwraps the per-share DEK
// by calling KMS Encrypt/Decrypt directly (the DEK is 32 bytes, well under the
// 4KB KMS plaintext limit, so no GenerateDataKey indirection is needed).
//
// The ctx {keyId, version} is passed as the KMS EncryptionContext — the cloud
// equivalent of LocalDevKms's AAD binding. A wrapped DEK can only be unwrapped
// with the exact same EncryptionContext, so a ciphertext bound to one
// keyId/version can't be decrypted under another.
//
// Auth/region come from the standard AWS provider chain (env, profile, or IAM
// role). The KMS key is referenced by MPC_KMS_AWS_KEY_ID (key ID, ARN, or alias).

import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms"
import type { Kms } from "./kms.js"

// Minimal surface of KMSClient we depend on — lets tests inject a fake client
// without real AWS calls or credentials.
export interface KmsSendClient {
  send(command: EncryptCommand): Promise<{ CiphertextBlob?: Uint8Array }>
  send(command: DecryptCommand): Promise<{ Plaintext?: Uint8Array }>
}

function encryptionContext(ctx: { keyId: string; version: number }): Record<string, string> {
  // EncryptionContext values must be strings.
  return { keyId: ctx.keyId, version: String(ctx.version) }
}

export class AwsKms implements Kms {
  private readonly keyId: string
  private readonly client: KmsSendClient

  constructor(keyId: string, client: KmsSendClient = new KMSClient({})) {
    if (!keyId) {
      throw new Error("AwsKms: keyId is required (set MPC_KMS_AWS_KEY_ID)")
    }
    this.keyId = keyId
    this.client = client
  }

  async wrapDek(dek: Buffer, ctx: { keyId: string; version: number }): Promise<Buffer> {
    const out = await this.client.send(
      new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: dek,
        EncryptionContext: encryptionContext(ctx),
      }),
    )
    if (!out.CiphertextBlob) {
      throw new Error("AwsKms: KMS Encrypt returned no CiphertextBlob")
    }
    return Buffer.from(out.CiphertextBlob)
  }

  async unwrapDek(wrappedDek: Buffer, ctx: { keyId: string; version: number }): Promise<Buffer> {
    // Pin KeyId so a ciphertext can only be decrypted under the configured key
    // (defends against a swapped/forged blob naming a different key).
    const out = await this.client.send(
      new DecryptCommand({
        KeyId: this.keyId,
        CiphertextBlob: wrappedDek,
        EncryptionContext: encryptionContext(ctx),
      }),
    )
    if (!out.Plaintext) {
      throw new Error("AwsKms: KMS Decrypt returned no Plaintext")
    }
    return Buffer.from(out.Plaintext)
  }
}
