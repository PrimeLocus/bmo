import { describe, it, expect } from 'vitest';
import { generatePhotoFilename, validateImageMime, ALLOWED_IMAGE_TYPES, MAX_PHOTO_SIZE } from './photography.js';

describe('generatePhotoFilename', () => {
  it('generates a filename with the correct extension', () => {
    const name = generatePhotoFilename('photo.png');
    expect(name).toMatch(/^\d+-[a-z0-9]+\.png$/);
  });

  it('defaults to jpg when no extension', () => {
    const name = generatePhotoFilename('noext');
    expect(name).toMatch(/\.jpg$/);
  });

  it('generates unique filenames', () => {
    const a = generatePhotoFilename('a.jpg');
    const b = generatePhotoFilename('b.jpg');
    expect(a).not.toBe(b);
  });
});

describe('validateImageMime', () => {
  it('accepts image/jpeg', () => {
    expect(validateImageMime('image/jpeg')).toBe(true);
  });

  it('accepts image/png', () => {
    expect(validateImageMime('image/png')).toBe(true);
  });

  it('accepts image/webp', () => {
    expect(validateImageMime('image/webp')).toBe(true);
  });

  it('rejects text/plain', () => {
    expect(validateImageMime('text/plain')).toBe(false);
  });

  it('rejects application/pdf', () => {
    expect(validateImageMime('application/pdf')).toBe(false);
  });
});

describe('constants', () => {
  it('MAX_PHOTO_SIZE is 20MB', () => {
    expect(MAX_PHOTO_SIZE).toBe(20 * 1024 * 1024);
  });

  it('ALLOWED_IMAGE_TYPES has at least 4 types', () => {
    expect(ALLOWED_IMAGE_TYPES.length).toBeGreaterThanOrEqual(4);
  });
});
