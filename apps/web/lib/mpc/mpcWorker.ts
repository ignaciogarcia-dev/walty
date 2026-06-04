// apps/web/lib/mpc/mpcWorker.ts
//
// Web Worker entry that hosts an MpcDeviceParty, inits the DKLS23 WASM off the
// main thread, and relays round bundles over postMessage. This keeps the heavy
// WASM (init + keygen/sign/refresh CPU) off the UI thread.
//
// Protocol (main thread <-> worker), all messages carry a numeric `id` so the
// caller can correlate replies:
//
//   → { id, type: "init", wasmUrl? }
//   ← { id, type: "ready" }
//
//   → { id, type: "start", ceremony: "dkg" }
//   → { id, type: "start", ceremony: "refresh", deviceShareBytes, backupShareBytes }
//   → { id, type: "start", ceremony: "sign", deviceShareBytes, hash }
//   ← { id, type: "outbound", outboundBundle }
//
//   → { id, type: "round", serverBundle }
//   ← { id, type: "outbound", outboundBundle }                 (not done)
//   ← { id, type: "result", outboundBundle, result }           (done)
//
//   ← { id, type: "error", error }                             (on any failure)
//
// Share bytes cross the boundary as Uint8Array (structured-clone). The worker
// never logs payloads or share bytes.
//
// NOTE: under Next/Turbopack instantiate this with
//   new Worker(new URL("./mpcWorker.ts", import.meta.url), { type: "module" })
// so the bundler emits the worker chunk and its wasm asset. See the device
// spike (scripts/mpc-device-spike) for the validated esbuild equivalent.

import {
  MpcDeviceParty,
  initMpcWasm,
  type DkgResult,
  type RefreshResult,
  type SignResult,
} from "./MpcDeviceParty"

type InMsg =
  | { id: number; type: "init"; wasmUrl?: string }
  | { id: number; type: "start"; ceremony: "dkg" }
  | {
      id: number
      type: "start"
      ceremony: "refresh"
      deviceShareBytes: Uint8Array
      backupShareBytes: Uint8Array
    }
  | {
      id: number
      type: "start"
      ceremony: "sign"
      deviceShareBytes: Uint8Array
      hash: Uint8Array
    }
  | { id: number; type: "round"; serverBundle: string }
  | { id: number; type: "free" }

type OutMsg =
  | { id: number; type: "ready" }
  | { id: number; type: "outbound"; outboundBundle: string }
  | {
      id: number
      type: "result"
      outboundBundle: string
      result: DkgResult | RefreshResult | SignResult
    }
  | { id: number; type: "error"; error: string }

// Single in-flight party per worker.
let party: MpcDeviceParty | null = null

function post(msg: OutMsg): void {
  ;(self as unknown as Worker).postMessage(msg)
}

async function handle(msg: InMsg): Promise<void> {
  switch (msg.type) {
    case "init": {
      await initMpcWasm(msg.wasmUrl)
      post({ id: msg.id, type: "ready" })
      return
    }

    case "start": {
      party = new MpcDeviceParty()
      let outboundBundle: string
      if (msg.ceremony === "dkg") {
        outboundBundle = party.startDkg()
      } else if (msg.ceremony === "refresh") {
        outboundBundle = party.startRefresh(msg.deviceShareBytes, msg.backupShareBytes)
      } else {
        outboundBundle = party.startSign(msg.deviceShareBytes, msg.hash)
      }
      post({ id: msg.id, type: "outbound", outboundBundle })
      return
    }

    case "round": {
      if (!party) throw new Error("mpcWorker: no ceremony started")
      const step = party.handleServerBundle(msg.serverBundle)
      if (step.done) {
        party = null
        post({
          id: msg.id,
          type: "result",
          outboundBundle: step.outboundBundle,
          result: step.result!,
        })
      } else {
        post({ id: msg.id, type: "outbound", outboundBundle: step.outboundBundle })
      }
      return
    }

    case "free": {
      party?.free()
      party = null
      post({ id: msg.id, type: "ready" })
      return
    }
  }
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data
  handle(msg).catch((err: unknown) => {
    post({
      id: msg.id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    })
  })
}
