import { nanoid } from "nanoid";
import { SubscriberQueue } from "./SubscriberQueue.js";

/**
 * @typedef {import("express").Response} Response
 */

/**
 * @typedef {Object} Subscription
 * @property {string} id
 * @property {"stateChange" | "transition"} kind
 * @property {string=} from
 * @property {string=} to
 * @property {SubscriberQueue} queue
 * @property {Response} res
 * @property {number} createdAtMs
 */

export class Dispatcher {
  /**
   * @param {{ subscriberQueueMax: number }} opts
   */
  constructor(opts) {
    this.subscriberQueueMax = opts.subscriberQueueMax;
    /** @type {Map<string, Subscription>} */
    this.subs = new Map();
    this.metrics = {
      delivered: 0,
      dropped: 0
    };
  }

  /**
   * @param {{ kind: Subscription["kind"], from?: string, to?: string, res: Response }} args
   * @returns {Subscription}
   */
  addSubscription(args) {
    const id = nanoid();
    /** @type {Subscription} */
    const sub = {
      id,
      kind: args.kind,
      from: args.from,
      to: args.to,
      res: args.res,
      queue: new SubscriberQueue({ maxSize: this.subscriberQueueMax }),
      createdAtMs: Date.now()
    };

    this.subs.set(id, sub);
    return sub;
  }

  /**
   * @param {string} id
   */
  removeSubscription(id) {
    this.subs.delete(id);
  }

  /**
   * @returns {number}
   */
  subscriberCount() {
    return this.subs.size;
  }

  /**
   * @param {{ jobId: string, name: string, from: string, to: string, at: string, version: number }} event
   */
  publish(event) {
    for (const sub of this.subs.values()) {
      if (sub.kind === "stateChange") {
        this._enqueue(sub, event);
        continue;
      }
      if (sub.kind === "transition") {
        if (sub.from === event.from && sub.to === event.to) {
          this._enqueue(sub, event);
        }
      }
    }
  }

  /**
   * @param {Subscription} sub
   * @param {any} event
   */
  _enqueue(sub, event) {
    const r = sub.queue.push(event);
    if (!r.ok) this.metrics.dropped++;
  }

  /**
   * Flush queued events to SSE clients in a non-blocking way.
   * This is intentionally simple: Node's event loop is the concurrency primitive here.
   */
  flushOnce() {
    for (const sub of this.subs.values()) {
      let wrote = 0;
      while (sub.queue.length > 0 && wrote < 200) {
        const evt = sub.queue.shift();
        if (!evt) break;
        sub.res.write(`event: state\n`);
        sub.res.write(`data: ${JSON.stringify(evt)}\n\n`);
        this.metrics.delivered++;
        wrote++;
      }

      if (sub.queue.dropped > 0) {
        sub.res.write(`event: dropped\n`);
        sub.res.write(`data: ${JSON.stringify({ droppedTotal: sub.queue.dropped })}\n\n`);
        sub.queue.dropped = 0;
      }
    }
  }
}

