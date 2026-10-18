import { type MarketplaceItem } from '@gruenerator/contracts';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  itemHref,
  marketplaceHref,
  serializeMarketplaceParams,
  type MarketplaceFilters,
} from '@gruenerator/shared/marketplace';
import { type Href } from 'expo-router';

import { WEB_ORIGIN } from '../../services/webOrigin';

/** Where a tap on a Marktplatz card leads in the app. */
export type MarketplaceOpenTarget =
  | { type: 'route'; href: Href }
  | { type: 'url'; url: string }
  /** Sticker and Hintergründe have no page; a Vorlage without a link goes nowhere. */
  | { type: 'none' };

/**
 * The app's counterpart of `itemHref` (which names web paths): Agents and
 * Rezepte open their native detail pages, a Grünerator-Vorlage its web page in
 * the web viewer, an external Vorlage (Canva …) its own URL.
 */
export function marketplaceOpenTarget(item: MarketplaceItem): MarketplaceOpenTarget {
  switch (item.kind) {
    case 'agent':
      return {
        type: 'route',
        href: {
          pathname: '/(focused)/grueneratoren/agent/[slug]',
          params: { slug: item.agent.slug },
        },
      };
    case 'recipe':
      return {
        type: 'route',
        href: {
          pathname: '/(focused)/grueneratoren/rezept/[mention]',
          params: { mention: item.recipe.mention },
        },
      };
    case 'template': {
      const href = itemHref(item);
      if (!href) return { type: 'none' };
      return href.startsWith('/')
        ? {
            type: 'route',
            href: {
              pathname: '/(fullscreen)/web-viewer',
              params: { path: href, title: item.title },
            },
          }
        : { type: 'url', url: href };
    }
    case 'sticker':
    case 'background':
      return { type: 'none' };
  }
}

/** The Marktplatz screen with these filters — the app's `marketplaceHref`. */
export function marketplaceRoute(filters: Partial<MarketplaceFilters> = {}): Href {
  const params = serializeMarketplaceParams({ ...DEFAULT_MARKETPLACE_FILTERS, ...filters });
  return { pathname: '/(focused)/marktplatz', params: Object.fromEntries(params) };
}

/**
 * The web Marktplatz with this item open (`…/marktplatz?art=…&item=<kind>:<ref>`),
 * for „Teilen" — the link is for someone else, so always the web page; the app
 * opens the same path in place (`/marktplatz?item=`).
 */
export function marketplaceShareUrl(
  filters: Partial<MarketplaceFilters> & Pick<MarketplaceFilters, 'item'>
): string {
  return `${WEB_ORIGIN}${marketplaceHref(filters)}`;
}
