# PostSwitch — ACI Postilion-style Payments Platform

A full-stack, runnable clone of an ACI **Postilion** payments environment, built from the
*Payments Basic Training* material. It is a real switch, not a mock-up:

- **Realtime** — Transaction Manager: SAPs, interchanges, schemes, source/sink nodes, routing,
  authorization, batch/business date, monitor, transaction query.
- **PostCard** — full card configuration: card products, customers, accounts, cards (Card 360),
  validation services, velocity limits, risk conditions, PIN verification & card actions.
- **Office** — normalization, reconciliation (4 categories), reports.
- **ATM Driving** — AtmApp loads, terminals monitor, and an interactive ATM simulator.

Every transaction is a genuine **ISO 8583** message (MTI, primary/secondary bitmaps, field
encode/decode) processed by the backend switch and persisted in SQLite.

## Architecture

```
client/   React + Vite single-page app (ACI-style console)  ──HTTP/WS──►  server/
server/   Node + Express REST API + WebSocket live feed
          ├─ iso8583.js   ISO 8583 engine
          ├─ switch.js    Transaction Manager (routing, auth, batch, stand-in)
          ├─ db.js        SQLite (node:sqlite, file-backed, persists)
          └─ api.js       REST: config CRUD, cards, transactions, office, monitor
```

No native dependencies: persistence uses Node 22's built-in `node:sqlite`.

## Run with Docker (recommended)

```bash
docker compose up --build
```

Open **http://localhost:4000**. The SQLite database is persisted in `server/data/`.

## Run locally for development (two terminals)

```bash
# terminal 1 — backend API on :4000
cd server && npm install && npm run dev

# terminal 2 — Vite dev server on :5173 (proxies /api and /ws to :4000)
cd client && npm install && npm run dev
```

Open **http://localhost:5173**. Requires Node 22+ (for `node:sqlite`).

## Run backend tests

```bash
cd server && npm test     # ISO 8583 + switch authorization unit tests
```

## Reset / reseed the database

```bash
cd server && npm run seed   # wipes and reseeds the Blue Bank scenario
```

## Configure the simulated environment

Everything is editable from the UI (or the REST API):

| Console | Creates / edits |
|---|---|
| Configuration → SAPs | Service Access Points (comms endpoints) |
| Configuration → Interchanges | Logical connections to networks (scheme + SAP) |
| Configuration → Schemes | Card schemes / message formats |
| Configuration → Source/Sink Nodes | Switch nodes |
| Configuration → Routing | BIN/source/txn → sink node |
| Configuration → Card Acceptors / Terminals | Merchants & ATMs |
| PostCard → Card Products / Customers / Accounts / Cards | Card issuing config |
| PostCard → Velocity Limits / Risk Conditions | Validation & risk |

REST examples:

```bash
curl localhost:4000/api/saps
curl -X POST localhost:4000/api/routes -H 'content-type: application/json' \
  -d '{"id":"RT-X","route_type":"card-based","match_value":"627","sink_node_id":"SK-VISA","priority":40,"descr":"New BIN"}'
curl -X POST localhost:4000/api/txn/authorize -H 'content-type: application/json' \
  -d '{"pan":"5061004000000018","txnType":"WDL","amount":1000000,"terminal":"ATM00001","pin":"1234"}'
```

## Test cards (PINs visible under PostCard → Card 360)

| PAN | PIN | Product | Note |
|---|---|---|---|
| 5061004000000018 | 1234 | Verve Gold (on-us) | high balance |
| 5061004000000026 | 4321 | Verve Gold (on-us) | low balance → declines |
| 5061010000000019 | 2468 | Verve Classic (on-us) | |
| 5061010000000027 | 1111 | Verve Classic | HOTCARD → RC 43 |
| 4000123412341234 | 0000 | Visa (not-on-us) | routes to VisaNet, limits-based |
| 5412345678901234 | 0000 | Mastercard (not-on-us) | routes to MCNet |

Three wrong PINs auto-blocks the card (risk condition RK1).

## Hosting on GitHub

This is a normal git repo — push it as-is. To run it:

- **Anywhere with Docker**: `docker compose up --build` (one container, port 4000).
- **GitHub Codespaces**: open the repo in a Codespace and run the Docker command, or the two
  dev commands above; forward port 4000 (or 5173).
- Note: GitHub **Pages** only hosts static files and cannot run the Node backend. To deploy
  publicly, host the container on a service like Render, Railway, Fly.io, or any VM, or run the
  frontend on Pages/Vercel pointed at a hosted backend URL.

## What is real vs simulated

**Real:** ISO 8583 build/parse (MTI, bitmaps, fields), BIN→product matching, routing,
PIN/limit/velocity/hotcard/hold/balance authorization, response generation, SQLite
persistence, REST API, WebSocket live feed, normalization & reconciliation.

**Simulated:** cryptography (PIN blocks/HSM are described, not performed), remote network/issuer
hosts (stand-in only), and EMV scripting. This is a training/demonstration platform, not a
production switch.
