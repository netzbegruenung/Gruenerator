import { sharedMediaPreviewUrl } from '@gruenerator/shared/media-library/shareUrl';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { type StyleProp } from 'react-native';

// Die Datei liegt UNTER `/api` (`app.use('/api/share', …, shareFileRouter)`).
// `/share/<token>` an der Herkunftswurzel ist die Web-Seite dazu und wird vom
// SPA-Fallback als HTML beantwortet — expo-image zeigt dann nichts.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export interface SharedMediaImageProps {
  /** The shared-media share token (`shared_media.share_token`). */
  shareToken: string;
  /** BlurHash from `imageMetadata.blurhash` — rendered as the native placeholder. */
  blurhash?: string;
  /** Requested variant width in px (default 400, matching the API's pre-gen widths). */
  width?: number;
  contentFit?: ImageContentFit;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}

/**
 * App-wide standard for shared-media preview images on mobile. Requests a
 * right-sized WebP variant from `/api/share/<token>/preview?w=&fmt=webp` (backed by
 * the API's pre-generated variants) and uses expo-image's native BlurHash
 * placeholder + fade transition. Use instead of a bare `<Image>` pointed at the
 * full-resolution preview.
 */
export function SharedMediaImage({
  shareToken,
  blurhash,
  width = 400,
  contentFit = 'cover',
  style,
  accessibilityLabel,
}: SharedMediaImageProps) {
  const uri = sharedMediaPreviewUrl(shareToken, { baseUrl: API_BASE_URL, width });
  return (
    <Image
      source={{ uri }}
      placeholder={blurhash ? { blurhash } : undefined}
      contentFit={contentFit}
      transition={200}
      style={style}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
