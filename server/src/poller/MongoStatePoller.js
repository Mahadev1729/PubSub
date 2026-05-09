import { Checkpoint } from "../models/Checkpoint.js";

/**
 * Polls MongoDB for updates using a persisted cursor (updatedAt + _id).
 * Constraint compliance: no MongoDB Change Streams/Triggers used.
 */
export class MongoStatePoller {
  /**
   * @param {{
   *  name: string,
   *  model: any,
   *  intervalMs: number,
   *  batchSize: number,
   *  onTransition: (evt: { jobId: string, name: string, from: string, to: string, at: string, version: number }) => void,
   * }} opts
   */
  constructor(opts) {
    this.name = opts.name;
    this.model = opts.model;
    this.intervalMs = opts.intervalMs;
    this.batchSize = opts.batchSize;
    this.onTransition = opts.onTransition;
    this.timer = null;
    this.running = false;
  }

  async _loadCheckpoint() {
    const existing = await Checkpoint.findOne({ name: this.name }).lean();
    if (existing) return existing;
    const created = await Checkpoint.create({
      name: this.name,
      lastUpdatedAt: new Date(0),
      lastId: "000000000000000000000000"
    });
    return created.toObject();
  }

  /**
   * @param {{ lastUpdatedAt: Date, lastId: any }} cp
   */
  async _saveCheckpoint(cp) {
    await Checkpoint.updateOne(
      { name: this.name },
      { $set: { lastUpdatedAt: cp.lastUpdatedAt, lastId: cp.lastId } },
      { upsert: true }
    );
  }

  async start() {
    if (this.running) return;
    this.running = true;
    let cp = await this._loadCheckpoint();

    const tick = async () => {
      if (!this.running) return;
      try {
        // Query "newer than checkpoint" ordered by (updatedAt, _id).
        const docs = await this.model
          .find(
            {
              $or: [
                { updatedAt: { $gt: cp.lastUpdatedAt } },
                { updatedAt: cp.lastUpdatedAt, _id: { $gt: cp.lastId } }
              ]
            },
            { name: 1, state: 1, stateVersion: 1, stateHistory: 1, updatedAt: 1 }
          )
          .sort({ updatedAt: 1, _id: 1 })
          .limit(this.batchSize)
          .lean();

        for (const d of docs) {
          // Best-effort transition reconstruction:
          // - Prefer the last history entry (from -> to).
          // - Fallback: treat as stateChange (from==to) if history is missing.
          const lastHist = Array.isArray(d.stateHistory) && d.stateHistory.length > 0 ? d.stateHistory[d.stateHistory.length - 1] : null;
          const from = lastHist?.from ?? d.state;
          const to = lastHist?.to ?? d.state;
          const at = (lastHist?.at ?? d.updatedAt ?? new Date()).toISOString();

          this.onTransition({
            jobId: String(d._id),
            name: d.name,
            from,
            to,
            at,
            version: d.stateVersion ?? 0
          });

          cp = { lastUpdatedAt: d.updatedAt, lastId: d._id };
        }

        if (docs.length > 0) {
          await this._saveCheckpoint(cp);
        }
      } catch (e) {
        // Keep polling even after transient failures; checkpoint prevents missing transitions.
      } finally {
        this.timer = setTimeout(tick, this.intervalMs);
      }
    };

    this.timer = setTimeout(tick, 0);
  }

  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

