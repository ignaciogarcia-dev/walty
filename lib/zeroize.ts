/** Overwrite a buffer with zeros to minimize time sensitive data stays in memory. */
export function zeroize(buffer: Uint8Array) {
  buffer.fill(0)
}

/** Encode a string to Uint8Array, pass it to `fn`, then zeroize the buffer. */
export async function withZeroized<T>(
  text: string,
  fn: (bytes: Uint8Array) => T | Promise<T>,
): Promise<T> {
  const buf = new TextEncoder().encode(text)
  try {
    return await fn(buf)
  } finally {
    zeroize(buf)
  }
}
