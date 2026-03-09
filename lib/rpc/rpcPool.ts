// Future RPC health scoring stub
//
// Structure for prioritizing RPCs by latency / failure rate:
//
// type RpcHealth = {
//   url: string
//   latency: number
//   failures: number
//   lastCheck: number
// }
//
// Allows dynamically reordering rpcUrls[] without restarting clients.
// Placeholder — implement when multi-RPC monitoring is needed.

export {}
