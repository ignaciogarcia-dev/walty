export function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function truncateHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}
