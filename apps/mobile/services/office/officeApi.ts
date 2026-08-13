import {
  type BoardDocument,
  type BoardState,
  type CanvasDocument,
  type CanvasListItem,
  type PresentationContentResponse,
  type SheetContentResponse,
} from '@gruenerator/contracts';
import { apiRequest, getContractsClient } from '@gruenerator/shared/api';

import { DEV_BOARDS, DEV_CANVASES, DEV_FIXTURES_ENABLED } from '../devFixtures';

/**
 * Read-only Office data for the mobile viewers. Boards and canvas are NOT in
 * the /docs list (DOCS_ONLY_SUBTYPES excludes them), so the Office tab fetches
 * them from their own endpoints and merges. Sheet/presentation CONTENT comes
 * from the snapshot-decoding GET endpoints (no live collab), so each viewer
 * renders natively from a static JSON read-model.
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

  fetchBoardState(id: string): Promise<BoardState> {
    return apiRequest<BoardState>('get', `/boards/${id}/state`);
  },

  fetchCanvas(id: string): Promise<CanvasDocument> {
    return apiRequest<CanvasDocument>('get', `/canvas/${id}`);
  },

  fetchSheetContent(id: string): Promise<SheetContentResponse> {
    return apiRequest<SheetContentResponse>('get', `/sheets/${id}/content`);
  },

  fetchPresentationContent(id: string): Promise<PresentationContentResponse> {
    return apiRequest<PresentationContentResponse>('get', `/presentations/${id}/content`);
  },
};
