import { useCallback } from 'react';
import { toast } from 'sonner';

import apiClient from '../../../components/utils/apiClient';
import { downloadBlob } from '../../../utils/downloadFile';
import { downloadFilename } from '../mediaFormat';

import type { MediaItem } from '@gruenerator/shared/media-library';

/** Downloads the original file of a library item (through the API, so auth and counters apply). */
export function useMediaDownload(): (item: MediaItem) => Promise<void> {
  return useCallback(async (item: MediaItem) => {
    try {
      const res = await apiClient.get<Blob>(`/share/${item.shareToken}/download`, {
        responseType: 'blob',
      });
      await downloadBlob(res.data, downloadFilename(item));
    } catch {
      toast.error('Download fehlgeschlagen. Bitte versuche es erneut.');
    }
  }, []);
}
