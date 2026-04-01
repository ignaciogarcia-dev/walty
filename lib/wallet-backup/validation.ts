const BACKUP_FIELDS = [
  "encryptedSeed",
  "seedIv",
  "encryptedDK",
  "dkIv",
  "salt",
  "version",
] as const

export function validateBackup(data: unknown): void {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid backup")
  }

  const record = data as Record<string, unknown>

  for (const key of BACKUP_FIELDS) {
    if (key !== "version") {
      const value = record[key]
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Invalid ${key}`)
      }
    }
  }

  if (record.version !== 3) {
    throw new Error("Invalid version")
  }
}
