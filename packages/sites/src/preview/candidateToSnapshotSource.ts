import { type SiteSnapshotSource } from '@gruenerator/contracts';

import { type SiteData } from '../hooks/useSite';
import { type CandidateData } from '../types/editorDraft';

type StoredSite = Pick<SiteData, 'theme' | 'contact_phone' | 'legal' | 'sections'>;

export function candidateToSnapshotSource(
  candidate: CandidateData,
  site: StoredSite | null
): SiteSnapshotSource {
  const socialLinks = Object.fromEntries(
    Object.entries(candidate.hero.socialLinks).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''
    )
  );
  return {
    site_title: candidate.hero.name,
    tagline: candidate.hero.tagline,
    profile_image: candidate.hero.imageUrl,
    theme: site?.theme ?? null,
    contact_email: candidate.contact.email,
    contact_phone: site?.contact_phone ?? null,
    social_links: socialLinks,
    legal: site?.legal ?? null,
    sections: {
      ...(site?.sections?.hidden ? { hidden: site.sections.hidden } : {}),
      about: candidate.about,
      heroImage: candidate.heroImage,
      themes: candidate.themes.themes.map(({ _key, ...theme }) => theme),
      actions: candidate.actions.actions.map(({ _key, ...action }) => action),
      contact: {
        title: candidate.contact.title,
        backgroundImageUrl: candidate.contact.backgroundImageUrl,
      },
      ...(candidate.socialFeed ? { socialFeed: candidate.socialFeed } : {}),
    },
  };
}
