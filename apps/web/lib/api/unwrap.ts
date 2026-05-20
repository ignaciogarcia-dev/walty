/**
 * The API returns bare JSON bodies; some legacy proxy paths wrapped them in
 * `{ data }`. Unwrap defensively so callers work regardless of the envelope.
 */
export function unwrap<T>(json: unknown): T {
  return json && typeof json === "object" && "data" in (json as object)
    ? ((json as { data: T }).data)
    : (json as T)
}
