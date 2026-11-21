import {
  defaultSiteBlock,
  richTextDocFromPlainText,
  type SiteSections,
  type WebsiteContent,
} from '@gruenerator/contracts';

export interface GeneratedSiteData {
  site_title: string;
  tagline: string;
  contact_email: string;
  sections: SiteSections;
}

/**
 * The AI writes the standard page: one block of each type in the standard order, filled from
 * its content. New block types are not generated until that is decided on its own.
 */
export function transformAiResponse(
  ai: WebsiteContent,
  newId: () => string = () => crypto.randomUUID()
): GeneratedSiteData {
  return {
    site_title: ai.hero.heading,
    tagline: ai.hero.text,
    contact_email: ai.contact.email,
    sections: {
      blocks: [
        defaultSiteBlock('hero', newId),
        {
          ...defaultSiteBlock('about', newId),
          title: ai.about.title || 'Wer ich bin',
          content: richTextDocFromPlainText(ai.about.content),
        },
        {
          ...defaultSiteBlock('heroImage', newId),
          imageUrl: ai.hero_image.imageUrl || '',
          title: ai.hero_image.title,
          subtitle: ai.hero_image.subtitle,
        },
        {
          ...defaultSiteBlock('themes', newId),
          items: ai.themes.map((t) => ({
            id: newId(),
            imageUrl: t.imageUrl || '',
            title: t.title,
            content: richTextDocFromPlainText(t.content),
          })),
        },
        {
          ...defaultSiteBlock('actions', newId),
          items: ai.actions.map((a) => ({
            id: newId(),
            imageUrl: a.imageUrl || '',
            text: a.text,
            link: a.link,
          })),
        },
        defaultSiteBlock('socialFeed', newId),
        {
          ...defaultSiteBlock('contact', newId),
          title: ai.contact.title,
          backgroundImageUrl: ai.contact.backgroundImageUrl || '',
        },
      ],
    },
  };
}
