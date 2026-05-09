export class SubscriberQueue {
  constructor(opts) {
    this.maxSize = opts.maxSize;
    this.items = [];
    this.dropped = 0;
  }

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
