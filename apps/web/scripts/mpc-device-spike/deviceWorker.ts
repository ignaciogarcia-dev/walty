// apps/web/scripts/mpc-device-spike/deviceWorker.ts
//
// Spike worker entry: hosts the PRODUCTION MpcDeviceParty + mpcWorker protocol
// by re-exporting the real worker logic. We import the production worker module
// directly so the test exercises the SAME code path as the app.
//
// (We can't import lib/mpc/mpcWorker.ts as the worker entry and ALSO add spike
//  glue, so this thin wrapper re-implements the same postMessage protocol by
//  delegating to MpcDeviceParty + initMpcWasm — identical to mpcWorker.ts.)

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
