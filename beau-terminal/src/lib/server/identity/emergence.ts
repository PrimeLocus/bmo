import { db } from '../db/index.js';
import { emergenceArtifacts } from '../db/schema.js';

export function hasEmerged(): boolean {
  const count = db.select().from(emergenceArtifacts).all().length;
  return count > 0;
}

export function getEmergenceArtifact() {
  const rows = db.select().from(emergenceArtifacts).all();
  return rows[0] ?? null;
}

export function getSoulCodeHaiku(): string {
  const artifact = getEmergenceArtifact();
  return artifact?.haikuText ?? 'not yet written';
}
