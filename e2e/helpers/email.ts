/** A unique throwaway email per test, so specs never collide on the shared DB. */
export function uniqueEmail(prefix = "e2e"): string {
  return `walty-${prefix}-${crypto.randomUUID()}@example.com`
}

export const E2E_PASSWORD = "testpassword1234"
