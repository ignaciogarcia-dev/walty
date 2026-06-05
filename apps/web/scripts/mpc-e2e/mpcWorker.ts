// apps/web/scripts/mpc-e2e/mpcWorker.ts
//
// Worker entry for the live e2e: a thin re-export of the PRODUCTION worker
// protocol (lib/mpc/mpcWorker.ts) so the test exercises the same MpcDeviceParty
// + bundle codec + WASM path the app uses. esbuild bundles this standalone and
// emits the _bg.wasm asset alongside; the production mpcClient's createWorker is
// overridden in page.ts to load this bundle.
//
// We delegate to MpcDeviceParty + initMpcWasm directly (identical to the
// production mpcWorker.ts) because the worker entry can't both BE the production
// module and add the esbuild-friendly relative import.

import {
  MpcDeviceParty,
  initMpcWasm,
  type DkgResult,
  type RefreshResult,
  type SignResult,
} from "../../lib/mpc/MpcDeviceParty"

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

let party: MpcDeviceParty | null = null

function post(msg: unknown): void {
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
      if (msg.ceremony === "dkg") outboundBundle = party.startDkg()
      else if (msg.ceremony === "refresh")
        outboundBundle = party.startRefresh(msg.deviceShareBytes, msg.backupShareBytes)
      else outboundBundle = party.startSign(msg.deviceShareBytes, msg.hash)
      post({ id: msg.id, type: "outbound", outboundBundle })
      return
    }
    case "round": {
      if (!party) throw new Error("no ceremony")
      const step = party.handleServerBundle(msg.serverBundle)
      if (step.done) {
        party = null
        post({
          id: msg.id,
          type: "result",
          outboundBundle: step.outboundBundle,
          result: step.result as DkgResult | RefreshResult | SignResult,
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
    post({ id: msg.id, type: "error", error: err instanceof Error ? err.message : String(err) })
  })
}
