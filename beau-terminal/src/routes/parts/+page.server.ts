import { db } from '$lib/server/db/index.js';
import { parts } from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';
import { logActivity } from '$lib/server/db/activity.js';

export const load: PageServerLoad = async () => {
  return { parts: db.select().from(parts).orderBy(parts.id).all() };
};

async function fetchDeliveryDate(tracking: string): Promise<string> {
  const isUSPS = /^(9[0-9]{15,21})/.test(tracking);
  const isUPS = /^1Z/.test(tracking);

  try {
    if (isUSPS) {
      const url = `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${tracking}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BMOTerminal/1.0)' },
      });
      const html = await res.text();

      // Look for delivery date patterns in the page
      const patterns = [
        /Expected Delivery[^<]*<[^>]+>[^<]*([A-Z][a-z]+,?\s+[A-Z][a-z]+\.?\s+\d{1,2})/i,
        /Estimated Delivery[^<]*<[^>]+>[^<]*([A-Z][a-z]+,?\s+[A-Z][a-z]+\.?\s+\d{1,2})/i,
        /"expectedDelivery"\s*:\s*"([^"]+)"/i,
        /"scheduledDeliveryDate"\s*:\s*"([^"]+)"/i,
        /class="[^"]*delivery[^"]*"[^>]*>([A-Z][a-z]+,?\s+[A-Z][a-z]+\.?\s+\d{1,2})/i,
        /By\s+(\d{1,2}:\d{2}\s+[ap]m)?,?\s*([A-Z][a-z]+\.?\s+\d{1,2})/i,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m) return (m[2] || m[1]).trim();
      }

      // Check for delivered
      if (html.includes('Your item was delivered') || html.includes('DELIVERED')) {
        return 'Delivered';
      }
      return '';
    }

    if (isUPS) {
      const url = `https://www.ups.com/track?loc=en_US&tracknum=${tracking}&requester=ST/trackdetails`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BMOTerminal/1.0)' },
      });
      const html = await res.text();

      const patterns = [
        /"scheduledDelivery"\s*:\s*"([^"]+)"/i,
        /"estimatedArrival"\s*:\s*"([^"]+)"/i,
        /Scheduled Delivery[^<]*<[^>]+>\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/i,
        /Estimated Delivery[^<]*<[^>]+>\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4})/i,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m) return m[1].trim();
      }

      if (html.includes('DELIVERED') || html.includes('Delivered')) {
        return 'Delivered';
      }
      return '';
    }
  } catch (e) {
    console.warn('[tracking] fetch failed:', e);
  }
  return '';
}

export const actions: Actions = {
  update: async ({ request }) => {
    const form = await request.formData();
    const id = Number(form.get('id'));
    if (!id) return fail(400, { error: 'missing id' });
    const status = form.get('status') as string;
    const tracking = form.get('tracking') as string | null;
    const notes = form.get('notes') as string | null;
    const source = form.get('source') as string | null;
    const expectedDelivery = form.get('expectedDelivery') as string | null;
    const buildVersion = form.get('buildVersion') as string | null;
    db.update(parts)
      .set({
        ...(status ? { status } : {}),
        ...(tracking !== null ? { tracking } : {}),
        ...(notes !== null ? { notes } : {}),
        ...(source !== null ? { source } : {}),
        ...(expectedDelivery !== null ? { expectedDelivery } : {}),
        ...(buildVersion !== null ? { buildVersion } : {}),
      })
      .where(eq(parts.id, id))
      .run();
    const part = db.select().from(parts).where(eq(parts.id, id)).get();
    logActivity('part', id, 'updated', `${part?.name ?? 'unknown'} → ${status}`);
    return { success: true };
  },

  refreshDelivery: async ({ request }) => {
    const form = await request.formData();
    const id = Number(form.get('id'));
    const tracking = (form.get('tracking') as string)?.trim();
    if (!id || !tracking) return fail(400, { error: 'missing id or tracking' });

    const date = await fetchDeliveryDate(tracking);
    if (date) {
      db.update(parts).set({ expectedDelivery: date }).where(eq(parts.id, id)).run();
      return { success: true, date };
    }
    return { success: false, date: '' };
  },
};
