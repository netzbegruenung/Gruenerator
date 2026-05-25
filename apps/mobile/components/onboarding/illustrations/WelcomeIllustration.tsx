import { useReducedMotion } from 'react-native-reanimated';

import { GrueneratorLoadingIcon } from '../../chat/GrueneratorLoadingIcon';

/**
 * Welcome slide: the Grünerator brand mark (same icon as the Start tab, geometry
 * shared with web). Its cog spins continuously — the ambient motion — except when
 * the user prefers reduced motion, where it falls back to the static idle glyph.
 */
export function WelcomeIllustration({ color, size }: { color: string; size: number }) {
  const reduced = useReducedMotion();
  return <GrueneratorLoadingIcon size={size} color={color} loading={!reduced} />;
}
