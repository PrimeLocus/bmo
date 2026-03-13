// Journal module — entry management, consent auditing, visibility control

export const CONSENT_EVENT_TYPES = [
  'journal_unlocked',
  'journal_relocked',
  'journal_entry_viewed',
  'noticing_surfaced',
  'entry_deleted',
] as const;

export type ConsentEventType = (typeof CONSENT_EVENT_TYPES)[number];

export const VISIBILITY_LEVELS = ['private', 'shared'] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];

export const CONSENT_COOKIE_NAME = 'beau_journal_consent';

export function validateVisibility(value: unknown): Visibility {
  if (typeof value === 'string' && VISIBILITY_LEVELS.includes(value as Visibility)) {
    return value as Visibility;
  }
  return 'private';
}

export type ConsentEventOptions = {
  targetId?: number;
  targetType?: 'journal_entry' | 'noticing';
  sessionToken?: string;
  notes?: string;
};

export function buildConsentEventValues(
  eventType: ConsentEventType,
  options: ConsentEventOptions,
) {
  if (!CONSENT_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Invalid consent event type: ${eventType}`);
  }
  return {
    eventType,
    targetId: options.targetId,
    targetType: options.targetType,
    sessionToken: options.sessionToken,
    notes: options.notes,
  };
}

/** Generate a random session token for consent cookies */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
