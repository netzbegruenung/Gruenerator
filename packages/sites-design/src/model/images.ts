export const SITE_IMAGE_WIDTHS = [400, 800, 1200, 2160] as const;
export type SiteImageWidth = (typeof SITE_IMAGE_WIDTHS)[number];
export type SiteImageSlot = 'portrait' | 'banner' | 'card' | 'tile' | 'backdrop';

const MEDIA_PREVIEW = /^(\/api\/share\/[A-Za-z0-9_-]{6,128}\/preview)$/;

export function sizedSrc(url: string, width: SiteImageWidth, format: 'webp' | 'avif'): string {
  const match = MEDIA_PREVIEW.exec(url);
  return match ? `${match[1]}?w=${width}&fmt=${format}` : url;
}

export interface SiteImageAttrs {
  src: string;
  srcSet: string | null;
  sizes: string;
  width: number;
  height: number;
  loading: 'eager' | 'lazy';
  fetchPriority: 'high' | 'auto';
}

interface SlotSpec {
  widths: readonly SiteImageWidth[];
  src: SiteImageWidth;
  sizes: string;
  width: number;
  height: number;
  loading: 'eager' | 'lazy';
  fetchPriority: 'high' | 'auto';
}

const SLOTS: Record<SiteImageSlot, SlotSpec> = {
  portrait: {
    widths: [400, 800, 1200],
    src: 800,
    sizes: '(min-width: 64rem) 30rem, (min-width: 48rem) 42vw, 100vw',
    width: 800,
    height: 1000,
    loading: 'eager',
    fetchPriority: 'high',
  },
  banner: {
    widths: [800, 1200, 2160],
    src: 1200,
    sizes: '100vw',
    width: 1200,
    height: 675,
    loading: 'lazy',
    fetchPriority: 'auto',
  },
  card: {
    widths: [400, 800],
    src: 800,
    sizes: '(min-width: 64rem) 22rem, (min-width: 48rem) 46vw, 85vw',
    width: 800,
    height: 500,
    loading: 'lazy',
    fetchPriority: 'auto',
  },
  tile: {
    widths: [400, 800],
    src: 800,
    sizes: '(min-width: 64rem) 22rem, (min-width: 40rem) 46vw, 100vw',
    width: 800,
    height: 1000,
    loading: 'lazy',
    fetchPriority: 'auto',
  },
  backdrop: {
    widths: [800, 1200, 2160],
    src: 1200,
    sizes: '100vw',
    width: 1200,
    height: 800,
    loading: 'lazy',
    fetchPriority: 'auto',
  },
};

export function siteImageAttrs(url: string, slot: SiteImageSlot): SiteImageAttrs | null {
  if (url === '') return null;
  const spec = SLOTS[slot];
  const sized = MEDIA_PREVIEW.test(url);
  return {
    src: sizedSrc(url, spec.src, 'webp'),
    srcSet: sized ? spec.widths.map((w) => `${sizedSrc(url, w, 'webp')} ${w}w`).join(', ') : null,
    sizes: spec.sizes,
    width: spec.width,
    height: spec.height,
    loading: spec.loading,
    fetchPriority: spec.fetchPriority,
  };
}
