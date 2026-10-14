import { type UserLibraryItem, type UserLibraryItemKind } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';

// Derselbe Schlüssel wie im Web (`apps/web/.../useUserLibrary.ts`).
const QUERY_KEY = ['user-library'] as const;

const keyOf = (kind: UserLibraryItemKind, ref: string) => `${kind}:${ref}`;

interface Change {
  kind: UserLibraryItemKind;
  ref: string;
  added: boolean;
}

/**
 * „Meine Grüneratoren": was die Person aus der Agentura zu ihren eigenen geholt
 * hat — dieselbe Liste am Konto wie im Web. Hinzufügen und Entfernen schlagen
 * sofort im Cache durch und werden bei einem Fehler zurückgerollt.
 */
export function useUserLibrary() {
  const queryClient = useQueryClient();

  const {
    data: items = [],
    isSuccess: loaded,
    isError: failed,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<UserLibraryItem[]> => {
      const res = await getContractsClient().userLibrary.list();
      if (res.status !== 200) throw new Error('Deine Grüneratoren konnten nicht geladen werden.');
      return res.body.items;
    },
  });

  const keys = useMemo(() => new Set(items.map((i) => keyOf(i.kind, i.ref))), [items]);

  const mutation = useMutation({
    mutationFn: async ({ kind, ref, added }: Change) => {
      const client = getContractsClient().userLibrary;
      const params = { kind, ref };
      if (added) {
        const res = await client.add({ params });
        if (res.status === 409 || res.status === 500) throw new Error(res.body.error);
        if (res.status === 200) return;
      } else {
        const res = await client.remove({ params });
        if (res.status === 500) throw new Error(res.body.error);
        if (res.status === 200) return;
      }
      throw new Error('Deine Grüneratoren konnten gerade nicht gespeichert werden.');
    },
    onMutate: async ({ kind, ref, added }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<UserLibraryItem[]>(QUERY_KEY);
      queryClient.setQueryData<UserLibraryItem[]>(QUERY_KEY, (old = []) => {
        const rest = old.filter((i) => keyOf(i.kind, i.ref) !== keyOf(kind, ref));
        return added ? [...rest, { kind, ref, createdAt: new Date().toISOString() }] : rest;
      });
      return { previous };
    },
    // Zurückrollen und sagen, warum — sonst springt der Knopf still zurück.
    onError: (error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
      Alert.alert('Fehler', error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const has = useCallback(
    (kind: UserLibraryItemKind, ref: string) => keys.has(keyOf(kind, ref)),
    [keys]
  );
  const { mutate } = mutation;
  const toggle = useCallback(
    (kind: UserLibraryItemKind, ref: string) =>
      mutate({ kind, ref, added: !keys.has(keyOf(kind, ref)) }),
    [mutate, keys]
  );

  return { items, loaded, failed, has, toggle };
}
