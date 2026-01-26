/**
 * Shared type definitions for image services
 */

// ============================================================================
// ImageSelectionService Types
// ============================================================================

export interface ImageCatalogEntry {
  filename: string;
  category: string;
  tags: string[];
  alt_text: string;
}

export interface ImageCatalog {
  images: ImageCatalogEntry[];
}

export interface ImageSelectionOptions {
  sharepicType?: string;
  maxCandidates?: number;
}

export interface ImageSelectionResult {
  selectedImage: ImageCatalogEntry;
  confidence: number;
  reasoning: string;
  alternatives: ImageCatalogEntry[];
  metadata: {
    totalImages: number;
    candidatesFound: number;
    themes: string[];
    keywords: string[];
    processingMethod: string;
  };
}

export interface ImageSelectionServiceStats {
  serviceName: string;
  method: string;
  initialized: boolean;
}

// ============================================================================
// TemporaryImageStorage Types
// ============================================================================

export interface ImageAttachment {
  type: string;
  data: string;
  name?: string;
  size?: number;
  source?: string;
}

export interface ImageStorageSession {
  userId: string;
  timestamp: number;
  key: string;
  imageName: string;
}

export interface ImageStorageStats {
  totalActiveSessions: number;
  oldestSession: number | null;
  sessionsOlderThan1Min: number;
  sessionsOlderThan2Min: number;
}

// ============================================================================
// ImagineCanvasRenderer Types
// ============================================================================

export interface VariantConfig {
  name: string;
  textArea: {
    y: number;
    height: number;
  };
  defaultTextColor: string;
}

export type ImagineVariant =
  | 'light-top'
  | 'green-bottom'
  | 'realistic-top'
  | 'realistic-bottom'
  | 'pixel-top'
  | 'pixel-bottom'
  | 'editorial';

export interface ImagineComposeOptions {
  title: string;
  titleColor?: string;
  variant?: ImagineVariant;
  outputWidth?: number;
  outputHeight?: number;
}

export interface BrandColors {
  TANNE: string;
  SAND: string;
  WHITE: string;
  KLEE: string;
}

export interface GradientConfig {
  direction: 'top' | 'bottom' | 'center';
  startY?: number;
  endY?: number;
  centerY?: number;
  spread?: number;
  opacity: number;
}

export interface BarConfig {
  y: number;
  height: number;
  color: string;
}

export interface TemplateConfig {
  imageArea?: {
    y: number;
    height: number;
  };
  textArea: {
    y: number;
    height: number;
  };
  defaultTextColor: string;
}

// ============================================================================
// UnsplashAttribution Types
// ============================================================================

export interface UnsplashParsedFilename {
  photographerSlug: string;
  photoId: string;
}

export interface UnsplashUrls {
  profileUrl: string;
  photoUrl: string;
}

export interface UnsplashAttribution {
  photographer: string;
  photographerSlug: string;
  photoId: string;
  profileUrl: string;
  photoUrl: string;
  license: string;
  downloadLocation?: string;
}

export interface ImageWithAttribution {
  filename: string;
  path: string;
  attribution: UnsplashAttribution | { photographer: string; license: string };
  [key: string]: any;
}
