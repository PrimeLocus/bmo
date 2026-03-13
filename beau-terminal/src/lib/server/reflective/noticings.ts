// Noticings module — pattern observation lifecycle with anti-creep guardrails
// Rule: timing, creative, seasonal only. Never behavioral. Surface once, then archive.

export const NOTICING_STATUSES = ['draft', 'ready', 'surfaced', 'archived'] as const;
export type NoticingStatus = (typeof NOTICING_STATUSES)[number];

export const ALLOWED_CATEGORIES = ['timing', 'creative', 'seasonal'] as const;
export type NoticingCategory = (typeof ALLOWED_CATEGORIES)[number];

export const BLOCKED_CATEGORIES = ['behavioral'] as const;

export const MIN_OBSERVATION_WINDOW_DAYS = 90;

const STATUS_ORDER: Record<NoticingStatus, number> = {
  draft: 0,
  ready: 1,
  surfaced: 2,
  archived: 3,
};

export function validateNoticingCategory(value: string): NoticingCategory | null {
  if (BLOCKED_CATEGORIES.includes(value as any)) return null;
  if (ALLOWED_CATEGORIES.includes(value as NoticingCategory)) return value as NoticingCategory;
  return null;
}

export function isValidStatusTransition(from: NoticingStatus, to: NoticingStatus): boolean {
  if (from === to) return false;
  // Forward-only transitions, plus draft can skip to archived
  return STATUS_ORDER[to] > STATUS_ORDER[from];
}

export type SurfaceCandidate = {
  status: string;
  surfacedAt: string | null;
  createdAt: string;
};

export function canSurface(noticing: SurfaceCandidate, now: Date = new Date()): boolean {
  if (noticing.status !== 'ready') return false;
  if (noticing.surfacedAt !== null) return false;

  // Enforce minimum observation window
  const created = new Date(noticing.createdAt);
  const daysSinceCreated = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceCreated >= MIN_OBSERVATION_WINDOW_DAYS;
}
