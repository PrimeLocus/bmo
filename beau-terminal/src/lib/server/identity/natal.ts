import { db } from '../db/index.js';
import { natalProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function getActiveNatalProfile() {
  return db.select().from(natalProfiles).where(eq(natalProfiles.isActive, true)).get() ?? null;
}

export function getNatalSummary(): string {
  const profile = getActiveNatalProfile();
  return profile?.summaryText ?? '';
}
