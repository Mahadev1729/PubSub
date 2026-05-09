import mongoose from "mongoose";

const checkpointSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    lastUpdatedAt: { type: Date, required: true },
    lastId: { type: mongoose.Schema.Types.ObjectId, required: true }
  },
  { timestamps: true }
);

export const Checkpoint = mongoose.model("Checkpoint", checkpointSchema);

