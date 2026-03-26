// src/lib/server/training/trace-outbox.ts
// Training Readiness — SP7 Task 6: Async trace outbox with fail-open flush.
// In-memory append-only queue that flushes to SQLite via a writer callback.
// Fail-open: if a writer throws, the entry stays in the queue for the next flush.

import type { TracePayload } from './types.js';

export interface TraceOutboxConfig {
  flushIntervalMs?: number;
  writer?: (payload: TracePayload) => void;
  /** Fallback for updateStatus when the trace has already been flushed to DB. */
  statusUpdater?: (traceId: string, status: string) => void;
}

export class TraceOutbox {
  private queue: TracePayload[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private config: TraceOutboxConfig;
  private lastEnqueuedTraceId: string | null = null;

  constructor(config: TraceOutboxConfig = {}) {
    this.config = config;
  }

  get pending(): number { return this.queue.length; }
  get running(): boolean { return this.interval !== null; }

  enqueue(payload: TracePayload): void {
    this.queue.push(payload);
    this.lastEnqueuedTraceId = payload.traceId;
  }

  /** Returns the traceId of the most recently enqueued payload, or null. */
  getLastTraceId(): string | null {
    return this.lastEnqueuedTraceId;
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

  /** Retroactively update responseStatus of a queued (not yet flushed) trace.
   *  Used after quality escalation to mark the original attempt as 'quality_rejected'.
   *  Falls back to DB update via statusUpdater if the trace has already been flushed. */
  updateStatus(traceId: string, responseStatus: string): boolean {
    // Try in-memory first (not yet flushed)
    const entry = this.queue.find(p => p.traceId === traceId);
    if (entry) {
      entry.responseStatus = responseStatus;
      return true;
    }
    // Fallback: already flushed to DB
    if (this.config.statusUpdater) {
      try {
        this.config.statusUpdater(traceId, responseStatus);
        return true;
      } catch {
        return false;
      }
    }
    return false;
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
