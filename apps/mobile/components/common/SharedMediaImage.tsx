import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { type StyleProp } from 'react-native';

// Share files are served at the origin root (`/share/...`), not under `/api`.
const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api').replace(
  /\/api\/?$/,
  ''
);

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
 * right-sized WebP variant from `/share/<token>/preview?w=&fmt=webp` (backed by
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
  const uri = `${API_ORIGIN}/share/${shareToken}/preview?w=${width}&fmt=webp`;
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
