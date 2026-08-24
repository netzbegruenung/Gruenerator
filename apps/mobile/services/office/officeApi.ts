import {
  type BoardDocument,
  type CanvasDocument,
  type CanvasListItem,
} from '@gruenerator/contracts';
import { apiRequest, getContractsClient } from '@gruenerator/shared/api';

import { DEV_BOARDS, DEV_CANVASES, DEV_FIXTURES_ENABLED } from '../devFixtures';

/**
 * Read-only Office data for the mobile viewers. Boards and canvas are NOT in
 * the /docs list (DOCS_ONLY_SUBTYPES excludes them), so the Office tab fetches
 * them from their own endpoints and merges.
 *
 * Only the LIST endpoints are left, plus `fetchCanvas` for the Studio tab.
 * Boards, sheets, canvas and presentations all open in the embedded WebView,
 * which loads the real editor over live collab — their snapshot-decoding
 * content endpoints lost their callers with the native read-only viewers.
 *
 * `GET /api/presentations/:id/content` stays on the server even though nothing
 * in this repository calls it any more: builds shipped up to 08/2026 still ask
 * for it, and the app store version is not this checkout. F0 in the
 * frozen-level taxonomy — see `CLAUDE.md`.
 */
export const officeApi = {
  fetchBoards(): Promise<BoardDocument[]> {
    if (DEV_FIXTURES_ENABLED) return Promise.resolve(DEV_BOARDS);
    return apiRequest<BoardDocument[]>('get', '/boards').then((r) => r ?? []);
  },

  /**
   * Via the contracts client, so the response is parsed against
   * `canvasListItemSchema` before any caller sees it.
   *
   * Throws on a non-200 instead of returning `[]`: the Studio tab tells "nothing
   * created yet" apart from "loading failed", and a swallowed empty array turns
   * a failed request into an onboarding offer for someone whose media merely
   * did not load.
   */
  async fetchCanvases(): Promise<CanvasListItem[]> {
    if (DEV_FIXTURES_ENABLED) return DEV_CANVASES;
    const res = await getContractsClient().canvas.list();
    if (res.status !== 200) {
      throw new Error(`Canvas-Liste konnte nicht geladen werden (${res.status})`);
    }
    return res.body;
  },

  fetchCanvas(id: string): Promise<CanvasDocument> {
    return apiRequest<CanvasDocument>('get', `/canvas/${id}`);
  },
};
