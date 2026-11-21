import { type SiteBlock, type SiteDraft, type SiteImageFocus } from '@gruenerator/contracts';

import { type SiteDraftActions } from '../../draft/SiteDraftContext';
import { type EditorSelection } from '../../stores/editorStore';

export interface ImageValue {
  url: string;
  focus: SiteImageFocus | null;
}

/** One image of the draft, addressed by the `data-field` path the page renders for it. */
export interface ImageTarget {
  path: string;
  /** Shape of the image on the page, for the upload area. */
  aspectRatio: string;
  read(draft: SiteDraft): ImageValue;
  write(
    actions: SiteDraftActions,
    draft: SiteDraft,
    patch: { url?: string; focus?: SiteImageFocus | null }
  ): void;
}

const findBlock = (draft: SiteDraft, id: string): SiteBlock | undefined =>
  draft.blocks.find((block) => block.id === id);

const PORTRAIT: ImageTarget = {
  path: 'profile_image',
  aspectRatio: '4/5',
  read: (d) => ({ url: d.profile_image, focus: d.profileImageFocus ?? null }),
  write: (a, _d, p) => {
    if (p.url !== undefined) a.setField('profile_image', p.url);
    if (p.focus !== undefined) a.setField('profileImageFocus', p.focus);
  },
};

function bannerImage(blockId: string): ImageTarget {
  return {
    path: `blocks.${blockId}.imageUrl`,
    aspectRatio: '16/9',
    read: (d) => {
      const block = findBlock(d, blockId);
      return block?.type === 'heroImage'
        ? { url: block.imageUrl, focus: block.imageFocus ?? null }
        : { url: '', focus: null };
    },
    write: (a, _d, p) =>
      a.setBlockField(blockId, 'heroImage', {
        ...(p.url !== undefined ? { imageUrl: p.url } : {}),
        ...(p.focus !== undefined ? { imageFocus: p.focus } : {}),
      }),
  };
}

function contactImage(blockId: string): ImageTarget {
  return {
    path: `blocks.${blockId}.backgroundImageUrl`,
    aspectRatio: '16/9',
    read: (d) => {
      const block = findBlock(d, blockId);
      return block?.type === 'contact'
        ? { url: block.backgroundImageUrl, focus: block.backgroundFocus ?? null }
        : { url: '', focus: null };
    },
    write: (a, _d, p) =>
      a.setBlockField(blockId, 'contact', {
        ...(p.url !== undefined ? { backgroundImageUrl: p.url } : {}),
        ...(p.focus !== undefined ? { backgroundFocus: p.focus } : {}),
      }),
  };
}

function cardImage(blockId: string, itemId: string, type: 'themes' | 'actions'): ImageTarget {
  return {
    path: `blocks.${blockId}.items.${itemId}.imageUrl`,
    aspectRatio: type === 'themes' ? '16/10' : '4/5',
    read: (d) => {
      const block = findBlock(d, blockId);
      const item =
        block && 'items' in block ? block.items.find((entry) => entry.id === itemId) : undefined;
      return { url: item?.imageUrl ?? '', focus: item?.imageFocus ?? null };
    },
    write: (a, _d, p) =>
      a.updateItem(blockId, itemId, {
        ...(p.url !== undefined ? { imageUrl: p.url } : {}),
        ...(p.focus !== undefined ? { imageFocus: p.focus } : {}),
      }),
  };
}

/** The image the toolbar's image button edits: the clicked card's, else the block's own. */
export function imageTarget(selection: EditorSelection, draft: SiteDraft): ImageTarget | null {
  const block = findBlock(draft, selection.blockId);
  switch (block?.type) {
    case 'hero':
      return PORTRAIT;
    case 'heroImage':
      return bannerImage(block.id);
    case 'contact':
      return contactImage(block.id);
    case 'themes':
    case 'actions':
      return selection.itemId !== null ? cardImage(block.id, selection.itemId, block.type) : null;
    default:
      return null;
  }
}
