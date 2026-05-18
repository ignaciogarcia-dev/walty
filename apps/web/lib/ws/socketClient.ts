import { io, type Socket } from "socket.io-client"

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"

const sockets = new Map<string, Socket>()

/**
 * Returns a memoized socket.io client for a namespace. We share the same
 * connection across hooks that subscribe to different ids in the same
 * namespace so we don't open one TCP connection per QR scan.
 *
 * The api host is whatever NEXT_PUBLIC_API_BASE_URL points at — same as
 * the Next.js rewrite destination for HTTP. WS cannot proxy through Next
 * rewrites, so this URL must be reachable from the browser directly.
 */
export function getNamespaceSocket(namespace: string): Socket {
  const existing = sockets.get(namespace)
  if (existing) return existing

  const socket = io(`${API_BASE_URL}${namespace}`, {
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: true,
  })
  sockets.set(namespace, socket)
  return socket
}
