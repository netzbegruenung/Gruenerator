import { type OfficeFilter, officeFilterSchema } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import useDebounce from '../../components/hooks/useDebounce';

export const OFFICE_QUERY_KEY = ['content', 'office'] as const;

export function useOfficeLibrary(enabled: boolean) {
  const [params, setParams] = useSearchParams();
  const typ = officeFilterSchema.catch('all').parse(params.get('typ'));
  const sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: [...OFFICE_QUERY_KEY, typ, search, sort],
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const res = await getContractsClient().content.listOffice({
        query: { typ, search, sort, limit: '50', offset: String(pageParam) },
      });
      if (res.status !== 200)
        throw new ApiError(res.status, 'Office-Inhalte konnten nicht geladen werden.');
      return res.body;
    },
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : null),
  });
  const items = useMemo(() => {
    // Edits between offset pages can move a row; never render it twice.
    const byId = new Map(
      (query.data?.pages ?? []).flatMap((page) => page.items).map((item) => [item.id, item])
    );
    return [...byId.values()];
  }, [query.data]);
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value);
        return next;
      },
      { replace: true }
    );
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: OFFICE_QUERY_KEY });
  }, [queryClient]);
  return {
    ...query,
    items,
    total: query.data?.pages[0]?.total ?? 0,
    typ,
    sort,
    isFiltered: typ !== 'all' || sort !== 'newest' || searchInput.trim() !== '',
    reset: () => {
      setSearchInput('');
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('typ');
          next.delete('sort');
          return next;
        },
        { replace: true }
      );
    },
    searchInput,
    setSearchInput,
    setType: (value: OfficeFilter) => setParam('typ', value),
    setSort: (value: string) => setParam('sort', value),
    refresh,
  };
}
