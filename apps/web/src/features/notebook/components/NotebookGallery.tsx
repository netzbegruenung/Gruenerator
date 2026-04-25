import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import {
  getAustrianNotebooks,
  getNotebooksByCategory,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';

const HIDDEN_NOTEBOOK_IDS = ['gruenerator-notebook'];

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
      {sections.map((s) => (
        <Section key={s.title} title={s.title} notebooks={s.notebooks} />
      ))}
    </section>
  );
}
