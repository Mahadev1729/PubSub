# PubSub assignment

Backend: Express + MongoDB. Jobs have `state` in `PENDING`, `UPLOADED`, `VERIFIED`, `PROCESSING`, `COMPLETED`. A poller reads new/updated documents (no Change Streams). An in-memory dispatcher fans out to SSE subscribers (`stateChange` or `transition` filters). Slow clients get bounded queues and `dropped` events.

## Setup

- Node 18+
- MongoDB (local URI or Atlas)

```bash
npm install
cp server/.env.example server/.env
```

Edit `server/.env`: set `MONGODB_URI` or `MONGODB_ATLAS_HOST` + `MONGODB_ATLAS_USER` + `MONGODB_ATLAS_PASSWORD` + `MONGODB_DBNAME`.

## Run

```bash
npm run dev -w server
npm run dev -w client
```

UI: `http://localhost:5173`. API: `http://localhost:4000`.

## API

- `GET /api/health`
- `GET /api/jobs` — list
- `POST /api/jobs` — body `{ "name": "..." }`
- `POST /api/jobs/:id/state` — body `{ "to": "UPLOADED" }` (any allowed state)
- `GET /api/subscribe?kind=stateChange`
- `GET /api/subscribe?kind=transition&from=PENDING&to=UPLOADED`

## Load / report

```bash
npm run perf -w server
npm run bench:subs -w server
```

Fill numbers into `PERFORMANCE_REPORT.md`.
