import { sharepicVorlageThumbPath, type SharepicVorlage } from '@gruenerator/contracts';
import { type ImageSource } from 'expo-image';

import { resolveChatUrl } from '../../services/chatApiUrl';

/** The thumb endpoint needs the session; expo-image sends no cookie, so the bearer goes along. */
export function vorlageThumbSource(
  id: string,
  seite: number,
  token: string,
  version?: string
): ImageSource {
  return {
    uri: resolveChatUrl(sharepicVorlageThumbPath(id, seite, version)),
    headers: { Authorization: `Bearer ${token}` },
  };
}

/** Width over height of the slides — 4:5 unless the spec says the taller 3:4. */
export function vorlageAspectRatio(vorlage: SharepicVorlage): number {
  return vorlage.spec.format === 'post-portrait-tall' ? 3 / 4 : 4 / 5;
}
