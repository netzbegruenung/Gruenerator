import { apiRequest } from '@gruenerator/shared/api';

// Version-history (Yjs snapshot) endpoints. These mirror apps/api/routes/docs/
// snapshotController.ts and aren't ts-rest-contracted, so the response shapes are
// declared by hand here — same client-boundary convention as docsShareApi.ts.

export interface SnapshotSummary {
  id: string;
  version: number;
  created_at: string;
  is_auto_save: boolean;
  label: string | null;
  created_by_name: string | null;
  // Number of auto-saves collapsed into this entry (server groups within 30 min).
  snapshot_count: number;
}

export interface SnapshotPreview {
  version: number;
  html: string;
  created_at: string;
}

export const docsVersionsApi = {
  async listSnapshots(docId: string): Promise<SnapshotSummary[]> {
    const res = await apiRequest<{ snapshots: SnapshotSummary[] }>(
      'get',
      `/docs/${docId}/snapshots`
    );
    return res?.snapshots || [];
  },

  async getSnapshotPreview(docId: string, version: number): Promise<SnapshotPreview | null> {
    const res = await apiRequest<SnapshotPreview>(
      'get',
      `/docs/${docId}/snapshots/${version}/preview`
    );
    return res || null;
  },

  // Manually capture the current document state as a named version.
  async createSnapshot(docId: string, label?: string): Promise<void> {
    await apiRequest('post', `/docs/${docId}/snapshots`, label ? { label } : {});
  },

  // Restore writes a new Yjs update server-side; the caller must remount the
  // editor to pick it up (the live Hocuspocus session won't see it otherwise).
  async restoreSnapshot(docId: string, version: number): Promise<void> {
    await apiRequest('post', `/docs/${docId}/snapshots/${version}/restore`);
  },
};
