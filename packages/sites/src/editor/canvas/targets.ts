import {
  siteOptionalSectionSchema,
  type SiteDraft,
  type SiteImageFocus,
  type SiteOptionalSection,
} from '@gruenerator/contracts';

import { type SiteDraftActions } from '../../draft/SiteDraftContext';
import { type EditorSelection, type SectionType } from '../../stores/editorStore';

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

const SECTION_IMAGES: Partial<Record<SectionType, ImageTarget>> = {
  hero: {
    path: 'profile_image',
    aspectRatio: '4/5',
    read: (d) => ({ url: d.profile_image, focus: d.profileImageFocus ?? null }),
    write: (a, _d, p) => {
      if (p.url !== undefined) a.setField('profile_image', p.url);
      if (p.focus !== undefined) a.setField('profileImageFocus', p.focus);
    },
  },
  heroImage: {
    path: 'sections.heroImage.imageUrl',
    aspectRatio: '16/9',
    read: (d) => ({ url: d.heroImage.imageUrl, focus: d.heroImage.imageFocus ?? null }),
    write: (a, _d, p) => {
      if (p.url !== undefined) a.setField('heroImage.imageUrl', p.url);
      if (p.focus !== undefined) a.setField('heroImage.imageFocus', p.focus);
    },
  },
  contact: {
    path: 'sections.contact.backgroundImageUrl',
    aspectRatio: '16/9',
    read: (d) => ({
      url: d.contact.backgroundImageUrl,
      focus: d.contact.backgroundFocus ?? null,
    }),
    write: (a, _d, p) => {
      if (p.url !== undefined) a.setField('contact.backgroundImageUrl', p.url);
      if (p.focus !== undefined) a.setField('contact.backgroundFocus', p.focus);
    },
  },
};

function cardImage(list: 'themes' | 'actions', index: number): ImageTarget {
  return {
    path: `sections.${list}.${index}.imageUrl`,
    aspectRatio: list === 'themes' ? '16/10' : '4/5',
    read: (d) => {
      const card = d[list][index];
      return { url: card?.imageUrl ?? '', focus: card?.imageFocus ?? null };
    },
    write: (a, d, p) => {
      const id = d[list][index]?.id;
      if (!id) return;
      const patch = {
        ...(p.url !== undefined ? { imageUrl: p.url } : {}),
        ...(p.focus !== undefined ? { imageFocus: p.focus } : {}),
      };
      if (list === 'themes') a.updateTheme(id, patch);
      else a.updateAction(id, patch);
    },
  };
}

export type CardList = 'themes' | 'actions';

export const isCardList = (section: SectionType): section is CardList =>
  section === 'themes' || section === 'actions';

/** The image the toolbar's image button edits: the clicked card's, else the section's own. */
export function imageTarget(selection: EditorSelection): ImageTarget | null {
  if (isCardList(selection.section)) {
    return selection.index !== null ? cardImage(selection.section, selection.index) : null;
  }
  return SECTION_IMAGES[selection.section] ?? null;
}

export function isOptionalSection(section: SectionType): section is SiteOptionalSection {
  return (siteOptionalSectionSchema.options as readonly string[]).includes(section);
}

/** `hidden` with `section` added, in the schema's section order. */
export function hiddenWith(hidden: readonly SiteOptionalSection[], section: SiteOptionalSection) {
  const next = new Set([...hidden, section]);
  return siteOptionalSectionSchema.options.filter((option) => next.has(option));
}
