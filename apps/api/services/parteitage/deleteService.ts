/**
 * Parteitage deletion. Rows go in one transaction; media files are removed only
 * after it commits, so a failed commit never leaves rows pointing at missing files.
 * Media is content-addressed and a speech's files can be shared, so a speech
 * delete only removes media no other row still references.
 */
import { eq, inArray, or } from 'drizzle-orm';

import {
  conventionAccess,
  conventionDeletedSpeeches,
  conventions,
  conventionSpeeches,
  systemMedia,
} from '../../database/schema/parteitage.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getSystemMediaStorage } from '../systemMedia/storage.js';

async function removeMediaFiles(storageKeys: string[]): Promise<void> {
  const storage = getSystemMediaStorage();
  for (const key of storageKeys) await storage.remove(key);
}

export async function deleteSpeech(speechId: string): Promise<void> {
  const db = getDrizzleInstance();
  const storageKeys = await db.transaction(async (tx) => {
    const [speech] = await tx
      .select()
      .from(conventionSpeeches)
      .where(eq(conventionSpeeches.id, speechId))
      .limit(1);
    if (!speech) return [];

    await tx
      .insert(conventionDeletedSpeeches)
      .values({ convention_id: speech.convention_id, speech_key: speech.speech_key })
      .onConflictDoNothing();
    await tx.delete(conventionSpeeches).where(eq(conventionSpeeches.id, speechId));

    const candidates = [speech.reel_media_id, speech.poster_media_id];
    const stillUsed = new Set<string>();
    const speechRefs = await tx
      .select({ r: conventionSpeeches.reel_media_id, p: conventionSpeeches.poster_media_id })
      .from(conventionSpeeches)
      .where(
        or(
          inArray(conventionSpeeches.reel_media_id, candidates),
          inArray(conventionSpeeches.poster_media_id, candidates)
        )
      );
    for (const r of speechRefs) {
      stillUsed.add(r.r);
      stillUsed.add(r.p);
    }
    const reportRefs = await tx
      .select({ id: conventions.report_media_id })
      .from(conventions)
      .where(inArray(conventions.report_media_id, candidates));
    for (const r of reportRefs) if (r.id) stillUsed.add(r.id);

    const orphanIds = candidates.filter((id) => !stillUsed.has(id));
    if (orphanIds.length === 0) return [];
    const rows = await tx
      .delete(systemMedia)
      .where(inArray(systemMedia.id, orphanIds))
      .returning({ storage_key: systemMedia.storage_key });
    return rows.map((r) => r.storage_key);
  });
  await removeMediaFiles(storageKeys);
}

export async function deleteConvention(id: string): Promise<void> {
  const db = getDrizzleInstance();
  const storageKeys = await db.transaction(async (tx) => {
    const [convention] = await tx.select().from(conventions).where(eq(conventions.id, id)).limit(1);
    if (!convention) return [];

    const speeches = await tx
      .select()
      .from(conventionSpeeches)
      .where(eq(conventionSpeeches.convention_id, id));
    const mediaIds = new Set<string>();
    for (const s of speeches) {
      mediaIds.add(s.reel_media_id);
      mediaIds.add(s.poster_media_id);
    }
    if (convention.report_media_id) mediaIds.add(convention.report_media_id);

    await tx.delete(conventionSpeeches).where(eq(conventionSpeeches.convention_id, id));
    await tx.delete(conventionAccess).where(eq(conventionAccess.convention_id, id));
    await tx
      .delete(conventionDeletedSpeeches)
      .where(eq(conventionDeletedSpeeches.convention_id, id));
    await tx.delete(conventions).where(eq(conventions.id, id));

    if (mediaIds.size === 0) return [];
    const rows = await tx
      .delete(systemMedia)
      .where(inArray(systemMedia.id, [...mediaIds]))
      .returning({ storage_key: systemMedia.storage_key });
    return rows.map((r) => r.storage_key);
  });
  await removeMediaFiles(storageKeys);
}
