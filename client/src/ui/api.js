const DEFAULT_API_BASE = "http://localhost:4000";

export function apiBase() {
  return localStorage.getItem("apiBase") || DEFAULT_API_BASE;
}

export function setApiBase(v) {
  localStorage.setItem("apiBase", v);
}

export async function listJobs() {
  const r = await fetch(`${apiBase()}/api/jobs`);
  if (!r.ok) throw new Error(`listJobs failed: ${r.status}`);
  return await r.json();
}

export async function createJob(name) {
  const r = await fetch(`${apiBase()}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  if (!r.ok) throw new Error(`createJob failed: ${r.status}`);
  return await r.json();
}

export async function setJobState(id, to) {
  const r = await fetch(`${apiBase()}/api/jobs/${id}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to })
  });
  if (!r.ok) throw new Error(`setJobState failed: ${r.status}`);
  return await r.json();
}

export function subscribeSse({ kind, from, to, onEvent, onError }) {
  const url = new URL(`${apiBase()}/api/subscribe`);
  url.searchParams.set("kind", kind);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);

  const es = new EventSource(url.toString());
  es.addEventListener("hello", (e) => onEvent({ type: "hello", data: JSON.parse(e.data) }));
  es.addEventListener("state", (e) => onEvent({ type: "state", data: JSON.parse(e.data) }));
  es.addEventListener("dropped", (e) => onEvent({ type: "dropped", data: JSON.parse(e.data) }));
  es.addEventListener("error", (e) => {
    onError?.(e);
  });
  return () => es.close();
}

