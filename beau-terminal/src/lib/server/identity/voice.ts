import { db } from '../db/index.js';
import { voiceModels } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export function getActiveVoiceModel() {
  return db.select().from(voiceModels).where(eq(voiceModels.status, 'active')).get() ?? null;
}

export function getVoiceModelVersion(): string {
  const model = getActiveVoiceModel();
  return model?.versionName ?? 'v0 (pre-training)';
}

export function getAllVoiceModels() {
  return db.select().from(voiceModels).all();
}
