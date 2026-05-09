import mongoose from "mongoose";
import { STATE_LIST, STATES } from "../constants.js";

const stateHistorySchema = new mongoose.Schema(
  {
    from: { type: String, enum: STATE_LIST, required: true },
    to: { type: String, enum: STATE_LIST, required: true },
    at: { type: Date, required: true }
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    state: { type: String, enum: STATE_LIST, required: true, index: true, default: STATES.PENDING },
    stateVersion: { type: Number, required: true, default: 0 },
    stateHistory: { type: [stateHistorySchema], required: true, default: [] }
  },
  { timestamps: true }
);

jobSchema.index({ updatedAt: 1, _id: 1 });

export const Job = mongoose.model("Job", jobSchema);

