const API_BASE = process.env.API_BASE || "http://localhost:4000";
const SUBS = Number(process.env.SUBS || 50);
const DURATION_SECS = Number(process.env.DURATION_SECS || 15);

const STATES = ["PENDING", "UPLOADED", "VERIFIED", "PROCESSING", "COMPLETED"];

function pickTransition(i) {
  const from = STATES[i % STATES.length];
  const to = STATES[(i + 1) % STATES.length];
  return { from, to };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function parseSseLines(onEvent) {
  let buf = "";
  let eventName = "message";
  let dataLines = [];

  function flush() {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    onEvent({ event: eventName, data });
    eventName = "message";
    dataLines = [];
  }

  return (chunk) => {
    buf += chunk;
    while (true) {
      const n = buf.indexOf("\n");
      if (n === -1) break;
      const line = buf.slice(0, n).replace(/\r$/, "");
      buf = buf.slice(n + 1);

      if (line === "") {
        flush();
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
        continue;
      }
    }
  };
}

async function main() {
  const latencies = [];
  const counts = { total: 0, state: 0, dropped: 0 };

  const stopAt = Date.now() + DURATION_SECS * 1000;
  const controllers = [];

  const tasks = Array.from({ length: SUBS }, async (_, i) => {
    const ctrl = new AbortController();
    controllers.push(ctrl);

    try {
      const kind = i % 2 === 0 ? "stateChange" : "transition";
      const url = new URL(`${API_BASE}/api/subscribe`);
      url.searchParams.set("kind", kind);
      if (kind === "transition") {
        const { from, to } = pickTransition(i);
        url.searchParams.set("from", from);
        url.searchParams.set("to", to);
      }

      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { Accept: "text/event-stream" }
      });
      if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);

      const decoder = new TextDecoder();
      const onChunk = parseSseLines(({ event, data }) => {
        counts.total++;
        if (event === "state") {
          counts.state++;
          try {
            const payload = JSON.parse(data);
            const at = payload?.at ? new Date(payload.at).getTime() : NaN;
            if (!Number.isNaN(at)) latencies.push(Date.now() - at);
          } catch {}
        } else if (event === "dropped") {
          counts.dropped++;
        }
      });

      const reader = res.body.getReader();
      while (Date.now() < stopAt) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(decoder.decode(value, { stream: true }));
      }
    } catch {}
  });

  while (Date.now() < stopAt) {
    await new Promise((r) => setTimeout(r, 250));
  }
  for (const c of controllers) c.abort();
  await Promise.allSettled(tasks);

  latencies.sort((a, b) => a - b);

  const mem = process.memoryUsage();
  const out = {
    apiBase: API_BASE,
    subscribers: SUBS,
    durationSecs: DURATION_SECS,
    eventsTotal: counts.total,
    eventsState: counts.state,
    droppedSignals: counts.dropped,
    latencyMs: {
      count: latencies.length,
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      p99: percentile(latencies, 99),
      max: latencies.length ? latencies[latencies.length - 1] : null
    },
    nodeMemoryMb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024)
    }
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
