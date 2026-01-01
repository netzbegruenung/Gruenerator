import { useConsentStore } from '../stores/consentStore';
import type { EmbedPlatform } from '../types/consent';

export function useEmbedConsent(platform: EmbedPlatform) {
  const { consents, grantConsent, revokeConsent } = useConsentStore();

  const hasConsent = consents[platform]?.granted === true;

  return {
    hasConsent,
    grantConsent: (remember: boolean) => grantConsent(platform, remember),
    revokeConsent: () => revokeConsent(platform),
  };
}
