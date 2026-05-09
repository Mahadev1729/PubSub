# Custom Pub-Sub Dispatcher (MongoDB Polling)

This repository implements the assignment in `UVCE_BTech_VISIST.AI_Assignment_2026.pdf`:

- MongoDB collection with a `state` field in **5 states**: `PENDING`, `UPLOADED`, `VERIFIED`, `PROCESSING`, `COMPLETED`
- Detect `state` changes **without** MongoDB Change Streams or Triggers (custom polling / tailing)
- Build an **in-memory Dispatcher** that supports:
  - **State-change subscriptions** (notify on any update of `state`)
  - **Transition subscriptions** (notify only when `from -> to` matches)
- Support **fan-out** (one change notifies multiple subscribers concurrently)
- Handle **backpressure** (slow subscribers don't block the dispatcher forever)
- Provide scripts + template for a **performance report**

## Architecture (high level)

### Components

- **MongoDB**: stores `jobs` documents.
- **Poller** (`server/src/poller/MongoStatePoller.js`):
  - Periodically queries MongoDB for documents updated after a persisted checkpoint.
  - The checkpoint is `(updatedAt, _id)` and is stored in `checkpoints` collection so a restart can resume without missing events.
- **Dispatcher** (`server/src/dispatcher/Dispatcher.js`):
  - Holds in-memory subscriptions.
  - Matches each transition against subscription filters.
  - Implements per-subscriber bounded queues to avoid unbounded memory growth.
- **Clients**:
  - React UI connects via **SSE** (`/api/subscribe`) and shows events live.

### How change detection works without Change Streams

Each poll does a sorted query for documents newer than the last checkpoint:

- `updatedAt > lastUpdatedAt` OR (`updatedAt == lastUpdatedAt` AND `_id > lastId`)
- ordered by `{ updatedAt: 1, _id: 1 }`
- persist the checkpoint after processing a batch

This is effectively a simple "tailer" that can resume after hiccups.

### Transition reconstruction

When the app updates state through the API, it also appends to `stateHistory`:

```js
{ from, to, at }
```

The poller uses the last history item to emit `from -> to`. If history is missing, it falls back to `from == to` (still notifies state-change subscribers).

## Setup

### Prerequisites

- Node.js 18+ (recommended 20+)
- MongoDB running locally (or any reachable MongoDB URI)

#### Starting MongoDB on Windows (options)

- **MongoDB Community Server**: install it and ensure the Windows service is running (default port `27017`).
- **MongoDB Atlas**: create a free cluster and set `MONGODB_URI` in `server/.env` to your SRV connection string.
- **Docker**: if you have Docker Desktop running, you can use the included `docker-compose.yml`:

```bash
docker compose up -d
```

#### MongoDB Atlas setup (recommended)

1. In Atlas, create a cluster (M0 is fine).
2. Create a DB user (Database Access).
3. Network Access → **IP Access List**:
   - For quick testing: add `0.0.0.0/0` (not recommended long-term)
   - Better: add your current public IP.
4. Connect → Drivers → copy the **SRV** string.
5. Put credentials into `server/.env`.
   - Recommended (avoids URL-encoding issues): set `MONGODB_ATLAS_HOST`, `MONGODB_ATLAS_USER`, `MONGODB_ATLAS_PASSWORD`, `MONGODB_DBNAME`.
   - Alternative: paste a full `MONGODB_URI="mongodb+srv://..."` string.

### Install

From the repo root:

```bash
npm install
```

### Configure server env

Copy:

- `server/.env.example` → `server/.env`

Edit `server/.env`:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/pubsub_assignment
PORT=4000
POLL_INTERVAL_MS=200
SUBSCRIBER_QUEUE_MAX=2000
```

## Run (dev)

### Start server

```bash
npm run dev -w server
```

### Start client

```bash
npm run dev -w client
```

Open the UI at `http://localhost:5173`.

## API

### Create a job

`POST /api/jobs`

Body:

```json
{ "name": "job-1" }
```

### List jobs

`GET /api/jobs`

### Change job state

`POST /api/jobs/:id/state`

Body:

```json
{ "to": "UPLOADED" }
```

### Subscribe (SSE)

`GET /api/subscribe?kind=stateChange`

Or transition filter:

`GET /api/subscribe?kind=transition&from=PENDING&to=UPLOADED`

Events:

- `hello`: subscription confirmation
- `state`: a transition event payload
- `dropped`: indicates the subscriber queue overflowed (backpressure signal)

## Performance testing & report

### Stress test generator

This script updates documents using `bulkWrite` to target a given updates/sec.

```bash
npm run perf -w server
```

Environment overrides:

```bash
PERF_DOCS=10000
PERF_SECS=10
PERF_UPS=5000
```

### Report template

Fill in `PERFORMANCE_REPORT.md` after running tests:

- Throughput achieved
- Latency from Mongo update → SSE delivery
- CPU/RAM during peak
- Notes about backpressure behavior

## Notes on the assignment questions

- **Efficiency (polling overhead)**: index on `{ updatedAt: 1, _id: 1 }` enables "tailing" queries; batching limits work per tick.
- **Matching logic**: transition matching is O(subscribers) per event; for larger subscriber counts you can pre-index subscriptions by `(from,to)` and/or keep a separate list for stateChange.
- **Backpressure**: each subscriber has a bounded queue. When full, oldest events are dropped and a `dropped` SSE signal is emitted.
- **Consistency / hiccups**: the poll cursor is persisted in Mongo so restarts resume; the query is stable via `(updatedAt, _id)` ordering.

"# PubSub" 
