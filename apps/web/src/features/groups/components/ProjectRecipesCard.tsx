import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { PiNotebook, PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { KnowledgeRow } from './ProjectKnowledgeList';
import { type ShareActions } from './shareActions';

interface ProjectRecipesCardProps {
  groupId: string;
  /** Rezepte dieses Projekts (Feed-Einträge der Art `recipe`). */
  items: GroupFeedItem[];
  /** Darf die Person hier etwas ablegen? Sonst kein „+ Rezept". */
  canAdd: boolean;
  actions: ShareActions | null;
  onDiscuss: ((item: GroupFeedItem) => void) | null;
}

/**
 * „Rezepte": die ins Projekt geteilten Rezepte. Chats im Projekt laden sie
 * vorab (`services/groups/projectRecipes.ts`). „+ Rezept" legt ein neues an und
 * teilt es gleich hierher; ein Rezept gehört aber der Person und bleibt auch
 * ohne Projekt bestehen.
 */
export function ProjectRecipesCard({
  groupId,
  items,
  canAdd,
  actions,
  onDiscuss,
}: ProjectRecipesCardProps) {
  return (
    <section
      aria-labelledby="projekt-rezepte-titel"
      className="flex flex-col gap-xs rounded-[20px] bg-card px-md py-sm shadow-sm"
    >
      <div className="flex items-center gap-sm">
        <PiNotebook aria-hidden className="size-5 shrink-0 text-primary-600" />
        <h2 id="projekt-rezepte-titel" className="m-0 min-w-0 flex-1 text-[15px] font-semibold">
          Rezepte
        </h2>
        {canAdd && (
          <Link
            to={`/agentura/rezept/neu?projekt=${encodeURIComponent(groupId)}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary-600 hover:bg-muted"
          >
            <PiPlus aria-hidden className="size-4" />
            Rezept
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          Halte fest, wie Texte in diesem Projekt gelingen. Chats hier nutzen die Rezepte von
          selbst.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((item) => (
            <KnowledgeRow
              key={item.key}
              item={item}
              onUseTemplate={() => {}}
              actions={actions}
              onDiscuss={onDiscuss}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
