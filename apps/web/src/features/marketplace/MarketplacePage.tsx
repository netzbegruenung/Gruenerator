import {
  parseMarketplaceParams,
  serializeMarketplaceParams,
  type MarketplaceFilters,
} from '@gruenerator/shared/marketplace';
import { useCallback, useMemo, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import { PageHero, PageHeroSearch, PageShell } from '../../components/common/PageHero';

import { MarketplaceAddButton } from './MarketplaceAddButton';
import { MarketplaceBrowser } from './MarketplaceBrowser';

/**
 * `/marktplatz` — Agents, Rezepte, Vorlagen, Sticker und Hintergründe in einer
 * Liste. Die Filter und der geöffnete Eintrag stehen in der Adresse
 * (`?art=…&von=…&q=…&sort=…&item=<art>:<ref>&kollektion=<id>&kategorie=<id>`), damit ein geteilter Link
 * dieselbe Ansicht öffnet.
 */
function MarketplacePage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseMarketplaceParams(params), [params]);
  // Opening an item or a collection is a step of its own, so the browser's back closes it again.
  const setFilters = useCallback(
    (next: MarketplaceFilters) => {
      const opens =
        (next.item !== null && filters.item === null) ||
        (next.collection !== null && filters.collection === null) ||
        (next.category !== null && filters.category === null);
      setParams(serializeMarketplaceParams(next), { replace: !opens });
    },
    [setParams, filters.item, filters.collection, filters.category]
  );

  return (
    <PageShell wide>
      {/* An opened item, collection or category brings its own title; the hero steps aside. */}
      {filters.item === null && filters.collection === null && filters.category === null && (
        <PageHero
          title="Marktplatz"
          description={
            <p className="m-0 text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
              Offizielle Agents und Rezepte, die deines Landesverbands und was andere öffentlich
              teilen — dazu Vorlagen, Sticker und Hintergründe.
            </p>
          }
          toolbar={
            <>
              {/* Origin and sort live on in the address and the dialog; the page's ways in are its shelves. */}
              <PageHeroSearch
                query={filters.q}
                onQuery={(q) => setFilters({ ...filters, q })}
                placeholder="Marktplatz durchsuchen…"
              />
              <MarketplaceAddButton />
            </>
          }
        />
      )}
      <MarketplaceBrowser filters={filters} onChange={setFilters} frontpage />
    </PageShell>
  );
}

export default withAuthRequired(MarketplacePage, { title: 'Marktplatz' });
