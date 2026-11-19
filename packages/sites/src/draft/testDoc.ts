import { siteDraftFromSite, type SiteDraft } from '@gruenerator/contracts';
import { seedSiteDoc } from '@gruenerator/contracts/site-ydoc';
import * as Y from 'yjs';

export const BASE_DRAFT: SiteDraft = siteDraftFromSite({
  site_title: 'Mustermensch',
  tagline: null,
  profile_image: null,
  theme: null,
  contact_email: null,
  contact_phone: null,
  social_links: {},
  sections: null,
  legal: null,
});

export function seededDoc(draft: Partial<SiteDraft> = {}): Y.Doc {
  const ydoc = new Y.Doc();
  seedSiteDoc(ydoc, { ...BASE_DRAFT, ...draft }, new Date().toISOString());
  return ydoc;
}
