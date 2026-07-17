# Walty POS reference client

A minimal, zero-dependency Node client that a POS terminal (e.g. a Raspberry Pi)
can use to take payments through the Walty API. It signs every request with the
terminal's Ed25519 private key. Use it as the starting point for your own
firmware.

## Setup

1. In the Walty dashboard, open **POS → Add POS**. The owner unlocks their wallet
   (this derives the terminal's own child wallet) and the browser generates an
   Ed25519 keypair. The **private key is shown only once**.
2. Copy the config it gives you into `pos.json` next to this script:

   ```json
   {
     "posId": 12,
     "apiBaseUrl": "https://api.walty.io",
     "webBaseUrl": "https://www.walty.io",
     "privateKey": "<32-byte hex private key>"
   }
   ```

   (Or provide `POS_ID`, `API_BASE_URL`, `WEB_BASE_URL`, `POS_PRIVATE_KEY` as
   environment variables.) Keep `pos.json` secret — anyone with it can create
   charges for this terminal.

   `webBaseUrl` is optional: it's the customer-facing origin that serves the
   `/pay/<id>` page. Set it when the API and web app are on separate hosts (the
   usual production setup — `api.walty.io` vs `www.walty.io`). If omitted, the
   pay link is derived from `apiBaseUrl`, which only works when both share a
   host (e.g. local dev).

## Run

```bash
node pos-client.mjs charge 10.00            # create a $10 USDC charge, poll until paid
node pos-client.mjs cancel <paymentRequestId>
node pos-client.mjs refund <paymentRequestId> <destinationAddress> "customer returned item"
```

Requires Node 18+ (uses the built-in `fetch` and `node:crypto`).

## What the terminal can and cannot do

- **Can:** create charges to its own wallet, cancel its own pending charges,
  request refunds for its own charges.
- **Cannot:** move funds, sign on-chain transactions, or touch other terminals.
  The terminal's wallet is custodied by the business owner's MPC key; the owner
  sweeps and approves refunds from the dashboard.

## Signature contract

See [`../../docs/pos-signature-contract.md`](../../docs/pos-signature-contract.md)
for the exact bytes to sign and headers to send, if you are re-implementing this
in another language.
