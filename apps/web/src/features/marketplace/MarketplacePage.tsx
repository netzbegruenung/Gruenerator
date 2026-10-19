import {
  parseMarketplaceParams,
  serializeMarketplaceParams,
  type MarketplaceFilters,
} from '@gruenerator/shared/marketplace';
import { useCallback, useMemo, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import { PageHero, PageShell } from '../../components/common/PageHero';

import { MarketplaceAddButton } from './MarketplaceAddButton';
import { MarketplaceBrowser, MarketplaceToolbar } from './MarketplaceBrowser';

/**
 * `/marktplatz` — Agents, Rezepte, Vorlagen, Sticker und Hintergründe in einer
 * Liste. Die Filter und der geöffnete Eintrag stehen in der Adresse
 * (`?art=…&von=…&q=…&sort=…&item=<art>:<ref>`), damit ein geteilter Link
 * dieselbe Ansicht öffnet.
 */
function MarketplacePage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseMarketplaceParams(params), [params]);
  // Opening an item is a step of its own, so the browser's back closes it again.
  const setFilters = useCallback(
    (next: MarketplaceFilters) =>
      setParams(serializeMarketplaceParams(next), {
        replace: next.item === null || filters.item !== null,
      }),
    [setParams, filters.item]
  );

  return (
    <PageShell wide>
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
            <MarketplaceToolbar filters={filters} onChange={setFilters} />
            <MarketplaceAddButton />
          </>
        }
      />
      <MarketplaceBrowser filters={filters} onChange={setFilters} frontpage />
    </PageShell>
  );
}

export default withAuthRequired(MarketplacePage, { title: 'Marktplatz' });
