import { Button, DropdownMenuItem, SectionHeader } from '@gruenerator/ui';
import { PiMinusCircle, PiPencilSimple, PiPlus, PiShareNetwork } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { getToolTheme } from '../../../config/toolTheme';
import { useMarketCards } from '../../agentura/hooks/useMarketCards';
import { useMyRecipes } from '../../agentura/hooks/useMyRecipes';
import { sortBy, type MarketItem } from '../../agentura/lib/marketItems';

import { TileCard, type TileTone } from './TileCard';

const FALLBACK_TONE: TileTone = {
  tile: 'bg-grey-50 dark:bg-grey-800/40',
  icon: 'text-secondary-600',
  title: 'text-foreground-heading',
  desc: 'text-muted-foreground',
};

/**
 * „Deine Rezepte" auf `/projekte`: alle Rezepte der Person — auch die ohne
 * Projekt, dazu die in ihre Projekte geteilten und die aus dem Marktplatz
 * hinzugefügten. Dieselbe Kachel wie die Projekte darüber, nur etwas breiter.
 * Die Rezepte eines einzelnen Projekts stehen auf dessen Seite.
 */
export function ProjekteRecipesSection() {
  const recipes = useMyRecipes();
  const { toRecipeItems, asLibrary, recipeActions, shareDialog } = useMarketCards();
  const tone = getToolTheme('projekte') ?? FALLBACK_TONE;
  const byTitle = (entries: typeof recipes.own) => sortBy(entries, 'az', (e) => e.title);

  const items = [
    ...toRecipeItems(byTitle(recipes.own)),
    ...toRecipeItems(byTitle(recipes.shared)),
    ...asLibrary(toRecipeItems(byTitle(recipes.added))),
  ].filter((item): item is MarketItem & { kind: 'recipe' } => item.kind === 'recipe');

  // Wie der Kopf der Grüneratoren-Übersicht: ein Icon-Knopf statt Text.
  const newButton = (
    <Button asChild variant="ghost" size="icon" title="Neues Rezept">
      <Link to="/agentura/rezept/neu" aria-label="Neues Rezept">
        <PiPlus aria-hidden className="size-[18px]" />
      </Link>
    </Button>
  );

  return (
    <section aria-label="Deine Rezepte" className="mt-xl">
      <SectionHeader title="Deine Rezepte" actions={newButton} />
      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4">
          {items.map((item) => {
            const entry = item.entry;
            const actions = recipeActions(item);
            // Ein leeres Fragment zählt als Inhalt: das Menü nur mit echten Einträgen.
            const menu = [
              actions.onEdit && (
                <DropdownMenuItem key="edit" onClick={actions.onEdit}>
                  <PiPencilSimple />
                  Bearbeiten
                </DropdownMenuItem>
              ),
              actions.onShare && (
                <DropdownMenuItem key="share" onClick={actions.onShare}>
                  <PiShareNetwork />
                  Teilen
                </DropdownMenuItem>
              ),
              actions.onRemoveFromLibrary && (
                <DropdownMenuItem key="remove" onClick={actions.onRemoveFromLibrary}>
                  <PiMinusCircle />
                  Aus meinen Rezepten entfernen
                </DropdownMenuItem>
              ),
            ].filter(Boolean);
            return (
              <TileCard
                key={`s-${entry.id ?? entry.mention}`}
                href={`/agentura/rezept/${encodeURIComponent(entry.mention)}`}
                title={entry.title}
                tone={tone}
                badge={<span className="text-lg">{entry.icon}</span>}
                // „Rezept" stünde auf jeder Kachel; die Herkunft sagt mehr.
                meta={entry.shareLabel ? [entry.shareLabel] : []}
                description={entry.description}
                onDelete={actions.onDelete}
                menu={menu.length > 0 ? menu : null}
              />
            );
          })}
        </div>
      ) : (
        // „Noch keine" nur aus einer bestätigt leeren Liste.
        <p className="m-0 py-md text-sm text-grey-500 dark:text-grey-400">
          {recipes.failed
            ? 'Deine Rezepte konnten nicht geladen werden.'
            : !recipes.settled
              ? 'Rezepte werden geladen…'
              : 'Noch keine Rezepte. Ein Rezept hält fest, wie eine Textsorte gelingt – du kannst es allein nutzen oder in Projekte teilen.'}
        </p>
      )}
      {shareDialog}
    </section>
  );
}
