import { describe, it, expect } from "vitest"
import { validateBackup } from "../../../../lib/wallet-backup/validation"
const VALID_BACKUP = {
  encryptedSeed: "base64data",
  seedIv: "base64iv",
  encryptedDK: "base64dk",
  dkIv: "base64dkiv",
  salt: "base64salt",
  version: 3,
}

describe("validateBackup", () => {
  it("accepts valid V3 backup", () => {
    expect(() => validateBackup(VALID_BACKUP)).not.toThrow()
  })

  it("rejects valid V4 backup", () => {
    expect(() => validateBackup({ ...VALID_BACKUP, version: 4 })).toThrow(
      "Invalid version",
    )
  })

  it("rejects null", () => {
    expect(() => validateBackup(null)).toThrow("Invalid backup")
  })

  it("rejects non-object", () => {
    expect(() => validateBackup("string")).toThrow("Invalid backup")
  })

  it("rejects missing encryptedSeed", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { encryptedSeed: _encryptedSeed, ...rest } = VALID_BACKUP
    expect(() => validateBackup(rest)).toThrow("Invalid encryptedSeed")
  })

  it("rejects missing salt", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { salt: _salt, ...rest } = VALID_BACKUP
    expect(() => validateBackup(rest)).toThrow("Invalid salt")
  })

  it("rejects invalid version", () => {
    expect(() => validateBackup({ ...VALID_BACKUP, version: 2 })).toThrow(
      "Invalid version",
    )
  })

  it("rejects version 1", () => {
    expect(() => validateBackup({ ...VALID_BACKUP, version: 1 })).toThrow(
      "Invalid version",
    )
  })
})
