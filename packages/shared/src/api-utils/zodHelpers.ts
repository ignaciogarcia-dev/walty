import { z } from "zod"

// Shared Zod primitives for request-boundary schemas. Structural format only —
// checksum/registry/semantic checks live in the domain helpers that run after.

/** 0x-prefixed 20-byte EVM address (case-insensitive, no checksum check). */
export const evmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid address")

/** 0x-prefixed even-length hex blob (e.g. a signed tx or a tx hash). */
export const hexString = z
  .string()
  .regex(/^0x([0-9a-fA-F]{2})+$/, "Invalid hex")
