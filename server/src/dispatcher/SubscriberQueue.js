export class SubscriberQueue {
  /**
   * @param {{ maxSize: number }} opts
   */
  constructor(opts) {
    this.maxSize = opts.maxSize;
    /** @type {any[]} */
    this.items = [];
    this.dropped = 0;
  }

  /**
   * @param {any} item
   * @returns {{ ok: true } | { ok: false, dropped: number }}
   */
  push(item) {
    if (this.items.length >= this.maxSize) {
      this.items.shift();
      this.dropped++;
      this.items.push(item);
      return { ok: false, dropped: this.dropped };
    }
    this.items.push(item);
    return { ok: true };
  }

  shift() {
    return this.items.shift();
  }

  get length() {
    return this.items.length;
  }
}

