import { error } from '@sveltejs/kit';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import type { RequestHandler } from './$types.js';

const PHOTOS_DIR = resolve(process.cwd(), 'data', 'photos');

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export const GET: RequestHandler = async ({ params }) => {
  const filePath = resolve(PHOTOS_DIR, params.path);

  // Prevent path traversal — resolved path must stay within PHOTOS_DIR
  if (!filePath.startsWith(PHOTOS_DIR + '/') && filePath !== PHOTOS_DIR) error(403, 'Forbidden');
  if (!existsSync(filePath)) error(404, 'Not found');

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const data = readFileSync(filePath);
  return new Response(data, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
  });
};
