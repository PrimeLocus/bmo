// src/lib/server/training/trace-outbox.ts
// Training Readiness — SP7 Task 6: Async trace outbox with fail-open flush.
// In-memory append-only queue that flushes to SQLite via a writer callback.
// Fail-open: if a writer throws, the entry stays in the queue for the next flush.

import type { TracePayload } from './types.js';

export interface TraceOutboxConfig {
  flushIntervalMs?: number;
  writer?: (payload: TracePayload) => void;
}

export class TraceOutbox {
  private queue: TracePayload[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private config: TraceOutboxConfig;

  constructor(config: TraceOutboxConfig = {}) {
    this.config = config;
  }

  get pending(): number { return this.queue.length; }
  get running(): boolean { return this.interval !== null; }

  enqueue(payload: TracePayload): void {
    this.queue.push(payload);
  }

  flush(): void {
    if (this.queue.length === 0) return;
    const batch = [...this.queue];
    const flushed: number[] = [];

    for (let i = 0; i < batch.length; i++) {
      try {
        if (this.config.writer) {
          this.config.writer(batch[i]);
        }
        flushed.push(i);
      } catch {
        // fail-open: skip this entry, try next flush
      }
    }

    // Remove successfully flushed entries in reverse order to preserve indices
    for (let i = flushed.length - 1; i >= 0; i--) {
      this.queue.splice(flushed[i], 1);
    }
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.flush(), this.config.flushIntervalMs ?? 2000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.flush();
  }
}
