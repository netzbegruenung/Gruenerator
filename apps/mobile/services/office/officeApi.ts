import {
  type BoardDocument,
  type BoardState,
  type CanvasDocument,
  type CanvasListItem,
  type PresentationContentResponse,
  type SheetContentResponse,
} from '@gruenerator/contracts';
import { apiRequest } from '@gruenerator/shared/api';

/**
 * Read-only Office data for the mobile viewers. Boards and canvas are NOT in
 * the /docs list (DOCS_ONLY_SUBTYPES excludes them), so the Office tab fetches
 * them from their own endpoints and merges. Sheet/presentation CONTENT comes
 * from the snapshot-decoding GET endpoints (no live collab), so each viewer
 * renders natively from a static JSON read-model.
 */
export const officeApi = {
  fetchBoards(): Promise<BoardDocument[]> {
    return apiRequest<BoardDocument[]>('get', '/boards').then((r) => r ?? []);
  },

  fetchCanvases(): Promise<CanvasListItem[]> {
    return apiRequest<CanvasListItem[]>('get', '/canvas').then((r) => r ?? []);
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
