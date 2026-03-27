import { CardGrid, SectionHeader, Skeleton } from '@gruenerator/ui';
import React, { useCallback, useState } from 'react';

import apiClient from '../../../components/utils/apiClient';
import { useUserTexts } from '../../auth/hooks/useProfileData';
import { useGroups, type GroupSummary } from '../../groups/hooks/useGroups';

import TextCard from './TextCard';

const TEXTE_COLLAPSE_THRESHOLD = 10;

const TextsSection = React.memo(() => {
  const { query: textsQuery, deleteText: deleteTextMutation } = useUserTexts({ isActive: true });
  const { userGroups = [] } = useGroups({ isActive: true });

  const texts = textsQuery.data ?? [];
  const isLoading = textsQuery.isLoading;

  const [textsExpanded, setTextsExpanded] = useState(false);
  const [sharedTextId, setSharedTextId] = useState<string | number | null>(null);

  const handleDelete = useCallback(
    (id: string | number, title: string) => {
      if (window.confirm(`Text "${title}" wirklich löschen?`)) {
        deleteTextMutation(id);
      }
    },
    [deleteTextMutation]
  );

  const handleShareToGroup = useCallback(async (textId: string | number, groupId: string) => {
    try {
      await apiClient.post(`/auth/groups/${groupId}/share`, {
        contentType: 'user_documents',
        contentId: textId,
        permissions: { read: true, write: false, collaborative: false },
      });
      setSharedTextId(textId);
      setTimeout(() => setSharedTextId(null), 2000);
    } catch {
      // best-effort
    }
  }, []);

  if (texts.length === 0 && !isLoading) return null;

  return (
    <section className="mb-xl">
      <SectionHeader title="Texte" />
      {isLoading ? (
        <CardGrid columns="5">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="rounded-md border border-grey-200 dark:border-grey-700 overflow-hidden"
            >
              <Skeleton className="aspect-[4/3] rounded-none" />
              <div className="px-sm py-sm">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3 mt-1.5" />
              </div>
            </div>
          ))}
        </CardGrid>
      ) : (
        <>
          <CardGrid columns="5">
            {(textsExpanded ? texts : texts.slice(0, TEXTE_COLLAPSE_THRESHOLD)).map((t) => (
              <TextCard
                key={t.id}
                text={t}
                groups={userGroups as GroupSummary[]}
                onDelete={handleDelete}
                onShareToGroup={handleShareToGroup}
                sharedId={sharedTextId}
              />
            ))}
          </CardGrid>
          {texts.length > TEXTE_COLLAPSE_THRESHOLD && (
            <button
              type="button"
              onClick={() => setTextsExpanded(!textsExpanded)}
              className="mt-sm text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer bg-transparent border-none transition-colors"
            >
              {textsExpanded
                ? 'Weniger anzeigen'
                : `+${texts.length - TEXTE_COLLAPSE_THRESHOLD} weitere anzeigen`}
            </button>
          )}
        </>
      )}
    </section>
  );
});

TextsSection.displayName = 'TextsSection';

export default TextsSection;
