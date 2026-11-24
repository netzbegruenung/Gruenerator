import { type LvHub } from '@gruenerator/shared/agents';
import { landesverbandHubHref } from '@gruenerator/shared/marketplace';
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import { SelectCard } from '@gruenerator/ui';
import { PiArrowRight } from 'react-icons/pi';

import { CURRENT_INSTANCE } from '@/config/instance';
import { landesverbandHubGroups } from '@/features/chat/landesverbandHubCards';
import { getNotebookById } from '@/features/notebook/config/notebooksConfig';

interface LandesverbandHubProps {
  hub: LvHub;
  onNavigate: (path: string) => void;
  userLocale: string;
}

/**
 * Landing for a Landesverband's branded link (`/agents/gruene-berlin`). The LV
 * has up to five families — Öffentlichkeitsarbeit, Bürger*innenanfragen,
 * Wahlprüfsteine, and where the collection holds them Beschlussanträge and
 * Wahlprogramm. Since 11/2026 the hub offers their recipes, not the agents: a
 * card opens the chat with `@<rezept>`, and the recipe brings the LV's notebook
 * and filters along (`ChatGraph.ts`). The agents stay resolvable for old links.
 */
export function LandesverbandHub({ hub, onNavigate, userLocale }: LandesverbandHubProps) {
  const HubIcon = NOTEBOOK_ICONS[hub.notebookId];
  const notebookPath = getNotebookById(hub.notebookId)?.path;

  const groups = landesverbandHubGroups(hub, CURRENT_INSTANCE);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-lg px-md py-xl">
      <header className="flex items-center gap-md">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-2xl text-primary-600 dark:text-primary-400">
          <HubIcon aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{hub.name}</h1>
          <p className="text-sm text-grey-500">
            Wähle ein Rezept — jedes kennt die Inhalte des Landesverbands.
          </p>
        </div>
      </header>

      {groups.map(({ agentId, role, recipes }) => (
        <section key={agentId} className="flex flex-col gap-sm" aria-label={role}>
          <h2 className="text-sm font-semibold text-grey-500">{role}</h2>
          {recipes.map((recipe) => (
            <SelectCard
              key={recipe.mention}
              label={recipe.title}
              description={recipe.description}
              icon={
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                  style={{ backgroundColor: recipe.backgroundColor }}
                >
                  {recipe.avatar}
                </span>
              }
              onClick={() => onNavigate(recipe.path)}
            />
          ))}
        </section>
      ))}

      {/* Die Seite im Marktplatz führt das Land wie der Marktplatz selbst — der
          Link erscheint nur, wo sie für diese Person auch aufgeht. */}
      {hub.audience === userLocale && (
        <button
          type="button"
          onClick={() => onNavigate(landesverbandHubHref(hub.slug))}
          className="inline-flex items-center gap-1 self-start text-sm text-primary-600 hover:underline dark:text-primary-400"
        >
          Im Marktplatz ansehen
          <PiArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      )}

      {notebookPath && (
        <button
          type="button"
          onClick={() => onNavigate(notebookPath)}
          className="inline-flex items-center gap-1 self-start text-sm text-primary-600 hover:underline dark:text-primary-400"
        >
          Wissensdatenbank ansehen
          <PiArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
