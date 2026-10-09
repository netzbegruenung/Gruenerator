import { getGlobalApiClient } from '@gruenerator/shared/api';
import { slugifyName } from '@gruenerator/shared/utils';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { explainablePdfPath, type ExplainableAccess } from './explainableUrls';

import { downloadBlob } from '@/utils/downloadFile';

/**
 * Fetches the PDF through the API client rather than a plain link, so the
 * desktop shell's bearer token travels along and a failure becomes a toast
 * instead of a JSON error page in a new tab.
 */
export function useExplainablePdf(access: ExplainableAccess | null, title: string) {
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(async () => {
    if (!access || isDownloading) return;
    setIsDownloading(true);
    try {
      const res = await getGlobalApiClient().get<Blob>(explainablePdfPath(access), {
        responseType: 'blob',
      });
      await downloadBlob(res.data, `${slugifyName(title, 'explainable')}.pdf`);
    } catch {
      toast.error('Das PDF konnte nicht erstellt werden. Bitte versuche es erneut.');
    } finally {
      setIsDownloading(false);
    }
  }, [access, isDownloading, title]);

  return { download, isDownloading };
}
