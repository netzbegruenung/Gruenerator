import { Skeleton } from '@gruenerator/ui';
import { memo } from 'react';
import { HiBookOpen } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { usePublicNotebookCollections } from '../hooks/usePublicNotebookCollections';

import type { NotebookCollection } from '../../../types/notebook';

const VonDerBasisCard = memo(function VonDerBasisCard({
  collection,
}: {
  collection: NotebookCollection;
}) {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => void navigate(`/notebook/${collection.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void navigate(`/notebook/${collection.id}`);
        }
      }}
      className="group flex min-h-[4rem] cursor-pointer items-center gap-sm rounded-md border border-grey-200 bg-background px-md py-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md dark:border-grey-700"
    >
      <HiBookOpen className="shrink-0 text-base text-secondary-600" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground-heading">
          {collection.name}
        </div>
        {collection.description ? (
          <div className="truncate text-xs text-grey-500 dark:text-grey-400">
            {collection.description}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function VonDerBasisSection() {
  const { data, isLoading } = usePublicNotebookCollections({ enabled: true });
  const collections = data ?? [];

  return (
    <section className="mt-xl">
      <h2 className="mb-md text-xl font-semibold text-foreground-heading">Von der Basis</h2>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-sm max-lg:grid-cols-2 max-sm:grid-cols-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[4rem] items-center gap-sm rounded-md border border-grey-200 px-md py-md dark:border-grey-700"
            >
              <Skeleton className="size-5 shrink-0 rounded" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : collections.length === 0 ? (
        <p className="rounded-md border border-dashed border-grey-300 px-md py-lg text-center text-sm text-grey-500 dark:border-grey-700 dark:text-grey-400">
          Noch keine öffentlichen Notebooks. Sei der oder die Erste — veröffentliche eines deiner
          Notebooks im Editor.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-sm max-lg:grid-cols-2 max-sm:grid-cols-1">
          {collections.map((c) => (
            <VonDerBasisCard key={c.id} collection={c} />
          ))}
        </div>
      )}
    </section>
  );
}

export default VonDerBasisSection;
