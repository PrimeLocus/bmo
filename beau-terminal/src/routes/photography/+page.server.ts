import { db } from '$lib/server/db/index.js';
import { photos } from '$lib/server/db/schema.js';
import { desc, count, eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { validateImageMime, generatePhotoFilename, MAX_PHOTO_SIZE } from '$lib/server/creative/photography.js';
import type { PageServerLoad, Actions } from './$types.js';

const PHOTOS_DIR = join(process.cwd(), 'data', 'photos');

export const load: PageServerLoad = async ({ url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const perPage = 24;
  const offset = (page - 1) * perPage;

  const photoList = db.select().from(photos)
    .orderBy(desc(photos.createdAt))
    .limit(perPage)
    .offset(offset)
    .all();

  const total = db.select({ n: count() }).from(photos).get()?.n ?? 0;

  return {
    photos: photoList,
    page,
    totalPages: Math.ceil(total / perPage),
  };
};

export const actions: Actions = {
  upload: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('photo') as File | null;
    if (!file || file.size === 0) return fail(400, { error: 'No file provided' });
    if (!validateImageMime(file.type)) return fail(400, { error: 'Invalid file type — images only' });
    if (file.size > MAX_PHOTO_SIZE) return fail(400, { error: 'File too large — 20 MB max' });

    const notes = (formData.get('notes') as string) || '';
    const sourceType = (formData.get('sourceType') as string) || 'instant_scan';

    const filename = generatePhotoFilename(file.name);

    mkdirSync(PHOTOS_DIR, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(join(PHOTOS_DIR, filename), buffer);

    db.insert(photos).values({
      imagePath: filename,
      notes,
      sourceType,
    }).run();

    return { success: true };
  },

  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = Number(formData.get('id'));
    if (isNaN(id) || id <= 0) return fail(400, { error: 'Invalid ID' });

    const record = db.select().from(photos).where(eq(photos.id, id)).get();
    if (record) {
      for (const p of [record.imagePath, record.thumbnailPath].filter(Boolean)) {
        try { unlinkSync(join(PHOTOS_DIR, p!)); } catch { /* already gone */ }
      }
    }
    db.delete(photos).where(eq(photos.id, id)).run();
    return { success: true };
  },
};
