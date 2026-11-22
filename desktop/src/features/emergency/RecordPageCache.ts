/** Bounded, in-memory view cache. Never persisted or shared between accounts. */
export class RecordPageCache<T> {
  private pages = new Map<string, { value: T; at: number; version: number }>();
  private flights = new Map<string, { controller: AbortController; promise: Promise<T> }>();
  private version = 0;

  peek(key: string): T | undefined { return this.pages.get(key)?.value; }

  put(key: string, value: T) {
    this.pages.delete(key);
    this.pages.set(key, { value, at: Date.now(), version: this.version });
    while (this.pages.size > 8) this.pages.delete(this.pages.keys().next().value!);
  }

  read(key: string, fetchPage: (signal: AbortSignal) => Promise<T>, force = false): Promise<T> {
    const pending = this.flights.get(key);
    if (pending) return pending.promise;
    const page = this.pages.get(key);
    if (!force && page && page.version === this.version && Date.now() - page.at < 15000) return Promise.resolve(page.value);
    const controller = new AbortController(), version = this.version;
    const promise = (async () => {
      await Promise.resolve();
      try {
        const value = await fetchPage(controller.signal);
        if (controller.signal.aborted || version !== this.version) throw new DOMException('Stale records', 'AbortError');
        this.put(key, value);
        return value;
      } finally {
        if (this.flights.get(key)?.controller === controller) this.flights.delete(key);
      }
    })();
    this.flights.set(key, { controller, promise });
    return promise;
  }

  cancel(key: string) { this.flights.get(key)?.controller.abort(); this.flights.delete(key); }
  invalidate() {
    this.version++;
    for (const key of this.flights.keys()) this.cancel(key);
  }
  clear() { this.invalidate(); this.pages.clear(); }
}
