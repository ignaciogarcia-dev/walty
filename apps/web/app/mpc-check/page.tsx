"use client"

// Dev-only validation that the MPC device worker + DKLS wasm load under Next's
// bundler (Turbopack). Init-only: no socket, no session — it just spawns the
// worker and confirms the wasm instantiates. Full DKG is covered by the
// integration test. Remove once (c) is wired.

import { useEffect, useState } from "react"
import { createMpcWorker, MPC_WASM_URL } from "@/lib/mpc/createMpcWorker"

export default function MpcCheckPage() {
  const [status, setStatus] = useState("starting worker…")

  useEffect(() => {
    let worker: Worker | null = null
    // Defer a tick so setState lands asynchronously (not synchronously in the effect).
    const id = setTimeout(() => {
      const t0 = performance.now()
      try {
        worker = createMpcWorker()
        worker.onmessage = (e: MessageEvent<{ type: string; error?: string }>) => {
          if (e.data.type === "ready") {
            setStatus(`OK — worker + wasm loaded in ${Math.round(performance.now() - t0)}ms`)
          } else if (e.data.type === "error") {
            setStatus(`ERROR: ${e.data.error}`)
          }
        }
        worker.onerror = (e) => setStatus(`WORKER ERROR: ${e.message}`)
        // Resolve to an absolute URL on the main thread — inside the worker a
        // root-relative path has no base to fetch against.
        const wasmUrl = new URL(MPC_WASM_URL, window.location.origin).href
        worker.postMessage({ id: 1, type: "init", wasmUrl })
      } catch (err) {
        setStatus(`SPAWN ERROR: ${err instanceof Error ? err.message : String(err)}`)
      }
    }, 0)
    return () => {
      clearTimeout(id)
      worker?.terminate()
    }
  }, [])

  return (
    <main style={{ padding: 32, fontFamily: "monospace" }}>
      <h1>MPC worker/wasm check</h1>
      <p data-testid="mpc-status">{status}</p>
    </main>
  )
}
