# Performance Report (Template)

Fill this after running your stress tests.

## Environment

- OS:
- CPU:
- RAM:
- Node.js version:
- MongoDB version:
- MongoDB deployment (local/docker/atlas):

## Test configuration

- Documents: (e.g., 10,000)
- Subscribers: (e.g., 50 SSE clients)
- Poll interval: (e.g., 200ms)
- Subscriber queue max: (e.g., 2000)
- Update generator: (`server/scripts/perf-runner.js`)

## Throughput

Target: **5,000 updates/sec**

Results:

| Run | Target UPS | Achieved UPS | Docs | Duration (s) |
|-----|------------|--------------|------|--------------|
| 1   |            |              |      |              |

## Latency (Mongo update → client invoked)

How measured:

- Start time: when update is issued (client or perf runner)
- End time: when SSE `state` event received

Results:

| Percentile | Latency (ms) |
|------------|--------------|
| p50        |              |
| p90        |              |
| p99        |              |

## Scale

- Documents tested:
- Concurrent subscribers:
- Mix of subscription filters:

Observations:

- Dispatcher behavior under 50+ subscribers:
- Mongo query behavior with 10k+ docs:

## Resource Efficiency

Peak load CPU:

Peak load RAM:

Notes:

- Any GC pauses observed?
- Any Mongo saturation (CPU/IO)?

## Backpressure behavior

- How slow subscribers were simulated:
- What happened:
  - Did the dispatcher block?
  - Did memory grow without bound?
  - Were events dropped? (Expected: bounded queue + `dropped` SSE events)

## Consistency / hiccups

- Restart test (poller restart):
  - Were transitions missed?
  - Did checkpoint resume correctly?

## Improvements (if any)

- Subscription indexing (e.g., map `(from,to)` → subscribers)
- Batch publish / flush strategies
- Polling strategy adjustments

