import { Button, SectionHeader } from '@gruenerator/ui';
import { PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { MarketSection } from '../../agentura/components/MarketSection';
import { useMarketCards } from '../../agentura/hooks/useMarketCards';
import { useMyRecipes } from '../../agentura/hooks/useMyRecipes';
import { sortBy } from '../../agentura/lib/marketItems';

/**
 * „Deine Rezepte" auf `/projekte`: alle Rezepte der Person — auch die ohne
 * Projekt, dazu die in ihre Projekte geteilten und die aus dem Marktplatz
 * hinzugefügten. Die Rezepte eines einzelnen Projekts stehen auf dessen Seite.
 */
export function ProjekteRecipesSection() {
  const recipes = useMyRecipes();
  const { toRecipeItems, asLibrary, renderItem, shareDialog } = useMarketCards();
  const byTitle = (entries: typeof recipes.own) => sortBy(entries, 'az', (e) => e.title);

  const items = [
    ...toRecipeItems(byTitle(recipes.own)),
    ...toRecipeItems(byTitle(recipes.shared)),
    ...asLibrary(toRecipeItems(byTitle(recipes.added))),
  ];

  const newButton = (
    <Button asChild variant="ghost" size="sm">
      <Link to="/agentura/rezept/neu">
        <PiPlus aria-hidden />
        Neues Rezept
      </Link>
    </Button>
  );

  return (
    <div className="mt-xl">
      {items.length > 0 ? (
        <MarketSection title="Deine Rezepte" gridSize="small" aside={newButton}>
          {items.map(renderItem)}
        </MarketSection>
      ) : (
        <section aria-label="Deine Rezepte">
          <SectionHeader title="Deine Rezepte" actions={newButton} />
          {/* „Noch keine" nur aus einer bestätigt leeren Liste. */}
          <p className="m-0 py-md text-sm text-grey-500 dark:text-grey-400">
            {recipes.failed
              ? 'Deine Rezepte konnten nicht geladen werden.'
              : !recipes.settled
                ? 'Rezepte werden geladen…'
                : 'Noch keine Rezepte. Ein Rezept hält fest, wie eine Textsorte gelingt – du kannst es allein nutzen oder in Projekte teilen.'}
          </p>
        </section>
      )}
      {shareDialog}
    </div>
  );
}
