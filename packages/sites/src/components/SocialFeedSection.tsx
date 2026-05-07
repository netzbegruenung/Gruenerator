import {
  SocialFeedSection as BaseSocialFeedSection,
  EmbedConsentPlaceholder,
  type SocialFeedSectionType,
} from '@gruenerator/sites-design';

import { useEmbedConsent } from '../hooks/useEmbedConsent';

interface SocialFeedSectionProps {
  data: SocialFeedSectionType;
}

export function SocialFeedSection({ data }: SocialFeedSectionProps) {
  const { hasConsent, grantConsent } = useEmbedConsent('instagram');
  return (
    <BaseSocialFeedSection
      data={data}
      hasConsent={hasConsent}
      onConsent={grantConsent}
      ConsentPlaceholder={EmbedConsentPlaceholder}
    />
  );
}
