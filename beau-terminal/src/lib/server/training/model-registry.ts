// src/lib/server/training/model-registry.ts
// Training Readiness — SP7 Task 9: LLM model lineage registry queries.
// Mirrors the pattern from src/lib/server/identity/voice.ts.

import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { llmModelVariants } from './schema.js';

/**
 * Returns the active model variant for a given tier (t1–t4), or null if none.
 */
export function getActiveModelForTier(tier: string) {
  return db.select().from(llmModelVariants)
    .where(and(eq(llmModelVariants.tier, tier), eq(llmModelVariants.status, 'active')))
    .get() ?? null;
}

/**
 * Returns all model variants, regardless of tier or status.
 */
export function getAllModelVariants() {
  return db.select().from(llmModelVariants).all();
}

/**
 * Returns a single model variant by its numeric ID, or null if not found.
 */
export function getModelVariantById(id: number) {
  return db.select().from(llmModelVariants)
    .where(eq(llmModelVariants.id, id))
    .get() ?? null;
}
