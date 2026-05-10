import "dotenv/config";
import mongoose from "mongoose";
import { connectDb } from "../src/db.js";
import { Job } from "../src/models/Job.js";
import { STATES, STATE_LIST } from "../src/constants.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/pubsub_assignment";

function pickNextState(s) {
  const idx = STATE_LIST.indexOf(s);
  return STATE_LIST[(idx + 1) % STATE_LIST.length];
}

async function ensureJobs(n) {
  const count = await Job.countDocuments({});
  if (count >= n) return;
  const missing = n - count;
  const bulk = [];
  for (let i = 0; i < missing; i++) {
    bulk.push({
      insertOne: {
        document: { name: `job-${count + i}`, state: STATES.PENDING, stateVersion: 0, stateHistory: [] }
      }
    });
  }
  await Job.bulkWrite(bulk);
}

async function main() {
  const docs = Number(process.env.PERF_DOCS || 10_000);
  const secs = Number(process.env.PERF_SECS || 5);
  const targetUps = Number(process.env.PERF_UPS || 5_000);

  await connectDb(MONGODB_URI);
  await ensureJobs(docs);

  const jobIds = (await Job.find({}, { _id: 1, state: 1 }).limit(docs).lean()).map((d) => ({
    id: d._id,
    state: d.state
  }));

  const updatesPerTick = Math.max(1, Math.floor(targetUps / 10));
  const tickMs = 100;
  const totalTicks = Math.floor((secs * 1000) / tickMs);

  let sent = 0;
  const t0 = process.hrtime.bigint();

  for (let t = 0; t < totalTicks; t++) {
    const bulk = [];
    for (let i = 0; i < updatesPerTick; i++) {
      const idx = (t * updatesPerTick + i) % jobIds.length;
      const cur = jobIds[idx];
      const next = pickNextState(cur.state);
      bulk.push({
        updateOne: {
          filter: { _id: cur.id },
          update: {
            $set: { state: next },
            $inc: { stateVersion: 1 },
            $push: { stateHistory: { from: cur.state, to: next, at: new Date() } }
          }
        }
      });
      cur.state = next;
      sent++;
    }
    await Job.bulkWrite(bulk, { ordered: false });
    await new Promise((r) => setTimeout(r, tickMs));
  }

  const t1 = process.hrtime.bigint();
  const elapsedSec = Number(t1 - t0) / 1e9;
  console.log(
    JSON.stringify(
      {
        docs,
        durationSec: elapsedSec,
        updatesSent: sent,
        achievedUpdatesPerSec: Math.round(sent / elapsedSec)
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

