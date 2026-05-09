import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDb } from "./db.js";
import { Dispatcher } from "./dispatcher/Dispatcher.js";
import { MongoStatePoller } from "./poller/MongoStatePoller.js";
import { Job } from "./models/Job.js";
import { jobsRouter } from "./routes/jobs.js";
import { createSubscribeRouter } from "./routes/subscribe.js";

const PORT = Number(process.env.PORT || 4000);
const DEFAULT_URI = "mongodb://127.0.0.1:27017/pubsub_assignment";
const MONGODB_URI =
  process.env.MONGODB_URI ||
  (process.env.MONGODB_ATLAS_HOST && process.env.MONGODB_ATLAS_USER && process.env.MONGODB_ATLAS_PASSWORD
    ? `mongodb+srv://${encodeURIComponent(process.env.MONGODB_ATLAS_USER)}:${encodeURIComponent(
        process.env.MONGODB_ATLAS_PASSWORD
      )}@${process.env.MONGODB_ATLAS_HOST}/${process.env.MONGODB_DBNAME || "pubsub_assignment"}?retryWrites=true&w=majority`
    : DEFAULT_URI);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 200);
const SUBSCRIBER_QUEUE_MAX = Number(process.env.SUBSCRIBER_QUEUE_MAX || 2000);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

try {
  await connectDb(MONGODB_URI);
} catch (e) {
  const looksPlaceholder = /<[^>]+>/.test(MONGODB_URI);
  // eslint-disable-next-line no-console
  console.error(
    [
      "Failed to connect to MongoDB.",
      `MONGODB_URI=${MONGODB_URI}`,
      looksPlaceholder
        ? "It looks like your connection string still contains placeholders like <password>. Replace them with real values."
        : "If using Atlas, ensure: (1) correct DB user/password, (2) Network Access IP allowlist includes your IP, (3) password is URL-encoded if it contains special characters.",
      "Tip: you can set MONGODB_ATLAS_HOST, MONGODB_ATLAS_USER, MONGODB_ATLAS_PASSWORD, MONGODB_DBNAME instead of pasting a full URI; the server will URL-encode the password.",
      `Error: ${e?.message ?? String(e)}`
    ].join("\n")
  );
  process.exit(1);
}

const dispatcher = new Dispatcher({ subscriberQueueMax: SUBSCRIBER_QUEUE_MAX });
const poller = new MongoStatePoller({
  name: "jobs-state-poller",
  model: Job,
  intervalMs: POLL_INTERVAL_MS,
  batchSize: 5000,
  onTransition: (evt) => dispatcher.publish(evt)
});
await poller.start();

setInterval(() => dispatcher.flushOnce(), 25);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    subscribers: dispatcher.subscriberCount(),
    metrics: dispatcher.metrics,
    pollIntervalMs: POLL_INTERVAL_MS
  });
});

app.use("/api/jobs", jobsRouter);
app.use("/api/subscribe", createSubscribeRouter({ dispatcher }));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});

