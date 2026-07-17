#!/usr/bin/env node
// Reference POS client for Walty. Runs on the Raspberry Pi (or any Node 18+
// runtime). Zero dependencies — uses only node:crypto. It signs each request to
// the Walty API with the terminal's Ed25519 private key.
//
// Config: a JSON file (default ./pos.json, or pass a path as env POS_CONFIG)
// shaped like the one the dashboard produces:
//   { "posId": 12, "apiBaseUrl": "http://localhost:4000", "privateKey": "<hex>" }
// Values can also come from env: POS_ID, API_BASE_URL, POS_PRIVATE_KEY.
//
// Optional `webBaseUrl` (env WEB_BASE_URL): the customer-facing web origin that
// serves the /pay/<id> page. Set it when the API and web app live on separate
// hosts (e.g. api.walty.io vs www.walty.io) — that page is served by the web
// app, not the API. If omitted it falls back to apiBaseUrl with any :port
// stripped, which is only correct for single-origin/local setups.
//
// Usage:
//   node pos-client.mjs charge <amountUsd> [token]   # create a charge, poll until paid
//   node pos-client.mjs cancel <paymentRequestId>
//   node pos-client.mjs refund <paymentRequestId> <destinationAddress> <reason>

import { readFileSync } from "node:fs"
import { createHash, createPrivateKey, randomBytes, sign } from "node:crypto"

// ----- config -----------------------------------------------------------------

function loadConfig() {
  const fromEnv = {
    posId: process.env.POS_ID ? Number(process.env.POS_ID) : undefined,
    apiBaseUrl: process.env.API_BASE_URL,
    webBaseUrl: process.env.WEB_BASE_URL,
    privateKey: process.env.POS_PRIVATE_KEY,
  }
  let fromFile = {}
  try {
    fromFile = JSON.parse(readFileSync(process.env.POS_CONFIG ?? "./pos.json", "utf8"))
  } catch {
    // env-only is fine
  }
  const cfg = { ...fromFile, ...Object.fromEntries(Object.entries(fromEnv).filter(([, v]) => v != null)) }
  if (!cfg.posId || !cfg.apiBaseUrl || !cfg.privateKey) {
    throw new Error("missing config: need posId, apiBaseUrl, privateKey (via pos.json or env)")
  }
  return cfg
}

// ----- signing ----------------------------------------------------------------

// DER PKCS8 prefix for a raw 32-byte Ed25519 seed. node:crypto needs a KeyObject.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex")

function privateKeyFromSeedHex(hex) {
  const seed = Buffer.from(hex, "hex")
  if (seed.length !== 32) throw new Error("privateKey must be a 32-byte hex seed")
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  })
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex")
}

// Canonical string the server rebuilds and verifies. Must match exactly:
//   METHOD \n path \n sha256hex(body) \n timestamp \n nonce
function buildSigningString({ method, path, bodyHashHex, timestamp, nonce }) {
  return [method.toUpperCase(), path, bodyHashHex, timestamp, nonce].join("\n")
}

async function signedFetch(cfg, method, path, body) {
  const key = privateKeyFromSeedHex(cfg.privateKey)
  const bodyStr = body ? JSON.stringify(body) : ""
  const timestamp = String(Date.now())
  const nonce = randomBytes(16).toString("hex")

  const message = buildSigningString({
    method,
    path,
    bodyHashHex: sha256Hex(Buffer.from(bodyStr, "utf8")),
    timestamp,
    nonce,
  })
  const signature = sign(null, Buffer.from(message, "utf8"), key).toString("hex")

  const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-pos-id": String(cfg.posId),
      "x-pos-timestamp": timestamp,
      "x-pos-nonce": nonce,
      "x-pos-signature": signature,
    },
    body: method === "GET" ? undefined : bodyStr,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`)
  }
  return json
}

// Status polling uses the PUBLIC endpoint — no signature needed.
async function pollStatus(cfg, id) {
  const res = await fetch(`${cfg.apiBaseUrl}/payment-requests/${id}`)
  if (!res.ok) throw new Error(`status ${res.status}`)
  return res.json()
}

// The /pay/<id> page is served by the web app. Prefer an explicit webBaseUrl;
// otherwise derive from apiBaseUrl (strip trailing :port) for single-origin
// setups where the API and web app share a host.
function payUrl(cfg, id) {
  const base = cfg.webBaseUrl ?? cfg.apiBaseUrl.replace(/:\d+$/, "")
  return `${base.replace(/\/$/, "")}/pay/${id}`
}

// ----- commands ---------------------------------------------------------------

async function cmdCharge(cfg, amountUsd, token = "USDC") {
  if (!amountUsd) throw new Error("usage: charge <amountUsd> [token]")
  const req = await signedFetch(cfg, "POST", "/pos/payment-requests", {
    amountUsd: String(amountUsd),
    token,
  })
  console.log(`charge created: id=${req.id} amount=$${amountUsd} ${token}`)
  console.log(`  show this to the customer to pay: ${payUrl(cfg, req.id)}`)
  console.log("polling for payment…")

  const deadline = Date.now() + 15 * 60_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    const status = await pollStatus(cfg, req.id)
    process.stdout.write(`  status: ${status.status}\r`)
    if (["paid", "expired", "cancelled"].includes(status.status)) {
      console.log(`\nfinal status: ${status.status}`)
      return
    }
  }
  console.log("\ntimed out waiting for payment")
}

async function cmdCancel(cfg, id) {
  if (!id) throw new Error("usage: cancel <paymentRequestId>")
  const out = await signedFetch(cfg, "PATCH", `/pos/payment-requests/${id}/cancel`)
  console.log("cancelled:", out.status ?? out)
}

async function cmdRefund(cfg, id, destination, reason) {
  if (!id || !destination || !reason) {
    throw new Error("usage: refund <paymentRequestId> <destinationAddress> <reason>")
  }
  const out = await signedFetch(cfg, "POST", "/pos/refund-requests", {
    paymentRequestId: id,
    destinationAddress: destination,
    reason,
  })
  console.log("refund requested (pending owner approval):", out.id)
}

// ----- main -------------------------------------------------------------------

async function main() {
  const [cmd, ...args] = process.argv.slice(2)
  const cfg = loadConfig()
  switch (cmd) {
    case "charge":
      return cmdCharge(cfg, args[0], args[1])
    case "cancel":
      return cmdCancel(cfg, args[0])
    case "refund":
      return cmdRefund(cfg, args[0], args[1], args.slice(2).join(" "))
    default:
      console.log("commands: charge <amountUsd> [token] | cancel <id> | refund <id> <dest> <reason>")
      process.exit(1)
  }
}

main().catch((e) => {
  console.error("error:", e.message)
  process.exit(1)
})
