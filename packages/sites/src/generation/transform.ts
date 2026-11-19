import {
  richTextDocFromPlainText,
  type RichTextDoc,
  type WebsiteContent,
} from '@gruenerator/contracts';

export interface GeneratedSiteData {
  site_title: string;
  tagline: string;
  contact_email: string;
  sections: {
    about: { title: string; content: RichTextDoc };
    heroImage: { imageUrl: string; title: string; subtitle: string };
    themes: Array<{ imageUrl: string; title: string; content: RichTextDoc }>;
    actions: Array<{ imageUrl: string; text: string; link: string }>;
    contact: { title: string; backgroundImageUrl: string };
  };
}

export function transformAiResponse(ai: WebsiteContent): GeneratedSiteData {
  return {
    site_title: ai.hero.heading,
    tagline: ai.hero.text,
    contact_email: ai.contact.email,
    sections: {
      about: {
        title: ai.about.title || 'Wer ich bin',
        content: richTextDocFromPlainText(ai.about.content),
      },
      heroImage: {
        imageUrl: ai.hero_image.imageUrl || '',
        title: ai.hero_image.title,
        subtitle: ai.hero_image.subtitle,
      },
      themes: ai.themes.map((t) => ({
        imageUrl: t.imageUrl || '',
        title: t.title,
        content: richTextDocFromPlainText(t.content),
      })),
      actions: ai.actions.map((a) => ({ imageUrl: a.imageUrl || '', text: a.text, link: a.link })),
      contact: { title: ai.contact.title, backgroundImageUrl: ai.contact.backgroundImageUrl || '' },
    },
  };
}
