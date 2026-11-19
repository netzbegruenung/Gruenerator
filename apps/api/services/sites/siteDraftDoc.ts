/**
 * The collaborative draft of a Website (#5789) lives in the Hocuspocus room `site-<id>`.
 * The API seeds it from the row before any editor connects, and publishes from it.
 *
 * Only the room form is ever sent to Hocuspocus: the bare id shares the same Yjs rows, and
 * a generic route opened with it would load a second live doc over them.
 */
import { siteDraftFromSite, type Site, type SiteDraft } from '@gruenerator/contracts';
import { decodeSiteDraft, encodeSiteSeed, isSiteDocSeeded } from '@gruenerator/contracts/site-ydoc';
import * as Y from 'yjs';

import { createLogger } from '../../utils/logger.js';
import { hocuspocusInternal, hocuspocusInternalOrNull } from '../collab/hocuspocusInternal.js';

const log = createLogger('siteDraftDoc');

export const siteRoom = (siteId: string): string => `site-${siteId}`;

/** State exists but carries no seed: a client wrote before the API seeded. Never publishable. */
export class UnseededSiteDraftError extends Error {
  constructor(siteId: string) {
    super(`site draft ${siteRoom(siteId)} has state but no seed`);
    this.name = 'UnseededSiteDraftError';
  }
}

/** The room's Y.Doc, or null when it has no state at all. Throws when Hocuspocus fails. */
async function loadSiteDoc(siteId: string): Promise<Y.Doc | null> {
  const res = await hocuspocusInternalOrNull('GET', `/internal/doc/${siteRoom(siteId)}/yjs`);
  if (res === null) return null;
  const update = (res as { update?: unknown }).update;
  if (typeof update !== 'string') {
    throw new Error(`internal GET for ${siteRoom(siteId)} returned no update`);
  }
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, new Uint8Array(Buffer.from(update, 'base64')));
  if (!isSiteDocSeeded(ydoc)) {
    ydoc.destroy();
    throw new UnseededSiteDraftError(siteId);
  }
  return ydoc;
}

/** null = no Yjs state yet; throws when Hocuspocus fails or the state was never seeded. */
export async function readSiteDraft(siteId: string): Promise<SiteDraft | null> {
  const ydoc = await loadSiteDoc(siteId);
  if (!ydoc) return null;
  try {
    return decodeSiteDraft(ydoc);
  } finally {
    ydoc.destroy();
  }
}

/** Seeds the room from the row unless it has state. `seeded: false` is success too. */
export async function ensureSiteDraft(site: Site): Promise<{ seeded: boolean }> {
  const existing = await loadSiteDoc(site.id);
  if (existing) {
    existing.destroy();
    return { seeded: false };
  }
  const update = encodeSiteSeed(siteDraftFromSite(site), new Date().toISOString());
  try {
    const res = (await hocuspocusInternal('POST', `/internal/site/${site.id}/seed`, {
      update: Buffer.from(update).toString('base64'),
    })) as { seeded?: unknown };
    if (typeof res.seeded !== 'boolean') throw new Error('seed answer carries no seeded flag');
    return { seeded: res.seeded };
  } catch (error) {
    log.error(
      `seed of ${siteRoom(site.id)} (${update.byteLength} bytes) failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
}
