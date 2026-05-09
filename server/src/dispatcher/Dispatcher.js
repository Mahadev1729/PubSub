import { nanoid } from "nanoid";
import { SubscriberQueue } from "./SubscriberQueue.js";

export class Dispatcher {
  constructor(opts) {
    this.subscriberQueueMax = opts.subscriberQueueMax;
    this.subs = new Map();
    this.metrics = {
      delivered: 0,
      dropped: 0
    };
  }

  addSubscription(args) {
    const id = nanoid();
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

  removeSubscription(id) {
    this.subs.delete(id);
  }

  subscriberCount() {
    return this.subs.size;
  }

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

  _enqueue(sub, event) {
    const r = sub.queue.push(event);
    if (!r.ok) this.metrics.dropped++;
  }

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
