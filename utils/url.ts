/** Truncates a URL for display, keeping the start and tail visible. */
export function truncateLink(url: string, startChars = 32, endChars = 6): string {
  if (url.length <= startChars + endChars + 1) return url
  return `${url.slice(0, startChars)}…${url.slice(-endChars)}`
}
