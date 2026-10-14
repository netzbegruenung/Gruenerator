import { type MenuAction } from '@expo/ui/community/menu';
import {
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetScope,
} from '@gruenerator/contracts';
import { galleryScopeEmptyText } from '@gruenerator/shared/studio-assets';

export const KIND_OPTIONS: { value: StudioAssetKind; label: string }[] = [
  { value: 'sticker', label: 'Sticker' },
  { value: 'background', label: 'Hintergründe' },
];

const MENU_IDS = [
  'use',
  'like',
  'favorite',
  'publish',
  'private',
  'rename',
  'delete',
  'report',
] as const;

export type StudioAssetMenuId = (typeof MENU_IDS)[number];

type MenuItem = Pick<
  StudioAssetItem,
  'isOwn' | 'visibility' | 'moderation' | 'liked' | 'favorited'
>;

/** The "…" menu of one tile: own items are managed, others' items can be reported. */
export function buildStudioAssetActions(item: MenuItem): MenuAction[] {
  const actions: MenuAction[] = [
    { id: 'use', title: 'Im Profilbild verwenden' },
    { id: 'like', title: item.liked ? 'Gefällt mir nicht mehr' : 'Gefällt mir' },
    { id: 'favorite', title: item.favorited ? 'Nicht mehr merken' : 'Merken' },
  ];
  if (!item.isOwn) return [...actions, { id: 'report', title: 'Melden' }];
  if (item.visibility === 'public') actions.push({ id: 'private', title: 'Privat machen' });
  // A removed item stays usable for its owner but cannot go public again.
  else if (item.moderation !== 'removed')
    actions.push({ id: 'publish', title: 'Öffentlich machen' });
  return [
    ...actions,
    { id: 'rename', title: 'Umbenennen' },
    { id: 'delete', title: 'Löschen', attributes: { destructive: true } },
  ];
}

export function asStudioAssetMenuId(id: string): StudioAssetMenuId | null {
  return MENU_IDS.find((m) => m === id) ?? null;
}

export function studioAssetEmptyText(
  kind: StudioAssetKind,
  scope: StudioAssetScope,
  searching: boolean
): string {
  return searching
    ? 'Nichts gefunden. Versuche einen anderen Suchbegriff.'
    : galleryScopeEmptyText(kind, scope);
}
