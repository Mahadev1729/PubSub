import express from "express";
import { Job } from "../models/Job.js";
import { STATE_LIST, STATES } from "../constants.js";

export const jobsRouter = express.Router();

jobsRouter.get("/", async (_req, res) => {
  const jobs = await Job.find({}).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ jobs });
});

jobsRouter.post("/", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });

  const job = await Job.create({ name, state: STATES.PENDING });
  res.status(201).json({ job });
});

jobsRouter.post("/:id/state", async (req, res) => {
  const to = String(req.body?.to ?? "");
  if (!STATE_LIST.includes(to)) return res.status(400).json({ error: `to must be one of ${STATE_LIST.join(", ")}` });

  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: "job not found" });

  const from = job.state;
  if (from === to) return res.status(200).json({ job });

  job.state = to;
  job.stateVersion += 1;
  job.stateHistory.push({ from, to, at: new Date() });
  await job.save();

  res.json({ job });
});

