import { type LandesverbandId } from '@gruenerator/contracts';
import {
  SKILL_SLIMS,
  landesverbandRecipeMentions,
  landesverbandTitle,
} from '@gruenerator/shared/agents';
import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { lazy, Suspense, useState } from 'react';
import { PiNotebook, PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { KnowledgeRow } from './ProjectKnowledgeList';
import { type ShareActions } from './shareActions';

import { useAuthStore } from '@/stores/authStore';

// Erst beim ersten Öffnen geladen: Editor, Icon-Auswahl und Beispiel-Analyse
// gehören nicht in das Bundle jeder Projektseite.
const RecipeDialog = lazy(() =>
  import('../../agentura/recipes/RecipeDialog').then((m) => ({
    default: m.RecipeDialog,
  }))
);

/** Welcher Rezept-Dialog offen ist: anlegen oder ein eigenes bearbeiten. */
type RecipeDialogState = { kind: 'create' } | { kind: 'edit'; mention: string };

interface ProjectRecipesCardProps {
  groupId: string;
  /** Rezepte dieses Projekts (Feed-Einträge der Art `recipe`). */
  items: GroupFeedItem[];
  /** Darf die Person hier etwas ablegen? Sonst kein „+ Rezept". */
  canAdd: boolean;
  actions: ShareActions | null;
  onDiscuss: ((item: GroupFeedItem) => void) | null;
  /** Der Landesverband des Projekts: seine Rezepte gelten hier von selbst. */
  landesverband?: LandesverbandId | null | undefined;
}

/**
 * „Rezepte": die ins Projekt geteilten Rezepte. Chats im Projekt laden sie
 * vorab (`services/groups/projectRecipes.ts`). „+ Rezept" legt im Dialog ein
 * neues an und teilt es gleich hierher; ein Rezept gehört aber der Person und
 * bleibt auch ohne Projekt bestehen.
 */
export function ProjectRecipesCard({
  groupId,
  items,
  canAdd,
  actions,
  onDiscuss,
  landesverband,
}: ProjectRecipesCardProps) {
  const [dialog, setDialog] = useState<RecipeDialogState | null>(null);
  const userId = useAuthStore((st) => st.user?.id ?? null);
  // Was das Projekt über seinen Landesverband mitbringt (`streamContext.ts`):
  // nicht geteilt, also auch nicht zu entfernen — nur sichtbar machen.
  const shared = new Set(items.map((i) => i.slug));
  const lvRecipes = landesverbandRecipeMentions(landesverband)
    .filter((mention) => !shared.has(mention))
    .flatMap((mention) => {
      const skill = SKILL_SLIMS.find((s) => s.mention === mention);
      return skill ? [{ mention, title: skill.title }] : [];
    });
  const lvTitle = landesverband ? landesverbandTitle(landesverband) : null;
  return (
    <section
      aria-labelledby="projekt-rezepte-titel"
      className="flex flex-col gap-xs rounded-[20px] bg-card px-md py-sm shadow-sm"
    >
      <div className="flex items-center gap-sm">
        <PiNotebook
          aria-hidden
          className="size-5 shrink-0 text-primary-600 dark:text-primary-400"
        />
        <h2 id="projekt-rezepte-titel" className="m-0 min-w-0 flex-1 text-[15px] font-semibold">
          Rezepte
        </h2>
        {canAdd && (
          <button
            type="button"
            onClick={() => setDialog({ kind: 'create' })}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-muted"
          >
            <PiPlus aria-hidden className="size-4" />
            Rezept
          </button>
        )}
      </div>
      {items.length === 0 ? (
        lvRecipes.length === 0 && (
          <p className="m-0 text-sm text-muted-foreground">
            Halte fest, wie Texte in diesem Projekt gelingen. Chats hier nutzen die Rezepte von
            selbst.
          </p>
        )
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((item) => {
            // Ein geteiltes eigenes Rezept ist ein Verweis auf die Zeile der
            // teilenden Person — nur sie darf es ändern, Projekt-Admins nicht.
            // Mitgelieferte Rezepte (`system_recipes`) teilt man, besitzt sie
            // aber nicht: dort sagt `sharedById` nichts über das Ändern.
            const editMention =
              item.contentType === 'user_text_forms' && userId && item.sharedById === userId
                ? item.slug
                : null;
            return (
              <KnowledgeRow
                key={item.key}
                item={item}
                onUseTemplate={() => {}}
                actions={actions}
                onDiscuss={onDiscuss}
                onEdit={
                  editMention ? () => setDialog({ kind: 'edit', mention: editMention }) : null
                }
                hideKind
              />
            );
          })}
        </ul>
      )}
      {lvRecipes.length > 0 && (
        <p className="m-0 text-sm text-muted-foreground">
          {`Vom Landesverband ${lvTitle ?? ''}: `}
          {lvRecipes.map((recipe, i) => (
            <span key={recipe.mention}>
              {i > 0 && ', '}
              <Link
                to={`/agentura/rezept/${encodeURIComponent(recipe.mention)}`}
                className="text-primary-600 hover:underline dark:text-primary-400"
              >
                {recipe.title}
              </Link>
            </span>
          ))}
        </p>
      )}
      {dialog !== null && (
        <Suspense fallback={null}>
          <RecipeDialog
            open
            onOpenChange={(open) => !open && setDialog(null)}
            projectId={groupId}
            mention={dialog.kind === 'edit' ? dialog.mention : null}
          />
        </Suspense>
      )}
    </section>
  );
}
