import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiBase, createJob, listJobs, setApiBase, setJobState, subscribeSse } from "./api.js";

const STATES = ["PENDING", "UPLOADED", "VERIFIED", "PROCESSING", "COMPLETED"];

function nowIso() {
  return new Date().toISOString();
}

function fmtLine(obj) {
  return `${obj.ts} ${obj.level.toUpperCase()} ${obj.msg}${obj.data ? " " + JSON.stringify(obj.data) : ""}`;
}

export function App() {
  const [jobs, setJobs] = useState([]);
  const [name, setName] = useState("");
  const [api, setApi] = useState(apiBase());
  const [jobDesired, setJobDesired] = useState(() => ({}));

  const [subKind, setSubKind] = useState("stateChange");
  const [from, setFrom] = useState("PENDING");
  const [to, setTo] = useState("UPLOADED");
  const [connected, setConnected] = useState(false);
  const [simulateDelayMs, setSimulateDelayMs] = useState(0);
  const unsubRef = useRef(null);

  const [log, setLog] = useState(() => [{ ts: nowIso(), level: "ok", msg: "Ready." }]);

  const logText = useMemo(() => log.map(fmtLine).join("\n"), [log]);

  async function refresh() {
    const r = await listJobs();
    setJobs(r.jobs);
  }

  useEffect(() => {
    listJobs()
      .then((r) => setJobs(r.jobs))
      .catch((e) => {
        setLog((l) => [...l, { ts: nowIso(), level: "bad", msg: "Failed to load jobs", data: { error: String(e) } }]);
      });
  }, []);

  function pushLog(level, msg, data) {
    setLog((l) => {
      const next = [...l, { ts: nowIso(), level, msg, data }];
      return next.slice(Math.max(0, next.length - 400));
    });
  }

  async function onCreate() {
    const n = name.trim();
    if (!n) return;
    await createJob(n);
    setName("");
    pushLog("ok", "Created job", { name: n });
    await refresh();
  }

  async function onSetState(id, current) {
    const next = STATES[(STATES.indexOf(current) + 1) % STATES.length];
    await setJobState(id, next);
    pushLog("ok", "State updated", { id, to: next });
    await refresh();
  }

  async function onSetStateTo(id, toState) {
    await setJobState(id, toState);
    pushLog("ok", "State set", { id, to: toState });
    await refresh();
  }

  function connect() {
    if (unsubRef.current) unsubRef.current();

    setApiBase(api);
    pushLog("ok", "Connecting SSE", { apiBase: api, kind: subKind, from: subKind === "transition" ? from : undefined, to: subKind === "transition" ? to : undefined });

    const unsub = subscribeSse({
      kind: subKind,
      from: subKind === "transition" ? from : undefined,
      to: subKind === "transition" ? to : undefined,
      onEvent: (evt) => {
        const handle = () => {
          if (evt.type === "hello") {
            setConnected(true);
            pushLog("ok", "Subscribed", evt.data);
            return;
          }
          if (evt.type === "dropped") {
            pushLog("warn", "Backpressure: queue overflow", evt.data);
            return;
          }
          if (evt.type === "state") {
            const latencyMs = typeof evt.data?.at === "string" ? Date.now() - new Date(evt.data.at).getTime() : undefined;
            pushLog("ok", "Event", latencyMs != null ? { ...evt.data, latencyMs } : evt.data);
            return;
          }
        };

        if (simulateDelayMs > 0 && evt.type !== "hello") {
          setTimeout(handle, simulateDelayMs);
        } else {
          handle();
        }
      },
      onError: () => {
        setConnected(false);
        pushLog("bad", "SSE error/disconnected");
      }
    });
    unsubRef.current = unsub;
  }

  function disconnect() {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = null;
    setConnected(false);
    pushLog("ok", "Disconnected");
  }

  return (
    <div className="container">
      <div className="header">
        <div className="title">
          <h1>State notifier</h1>
          <p>Jobs, polling, SSE subscribe.</p>
        </div>
        <div className="row">
          <input className="input" value={api} onChange={(e) => setApi(e.target.value)} placeholder="API base (e.g. http://localhost:4000)" />
          <button className="button secondary" onClick={() => refresh()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Jobs</h2>
          <div className="row">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New job name" />
            <button className="button" onClick={onCreate}>
              Create
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Tip: use “Advance State” for quick transitions, or “Set” to jump to a specific state.
          </div>
          <div className="jobs">
            {jobs.map((j) => (
              <div className="job" key={j._id}>
                <div className="jobTop">
                  <div>
                    <div style={{ fontWeight: 650 }}>{j.name}</div>
                    <div className="muted">{j._id}</div>
                  </div>
                  <div className="pill">{j.state}</div>
                </div>
                <div className="row">
                  <button className="button" onClick={() => onSetState(j._id, j.state)}>
                    Advance State
                  </button>
                  <select
                    className="select mini"
                    value={jobDesired[j._id] ?? j.state}
                    onChange={(e) => setJobDesired((m) => ({ ...m, [j._id]: e.target.value }))}
                  >
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="button secondary" onClick={() => onSetStateTo(j._id, jobDesired[j._id] ?? j.state)}>
                    Set
                  </button>
                  <div className="muted">version: {j.stateVersion}</div>
                  <div className="muted">updated: {new Date(j.updatedAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {jobs.length === 0 ? <div className="muted">No jobs yet.</div> : null}
          </div>
        </div>

        <div className="card">
          <h2>Subscribe</h2>
          <div className="row">
            <select className="select" value={subKind} onChange={(e) => setSubKind(e.target.value)}>
              <option value="stateChange">State-Change (any update)</option>
              <option value="transition">Transition (from → to)</option>
            </select>
            {subKind === "transition" ? (
              <>
                <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      from: {s}
                    </option>
                  ))}
                </select>
                <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      to: {s}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <input
              className="input mini"
              style={{ minWidth: 180, flex: "initial" }}
              value={simulateDelayMs}
              onChange={(e) => setSimulateDelayMs(Number(e.target.value || 0))}
              placeholder="Simulated delay (ms)"
              inputMode="numeric"
            />
            {!connected ? (
              <button className="button" onClick={connect}>
                Connect
              </button>
            ) : (
              <button className="button secondary" onClick={disconnect}>
                Disconnect
              </button>
            )}
          </div>

          <div className="muted" style={{ marginTop: 10, marginBottom: 10 }}>
            Connection: <span className={connected ? "ok" : "bad"}>{connected ? "connected" : "disconnected"}</span>
            {" · "}
            Simulated subscriber delay: <span className={simulateDelayMs > 0 ? "warn" : ""}>{simulateDelayMs}ms</span>
          </div>

          <div className="log">{logText}</div>
        </div>
      </div>
    </div>
  );
}

