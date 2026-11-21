import { InstagramConsent } from '@gruenerator/sites-design';

import { useEmbedConsent } from '../hooks/useEmbedConsent';

export function EditorInstagram({ username }: { username: string }) {
  const { hasConsent, grantConsent } = useEmbedConsent('instagram');
  return <InstagramConsent username={username} loaded={hasConsent} onConsent={grantConsent} />;
}
