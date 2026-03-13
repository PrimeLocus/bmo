// Photo ingest — file validation, naming, and storage utilities

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const MAX_PHOTO_SIZE = 20 * 1024 * 1024; // 20 MB

export function validateImageMime(mimeType: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
}

export function generatePhotoFilename(originalName: string): string {
  const ext = originalName.includes('.') ? originalName.split('.').pop()! : 'jpg';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}
