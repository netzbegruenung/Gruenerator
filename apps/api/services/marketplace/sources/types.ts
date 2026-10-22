import {
  type MarketplaceItemOf,
  type MarketplaceKind,
  type MarketplaceOrigin,
  type MarketplaceScope,
  type MarketplaceSort,
  type ModeratableReportKind,
} from '@gruenerator/contracts';

import { type EntityLikeType } from '../../../database/schema/index.js';
import { type MarketplaceContext } from '../context.js';

/** What a source is asked for — the request's filters, resolved to one page. */
export interface SourceQuery {
  origin: MarketplaceOrigin | null;
  q: string | null;
  sort: MarketplaceSort;
  scope: MarketplaceScope;
  offset: number;
  limit: number;
  /** Catalogue recipes are applied automatically, so the shop lists them only among saved items. */
  systemRecipes: boolean;
  /** Vorlagen only — one `template_type`; the other sources ignore it. Front page collections only. */
  templateType?: 'canva';
}

export interface SourcePage<K extends MarketplaceKind> {
  items: MarketplaceItemOf<K>[];
  hasMore: boolean;
}

/** `full` when „Meine Grüneratoren" already holds its maximum. */
export type SaveResult = 'ok' | 'full';

export interface MarketplaceSource<K extends MarketplaceKind> {
  kind: K;
  /** The `entity_likes` type; `entity_id` is the item's `ref`. */
  likeType: EntityLikeType;
  /** What user content of this kind is reported as; official items carry `null` instead. */
  reportKind: ModeratableReportKind;
  /** One filtered, sorted page, with likes and `saved` filled in. */
  list(ctx: MarketplaceContext, query: SourceQuery): Promise<SourcePage<K>>;
  /** May the viewer like or save this ref? Same visibility as the shop list. */
  isVisible(ctx: MarketplaceContext, ref: string): Promise<boolean>;
  /** One item the viewer may see, as the list builds it — with likes and `saved`. */
  get(ctx: MarketplaceContext, ref: string): Promise<MarketplaceItemOf<K> | null>;
  save: {
    /** The subset of `refs` the viewer has saved. */
    has(ctx: MarketplaceContext, refs: string[]): Promise<Set<string>>;
    add(ctx: MarketplaceContext, ref: string): Promise<SaveResult>;
    remove(ctx: MarketplaceContext, ref: string): Promise<void>;
  };
}
