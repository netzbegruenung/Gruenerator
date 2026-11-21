/** @jsxRuntime automatic @jsxImportSource react */
import { type ReactNode } from 'react';

import {
  type PublishedSiteSnapshot,
  type SiteBlock,
  type SiteBlockOf,
  type SiteBlockType,
} from '@gruenerator/contracts';

import { type siteCopy } from '../model/copy.js';
import { type SiteGround } from '../model/grounds.js';
import { type SiteRenderMode } from '../model/visibility.js';

export type SiteCopy = ReturnType<typeof siteCopy>;

/**
 * Editor seam: when set, a section renders an editable widget for a text field in place of its
 * static value and keeps every wrapper element, so the page looks the same while it is edited.
 * The editor resolves `field` (a `data-field` path) to the draft value itself. Never set when the
 * public site or the read-only preview renders.
 */
export interface SiteEditSlots {
  text(field: string, placeholder: string): ReactNode;
  richText(field: string, placeholder: string): ReactNode;
}

export interface SectionContext {
  snapshot: PublishedSiteSnapshot;
  mode: SiteRenderMode;
  copy: SiteCopy;
  /** The blocks on the page, in order (hidden ones only on the editor canvas). */
  blocks: readonly SiteBlock[];
  /** `#anchor` of every block the page shows, for in-page links. */
  liveAnchors: readonly string[];
  edit: SiteEditSlots | null;
}

/** Where one block sits on the page: its anchor and ground, and whether it is its type's first. */
interface PlacementBase {
  block: SiteBlock;
  anchor: string;
  ground: SiteGround;
  /** The first block of its type keeps the page's original inner ids; later ones are prefixed. */
  first: boolean;
}
export type Placement<T extends SiteBlockType = SiteBlockType> = PlacementBase & {
  block: SiteBlockOf<T>;
};

/** An id inside a block that stays unique when the type appears more than once. */
export const innerId = (place: Placement, id: string): string =>
  place.first ? id : `${place.anchor}-${id}`;

/** `data-field` path of a block field, as the editor addresses it. */
export const blockField = (block: SiteBlock, leaf: string): string => `blocks.${block.id}.${leaf}`;

/** `data-field` path of a field of a card inside a block. */
export const itemField = (block: SiteBlock, itemId: string, leaf: string): string =>
  `blocks.${block.id}.items.${itemId}.${leaf}`;

/** The static value, or the editor's widget for `field` while editing. */
export function editableText(
  ctx: SectionContext,
  field: string,
  placeholder: string,
  value: ReactNode
): ReactNode {
  return ctx.edit ? ctx.edit.text(field, placeholder) : value;
}

export const CONTAINER = 'site:mx-auto site:w-full site:max-w-page site:px-gutter';
export const PROSE = 'site:max-w-prose';
export const PILL_LINK =
  'site:inline-flex site:min-h-11 site:items-center site:rounded-pill site:px-4 site:underline-offset-4 site:hover:underline';

export function AccentBar({ center = false }: { center?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`site:mb-5 site:block site:h-1.5 site:w-16 site:bg-accent ${center ? 'site:mx-auto' : ''}`}
    />
  );
}

export function SectionHeading({
  id,
  children,
  field,
  center = false,
  className = '',
}: {
  id: string;
  children: ReactNode;
  field?: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <>
      <AccentBar center={center} />
      <h2
        id={id}
        data-field={field}
        className={`site:text-h2 site:text-heading site:hyphens-manual site:break-words ${className}`}
      >
        {children}
      </h2>
    </>
  );
}

export function Section({
  ctx,
  place,
  ground = place.ground,
  className = '',
  children,
}: {
  ctx: SectionContext;
  place: Placement;
  /** Overrides the placed ground when the block paints its own (a hero photo). */
  ground?: SiteGround;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-block-id={place.block.id}
      data-block-type={place.block.type}
      {...(ctx.edit && place.block.hidden ? { 'data-editor-hidden': '' } : {})}
      id={place.anchor}
      aria-labelledby={`${place.anchor}-titel`}
      data-ground={ground}
      className={className}
    >
      {children}
    </section>
  );
}
