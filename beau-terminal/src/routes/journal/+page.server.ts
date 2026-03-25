import { db } from '$lib/server/db/index.js';
import { journalEntries, consentEvents } from '$lib/server/db/schema.js';
import { desc, eq, count } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import {
  CONSENT_COOKIE_NAME,
  buildConsentEventValues,
  generateSessionToken,
} from '$lib/server/reflective/journal.js';
import { removeMemory } from '$lib/server/memory/index.js';
import type { PageServerLoad, Actions } from './$types.js';

function hasConsent(cookies: import('@sveltejs/kit').Cookies): string | null {
  return cookies.get(CONSENT_COOKIE_NAME) ?? null;
}

export const load: PageServerLoad = async ({ cookies }) => {
  const sessionToken = hasConsent(cookies);
  const isUnlocked = sessionToken !== null;

  const total = db.select({ n: count() }).from(journalEntries).get()?.n ?? 0;

  if (!isUnlocked) {
    // Locked: return metadata only — no body text
    const entries = db.select({
      id: journalEntries.id,
      entryAt: journalEntries.entryAt,
      title: journalEntries.title,
      mood: journalEntries.mood,
    })
      .from(journalEntries)
      .orderBy(desc(journalEntries.entryAt))
      .limit(50)
      .all();

    return { entries, total, isUnlocked: false as const };
  }

  // Unlocked: return full entries
  const entries = db.select()
    .from(journalEntries)
    .orderBy(desc(journalEntries.entryAt))
    .limit(50)
    .all();

  // Log each entry view
  for (const entry of entries) {
    try {
      db.insert(consentEvents).values(
        buildConsentEventValues('journal_entry_viewed', {
          targetId: entry.id,
          targetType: 'journal_entry',
          sessionToken,
        })
      ).run();
      // Update surfaced_at timestamp
      if (!entry.surfacedAt) {
        db.update(journalEntries)
          .set({ surfacedAt: new Date().toISOString() })
          .where(eq(journalEntries.id, entry.id))
          .run();
      }
    } catch { /* non-fatal audit */ }
  }

  return { entries, total, isUnlocked: true as const };
};

export const actions: Actions = {
  unlock: async ({ cookies }) => {
    const token = generateSessionToken();
    cookies.set(CONSENT_COOKIE_NAME, token, {
      path: '/journal',
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // local network deployment
      // No maxAge = session-scoped (expires on browser close)
    });

    try {
      db.insert(consentEvents).values(
        buildConsentEventValues('journal_unlocked', { sessionToken: token })
      ).run();
    } catch { /* non-fatal audit */ }

    return { success: true };
  },

  relock: async ({ cookies }) => {
    const token = hasConsent(cookies);
    cookies.delete(CONSENT_COOKIE_NAME, { path: '/journal' });

    try {
      db.insert(consentEvents).values(
        buildConsentEventValues('journal_relocked', { sessionToken: token ?? undefined })
      ).run();
    } catch { /* non-fatal audit */ }

    return { success: true };
  },

  delete: async ({ request, cookies }) => {
    const sessionToken = hasConsent(cookies);
    if (!sessionToken) return fail(403, { error: 'Consent required' });

    const formData = await request.formData();
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) return fail(400, { error: 'Invalid ID' });

    // Audit + delete in one transaction — both succeed or neither does
    db.insert(consentEvents).values(
      buildConsentEventValues('entry_deleted', {
        targetId: id,
        targetType: 'journal_entry',
        sessionToken,
        notes: 'user requested deletion',
      })
    ).run();
    db.delete(journalEntries).where(eq(journalEntries.id, id)).run();
    removeMemory('journal', id);
    return { success: true };
  },
};
