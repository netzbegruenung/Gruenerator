import { type SiteDraft } from '@gruenerator/contracts';

import { SITE_BLOCK_UI } from '../editor/blockUi';

/**
 * The `data-field` paths the page renders, as the editor reads them. Page fields are bare
 * (`site_title`, `social_links.<net>`), block fields are `blocks.<blockId>.<leaf>` and fields of a
 * card are `blocks.<blockId>.items.<itemId>.<leaf>`. Cards go by id, not index, so an address
 * stays right while someone else reorders.
 */
export type FieldAddress =
  | { kind: 'site'; key: string }
  | { kind: 'legal'; key: string }
  | { kind: 'block'; blockId: string; leaf: string | null }
  | { kind: 'item'; blockId: string; itemId: string; leaf: string };

const SITE_KEYS = new Set([
  'site_title',
  'tagline',
  'profile_image',
  'contact_email',
  'contact_phone',
  'social_links',
]);
const ID = '[A-Za-z0-9_-]{1,40}';
const BLOCK_PATH = new RegExp(`^blocks\\.(${ID})(?:\\.(\\w+))?$`);
const ITEM_PATH = new RegExp(`^blocks\\.(${ID})\\.items\\.(${ID})\\.(\\w+)$`);

export function parseFieldPath(path: string): FieldAddress | null {
  const item = ITEM_PATH.exec(path);
  if (item) return { kind: 'item', blockId: item[1]!, itemId: item[2]!, leaf: item[3]! };
  const block = BLOCK_PATH.exec(path);
  if (block && block[2] !== 'items') {
    return { kind: 'block', blockId: block[1]!, leaf: block[2] ?? null };
  }
  const [head, second] = path.split('.');
  if (head === 'legal' && second !== undefined) return { kind: 'legal', key: second };
  if (head !== undefined && SITE_KEYS.has(head)) return { kind: 'site', key: head };
  return null;
}

/** The block whose form holds `path`: page fields belong to the hero, contact data to contact. */
export function blockIdForPath(path: string, draft: SiteDraft): string | null {
  const address = parseFieldPath(path);
  if (!address || address.kind === 'legal') return null;
  if (address.kind === 'site') {
    const type =
      address.key === 'contact_email' || address.key === 'contact_phone' ? 'contact' : 'hero';
    return draft.blocks.find((block) => block.type === type)?.id ?? null;
  }
  return draft.blocks.some((block) => block.id === address.blockId) ? address.blockId : null;
}

const LEAF_LABELS: Record<string, string> = {
  site_title: 'Name',
  tagline: 'Tagline',
  profile_image: 'Profilbild',
  social_links: 'Soziale Netzwerke',
  contact_email: 'E-Mail',
  contact_phone: 'Telefon',
  title: 'Titel',
  content: 'Inhalt',
  subtitle: 'Untertitel',
  imageUrl: 'Bild',
  backgroundImageUrl: 'Hintergrundbild',
  text: 'Button-Text',
  link: 'Link',
  instagramUsername: 'Instagram-Benutzername',
};

const LEGAL_LABELS: Record<string, string> = {
  name: 'Name',
  street: 'Straße',
  postal_code: 'Postleitzahl',
  city: 'Ort',
  email: 'E-Mail',
  phone: 'Telefon',
};

const ITEM_NOUN = { themes: 'Thema', actions: 'Kachel' } as const;

/** A readable name for a publish issue: „Aktionen 2, Kachel 2: Link“. */
export function fieldLabel(path: string, draft: SiteDraft): string {
  const address = parseFieldPath(path);
  if (!address) return path;
  switch (address.kind) {
    case 'legal':
      return `Impressum: ${LEGAL_LABELS[address.key] ?? address.key}`;
    case 'site': {
      const net = path.split('.')[1];
      if (address.key === 'social_links' && net !== undefined) return `Netzwerk: ${net}`;
      return LEAF_LABELS[address.key] ?? path;
    }
    case 'block':
    case 'item': {
      const block = draft.blocks.find((b) => b.id === address.blockId);
      if (!block) return path;
      const sameType = draft.blocks.filter((b) => b.type === block.type);
      const label = SITE_BLOCK_UI[block.type].label;
      let head = sameType.length > 1 ? `${label} ${sameType.indexOf(block) + 1}` : label;
      if (address.kind === 'item' && 'items' in block) {
        const index = block.items.findIndex((item) => item.id === address.itemId);
        if (index !== -1) head = `${head}, ${ITEM_NOUN[block.type]} ${index + 1}`;
      }
      const leaf = address.leaf === null ? null : (LEAF_LABELS[address.leaf] ?? null);
      return leaf ? `${head}: ${leaf}` : head;
    }
  }
}
