import {
  LEGAL_EMAIL_MAX,
  SITE_ABOUT_MAX_LENGTH,
  SITE_ACTION_TEXT_MAX,
  SITE_PHONE_MAX,
  SITE_SECTION_TITLE_MAX,
  SITE_TAGLINE_MAX,
  SITE_THEME_CONTENT_MAX_LENGTH,
  SITE_TITLE_MAX,
  type SiteBlock,
  type SiteBlockType,
  type SiteDraft,
} from '@gruenerator/contracts';
import { getBlockFragment, getItemFragment } from '@gruenerator/contracts/site-ydoc';

import { type SiteDraftActions } from '../draft/SiteDraftContext';
import { parseFieldPath } from '../preview/fieldPaths';

import type * as Y from 'yjs';

/** A plain-text field of the draft, addressed by the `data-field` path the page renders. */
export interface TextBinding {
  read(draft: SiteDraft): string;
  write(actions: SiteDraftActions, draft: SiteDraft, value: string): void;
  maxLength: number;
}

export interface RichTextBinding {
  fragment(ydoc: Y.Doc, draft: SiteDraft): Y.XmlFragment | null;
  maxLength: number;
}

// Same limits as the former sidebar inputs.
const BANNER_TITLE_MAX = 60;
const BANNER_SUBTITLE_MAX = 200;

const SITE_TEXT = {
  site_title: SITE_TITLE_MAX,
  tagline: SITE_TAGLINE_MAX,
  contact_email: LEGAL_EMAIL_MAX,
  contact_phone: SITE_PHONE_MAX,
} as const;
type SiteTextKey = keyof typeof SITE_TEXT;
const isSiteText = (key: string): key is SiteTextKey => key in SITE_TEXT;

/** Text leaves each block type renders in place, with their limits. */
const BLOCK_TEXT: Partial<Record<SiteBlockType, Record<string, number>>> = {
  about: { title: SITE_SECTION_TITLE_MAX },
  heroImage: { title: BANNER_TITLE_MAX, subtitle: BANNER_SUBTITLE_MAX },
  contact: { title: SITE_SECTION_TITLE_MAX },
  socialFeed: { title: SITE_SECTION_TITLE_MAX },
};
const ITEM_TEXT: Partial<Record<SiteBlockType, { leaf: 'title' | 'text'; max: number }>> = {
  themes: { leaf: 'title', max: SITE_SECTION_TITLE_MAX },
  actions: { leaf: 'text', max: SITE_ACTION_TEXT_MAX },
};

const findBlock = (draft: SiteDraft, id: string): SiteBlock | undefined =>
  draft.blocks.find((block) => block.id === id);

/** The type of the block a path points into, for picking its binding. */
export function blockTypeForPath(path: string, draft: SiteDraft): SiteBlockType | null {
  const address = parseFieldPath(path);
  if (!address || (address.kind !== 'block' && address.kind !== 'item')) return null;
  return findBlock(draft, address.blockId)?.type ?? null;
}

/** The binding of a text field; `type` is the type of the block the path points into. */
export function textBinding(path: string, type: SiteBlockType | null): TextBinding | null {
  const address = parseFieldPath(path);
  if (!address) return null;
  if (address.kind === 'site') {
    const key = address.key;
    if (!isSiteText(key)) return null;
    return {
      read: (d) => d[key],
      write: (actions, _d, value) => actions.setField(key, value),
      maxLength: SITE_TEXT[key],
    };
  }
  if (address.kind === 'block' && type !== null && address.leaf !== null) {
    const leaf = address.leaf;
    const max = BLOCK_TEXT[type]?.[leaf];
    if (max === undefined) return null;
    return {
      read: (d) => {
        const block = findBlock(d, address.blockId);
        const value = block ? (block as Record<string, unknown>)[leaf] : '';
        return typeof value === 'string' ? value : '';
      },
      // Boundary cast: `leaf` is one of the type's text fields listed in BLOCK_TEXT.
      write: (actions, _d, value) =>
        actions.setBlockField(address.blockId, type, { [leaf]: value } as never),
      maxLength: max,
    };
  }
  if (address.kind === 'item' && type !== null) {
    const text = ITEM_TEXT[type];
    if (!text || text.leaf !== address.leaf) return null;
    return {
      read: (d) => {
        const block = findBlock(d, address.blockId);
        const item =
          block && 'items' in block
            ? block.items.find((entry) => entry.id === address.itemId)
            : undefined;
        const value = item ? (item as Record<string, unknown>)[text.leaf] : '';
        return typeof value === 'string' ? value : '';
      },
      write: (actions, _d, value) =>
        actions.updateItem(address.blockId, address.itemId, { [text.leaf]: value }),
      maxLength: text.max,
    };
  }
  return null;
}

export function richTextBinding(path: string): RichTextBinding | null {
  const address = parseFieldPath(path);
  if (address?.kind === 'block' && address.leaf === 'content') {
    return {
      fragment: (ydoc, d) =>
        findBlock(d, address.blockId)?.type === 'about'
          ? getBlockFragment(ydoc, address.blockId)
          : null,
      maxLength: SITE_ABOUT_MAX_LENGTH,
    };
  }
  if (address?.kind === 'item' && address.leaf === 'content') {
    return {
      fragment: (ydoc, d) => {
        const block = findBlock(d, address.blockId);
        return block?.type === 'themes' && block.items.some((item) => item.id === address.itemId)
          ? getItemFragment(ydoc, address.itemId)
          : null;
      },
      maxLength: SITE_THEME_CONTENT_MAX_LENGTH,
    };
  }
  return null;
}
