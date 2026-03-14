import { db } from './index.js';
import { activityLog } from './schema.js';

export function logActivity(
  entityType: string,
  entityId: string | number | null,
  action: string,
  summary: string
) {
  const id = entityId != null ? String(entityId) : null;
  db.insert(activityLog).values({ entityType, entityId: id, action, summary }).run();
}
