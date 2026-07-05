# POS request signature contract

A POS terminal (e.g. a Raspberry Pi) authenticates to the Walty API by signing
every request with an **Ed25519** private key. The server stores only the public
key (generated in the dashboard when the POS is created; the private key never
leaves the device). This document is the exact contract, so the client can be
implemented in any language.

## Overview

- Algorithm: **Ed25519** (RFC 8032). Signature is 64 bytes, sent as hex.
- Private key: a raw **32-byte seed** (hex). Public key: raw 32-byte (hex).
- Every request carries four headers; the server rebuilds the signed string and
  verifies it against the stored public key.

## Headers

| Header             | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| `X-POS-Id`         | The POS device id (integer, from the dashboard).             |
| `X-POS-Timestamp`  | Current time in **Unix milliseconds**, as a string.          |
| `X-POS-Nonce`      | A unique random value per request (e.g. 16 random bytes hex).|
| `X-POS-Signature`  | Ed25519 signature over the canonical string, hex-encoded.    |

## Canonical string to sign

Join these five fields with a single `\n` (newline, `0x0A`) between them:

```
<METHOD>\n<PATH>\n<SHA256_HEX(body)>\n<TIMESTAMP>\n<NONCE>
```

- `METHOD` — HTTP method, uppercase (`POST`, `PATCH`, …).
- `PATH` — request pathname, no query string (e.g. `/pos/payment-requests`).
- `SHA256_HEX(body)` — lowercase hex SHA-256 of the **exact request body bytes**.
  For an empty body (no body / GET), hash the empty byte string.
- `TIMESTAMP` — same value as `X-POS-Timestamp`.
- `NONCE` — same value as `X-POS-Nonce`.

Sign the UTF-8 bytes of that string.

## Server-side checks (why a request can 401)

1. All four headers present; `X-POS-Id` resolves to a non-revoked device.
2. `|now - timestamp| ≤ 60_000 ms` (clock-skew / replay window).
3. Signature verifies against the device's stored public key.
4. Nonce is unique per device within the window (replays are rejected).

On the first valid request, a `pending` device becomes `active` ("linked").

## Endpoints

| Method + path                           | Purpose                                  |
| --------------------------------------- | ---------------------------------------- |
| `POST /pos/payment-requests`            | Create a charge (`{ amountUsd, token }`).|
| `PATCH /pos/payment-requests/:id/cancel`| Cancel own pending charge.               |
| `POST /pos/refund-requests`             | Request a refund for own charge.         |

Payment status is read from the **public** endpoint `GET /payment-requests/:id`
(no signature required).

## Reference implementation

See [`examples/pos-client/pos-client.mjs`](../examples/pos-client/pos-client.mjs)
— a zero-dependency Node client (uses `node:crypto`).
