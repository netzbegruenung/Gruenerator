import { type NotebookUserGroup } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import { useCallback } from 'react';

const WEB_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu';

/**
 * User-notebook sharing via the contracted `notebookSharing` endpoints. Imperative
 * (called from the actions sheet, not rendered): list the user's groups, share to a
 * group, and build a pretty share URL (resolve → slug, never a bare UUID).
 */
export function useNotebookSharing() {
  const listGroups = useCallback(async (): Promise<NotebookUserGroup[]> => {
    const result = await getContractsClient().notebookSharing.listMyGroups();
    return result.status === 200 ? result.body : [];
  }, []);

  const shareToGroup = useCallback(async (id: string, groupId: string): Promise<boolean> => {
    const result = await getContractsClient().notebookSharing.addGroupShare({
      params: { id },
      body: { group_id: groupId },
    });
    return result.status === 200;
  }, []);

  const getShareUrl = useCallback(async (id: string, name: string): Promise<string | null> => {
    const result = await getContractsClient().notebookCollections.resolveCollection({
      params: { slugOrId: id },
    });
    if (result.status !== 200) return null;
    return `${WEB_URL}/notebooks/${buildNotebookSlug(name, result.body.slug_suffix)}`;
  }, []);

  return { listGroups, shareToGroup, getShareUrl };
}
