/**
 * Sharepic Types
 * Shared type definitions for sharepic generation across web and mobile.
 */

/** Available sharepic types */
export type SharepicType = 'default' | 'dreizeilen' | 'quote' | 'quote_pure' | 'info';

/** Sharepic type option for UI display */
export interface SharepicTypeOption {
  id: SharepicType;
  label: string;
  shortLabel: string;
  supportsImage: boolean;
  requiresAuthor: boolean;
}

/** Attachment for sharepic request (image data) */
export interface SharepicAttachment {
  type: string; // MIME type (e.g., 'image/jpeg')
  data: string; // base64 data URL
}

/** Request payload for sharepic generation */
export interface SharepicRequest {
  /** Backend type identifier */
  type: string;
  /** Main content/theme for the sharepic */
  thema: string;
  /** Additional details */
  details?: string;
  /** Author name for quote types */
  name?: string;
  /** Image attachments */
  attachments?: SharepicAttachment[];
  /** Enable privacy mode */
  usePrivacyMode?: boolean;
  /** Enable Bedrock/Pro mode */
  useBedrock?: boolean;
}

/** Options for the useSharepicGeneration hook */
export interface SharepicGenerationOptions {
  /** Sharepic type to generate */
  type: SharepicType;
  /** Main content/theme */
  thema: string;
  /** Additional details */
  details?: string;
  /** Author name for quote types */
  author?: string;
  /** Base64 image data (for dreizeilen, quote types) */
  imageData?: string;
  /** Enable privacy mode */
  usePrivacyMode?: boolean;
  /** Enable Pro mode */
  useProMode?: boolean;
}

/** Single sharepic result from generation */
export interface SharepicResult {
  /** Generated image as base64 PNG data URL */
  image: string;
  /** Generated text content */
  text: string;
  /** Sharepic type that was generated */
  type: string;
  /** Original background image (for editing) */
  originalImage?: string;
  /** Alternative text suggestions */
  alternatives?: { text: string }[];
  /** Unique identifier */
  id?: string;
  /** Creation timestamp */
  createdAt?: string;
}

/** Response from default sharepics endpoint (3 auto-generated) */
export interface DefaultSharepicsResponse {
  success: boolean;
  sharepics: SharepicResult[];
}

/** Response from single sharepic endpoint */
export interface SharepicResponse {
  success: boolean;
  image: string;
  text: string;
  type: string;
  originalImage?: string;
  alternatives?: { text: string }[];
  error?: string;
}
