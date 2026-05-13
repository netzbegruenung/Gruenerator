import { memo, useMemo } from 'react';
import { HiBookOpen, HiCog } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';

import type { NotebookCollection } from '../../../types/notebook';

const HIDDEN_NOTEBOOK_IDS = ['gruenerator-notebook'];
const MY_NOTEBOOKS_INLINE_LIMIT = 4;

const NotebookCard = memo(({ notebook }: { notebook: NotebookConfigEntry }) => {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex min-h-[4rem] cursor-pointer items-center gap-sm rounded-md border border-grey-200 bg-background px-md py-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md dark:border-grey-700"
      onClick={() => navigate(notebook.path, { state: { freshConversation: true } })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void navigate(notebook.path, { state: { freshConversation: true } });
        }
      }}
    >
      <notebook.icon className="shrink-0 text-base text-secondary-600" />
      <span className="flex-1 text-sm font-medium text-foreground-heading">{notebook.title}</span>
    </div>
  );
});
NotebookCard.displayName = 'GalleryNotebookCard';

function Section({ title, notebooks }: { title: string; notebooks: NotebookConfigEntry[] }) {
  const filtered = notebooks.filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id));
  if (filtered.length === 0) return null;

  return (
    <>
      <h2 className="mt-xl mb-md text-xl font-semibold text-foreground-heading">{title}</h2>
      <div className="grid grid-cols-4 gap-sm max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        {filtered.map((nb) => (
          <NotebookCard key={nb.id} notebook={nb} />
        ))}
      </div>
    </>
  );
}

const MyNotebookCard = memo(({ collection }: { collection: NotebookCollection }) => {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex min-h-[4rem] cursor-pointer items-center gap-sm rounded-md border border-grey-200 bg-background px-md py-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md dark:border-grey-700"
      onClick={() => navigate(`/notebook/${collection.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void navigate(`/notebook/${collection.id}`);
        }
      }}
    >
      <HiBookOpen className="shrink-0 text-base text-secondary-600" />
      <span className="flex-1 truncate text-sm font-medium text-foreground-heading">
        {collection.name}
      </span>
    </div>
  );
});
MyNotebookCard.displayName = 'GalleryMyNotebookCard';

function ManageAllCard() {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex min-h-[4rem] cursor-pointer items-center gap-sm rounded-md border border-dashed border-primary-400 bg-primary-50 px-md py-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md dark:border-primary-700 dark:bg-primary-950/30"
      onClick={() => navigate('/notebooks/meine')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void navigate('/notebooks/meine');
        }
      }}
    >
      <HiCog className="shrink-0 text-base text-primary-600 dark:text-primary-300" />
      <span className="flex-1 text-sm font-medium text-primary-700 dark:text-primary-200">
        Alle meine Notebooks verwalten
      </span>
    </div>
  );
}

function MyNotebooksSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { query } = useNotebookCollections({ isActive: isAuthenticated });
  const collections = query.data ?? [];

  if (!isAuthenticated) return null;

  const inline = collections.slice(0, MY_NOTEBOOKS_INLINE_LIMIT);

  return (
    <>
      <h2 className="mt-md mb-md text-xl font-semibold text-foreground-heading">Meine Notebooks</h2>
      <div className="grid grid-cols-4 gap-sm max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        {inline.map((c) => (
          <MyNotebookCard key={c.id} collection={c} />
        ))}
        <ManageAllCard />
      </div>
    </>
  );
}

export function NotebookGallery() {
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const sections = useMemo(() => {
    if (isAustrian) {
      return [{ title: 'Notebooks', notebooks: getAustrianNotebooks() }];
    }
    return [
      { title: 'Bundesebene', notebooks: getNotebooksByCategory('bundesebene') },
      { title: 'Landesebene', notebooks: getNotebooksByCategory('landesebene') },
      { title: 'Weitere', notebooks: getNotebooksByCategory('weitere') },
    ];
  }, [isAustrian]);

  return (
    <section>
      <MyNotebooksSection />
      {sections.map((s) => (
        <Section key={s.title} title={s.title} notebooks={s.notebooks} />
      ))}
    </section>
  );
}
