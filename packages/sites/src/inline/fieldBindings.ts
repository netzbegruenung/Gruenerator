import {
  LEGAL_EMAIL_MAX,
  SITE_ABOUT_MAX_LENGTH,
  SITE_ACTION_TEXT_MAX,
  SITE_PHONE_MAX,
  SITE_SECTION_TITLE_MAX,
  SITE_TAGLINE_MAX,
  SITE_THEME_CONTENT_MAX_LENGTH,
  SITE_TITLE_MAX,
  type SiteDraft,
} from '@gruenerator/contracts';
import {
  getAboutFragment,
  getThemeFragment,
  type SiteFieldKey,
  type SiteFieldValues,
} from '@gruenerator/contracts/site-ydoc';

import { type SiteDraftActions } from '../draft/SiteDraftContext';

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

type StringFieldKey = {
  [K in SiteFieldKey]: SiteFieldValues[K] extends string ? K : never;
}[SiteFieldKey];

// Same limits as the former sidebar inputs.
const BANNER_TITLE_MAX = 60;
const BANNER_SUBTITLE_MAX = 200;

const field = (
  key: StringFieldKey,
  read: (draft: SiteDraft) => string,
  maxLength: number
): TextBinding => ({
  read,
  write: (actions, _draft, value) => actions.setField(key, value),
  maxLength,
});

/** `data-field` path of a plain top-level or section field → its binding. */
const FIELDS: Record<string, TextBinding> = {
  site_title: field('site_title', (d) => d.site_title, SITE_TITLE_MAX),
  tagline: field('tagline', (d) => d.tagline, SITE_TAGLINE_MAX),
  contact_email: field('contact_email', (d) => d.contact_email, LEGAL_EMAIL_MAX),
  contact_phone: field('contact_phone', (d) => d.contact_phone, SITE_PHONE_MAX),
  'sections.about.title': field('about.title', (d) => d.about.title, SITE_SECTION_TITLE_MAX),
  'sections.heroImage.title': field('heroImage.title', (d) => d.heroImage.title, BANNER_TITLE_MAX),
  'sections.heroImage.subtitle': field(
    'heroImage.subtitle',
    (d) => d.heroImage.subtitle,
    BANNER_SUBTITLE_MAX
  ),
  'sections.contact.title': field('contact.title', (d) => d.contact.title, SITE_SECTION_TITLE_MAX),
  'sections.socialFeed.title': field(
    'socialFeed.title',
    (d) => d.socialFeed.title,
    SITE_SECTION_TITLE_MAX
  ),
};

const ITEM_PATH = /^sections\.(themes|actions)\.(\d+)\.(\w+)$/;

export function textBinding(path: string): TextBinding | null {
  const plain = FIELDS[path];
  if (plain) return plain;
  const match = ITEM_PATH.exec(path);
  if (!match) return null;
  const [, list, rawIndex, leaf] = match;
  const index = Number(rawIndex);
  if (list === 'themes' && leaf === 'title') {
    return {
      read: (d) => d.themes[index]?.title ?? '',
      write: (actions, d, value) => {
        const id = d.themes[index]?.id;
        if (id) actions.updateTheme(id, { title: value });
      },
      maxLength: SITE_SECTION_TITLE_MAX,
    };
  }
  if (list === 'actions' && leaf === 'text') {
    return {
      read: (d) => d.actions[index]?.text ?? '',
      write: (actions, d, value) => {
        const id = d.actions[index]?.id;
        if (id) actions.updateAction(id, { text: value });
      },
      maxLength: SITE_ACTION_TEXT_MAX,
    };
  }
  return null;
}

export function richTextBinding(path: string): RichTextBinding | null {
  if (path === 'sections.about.content') {
    return { fragment: (ydoc) => getAboutFragment(ydoc), maxLength: SITE_ABOUT_MAX_LENGTH };
  }
  const match = ITEM_PATH.exec(path);
  if (match?.[1] === 'themes' && match[3] === 'content') {
    const index = Number(match[2]);
    return {
      fragment: (ydoc, d) => {
        const id = d.themes[index]?.id;
        return id ? getThemeFragment(ydoc, id) : null;
      },
      maxLength: SITE_THEME_CONTENT_MAX_LENGTH,
    };
  }
  return null;
}
