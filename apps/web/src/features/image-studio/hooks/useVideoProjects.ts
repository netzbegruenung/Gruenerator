import { type VideoProject } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export const VIDEO_PROJECTS_QUERY_KEY = ['videoProjects', 'list'] as const;

/**
 * Saved video editor projects (owned, shared, or group-shared). staleTime 0 so
 * a project edited moments ago shows when the user navigates back to /studio.
 */
export const useVideoProjects = (): UseQueryResult<VideoProject[]> =>
  useQuery<VideoProject[]>({
    queryKey: VIDEO_PROJECTS_QUERY_KEY,
    queryFn: async () => {
      const result = await getContractsClient().videoProjects.list();
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to list video projects (HTTP ${result.status})`);
      }
      return result.body;
    },
    staleTime: 0,
    meta: { silent: true },
  });
