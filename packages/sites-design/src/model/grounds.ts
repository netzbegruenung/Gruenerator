import { type SiteSectionId, type SiteVariant } from '@gruenerator/contracts';

export type SiteGround = 'paper' | 'surface' | 'deep' | 'deeper' | 'vivid' | 'photo';
export type SitePart = 'header' | SiteSectionId | 'footer';

const GROUNDS: Record<SitePart, Record<SiteVariant, SiteGround>> = {
  header: { dunkel: 'deep', hell: 'surface', leuchtend: 'vivid' },
  hero: { dunkel: 'deep', hell: 'surface', leuchtend: 'vivid' },
  about: { dunkel: 'paper', hell: 'paper', leuchtend: 'paper' },
  heroImage: { dunkel: 'photo', hell: 'photo', leuchtend: 'photo' },
  themes: { dunkel: 'surface', hell: 'paper', leuchtend: 'deep' },
  actions: { dunkel: 'paper', hell: 'surface', leuchtend: 'paper' },
  socialFeed: { dunkel: 'surface', hell: 'paper', leuchtend: 'surface' },
  contact: { dunkel: 'deep', hell: 'surface', leuchtend: 'vivid' },
  footer: { dunkel: 'deeper', hell: 'deep', leuchtend: 'deeper' },
};

export function sectionGround(variant: SiteVariant, part: SitePart): SiteGround {
  return GROUNDS[part][variant];
}
