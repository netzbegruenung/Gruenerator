/**
 * Generator Types
 * Shared TypeScript interfaces for text generators across web and mobile platforms.
 */

// Platform type for PresseSocial generator
export type SocialPlatform =
  | 'pressemitteilung'
  | 'instagram'
  | 'facebook'
  | 'twitter'
  | 'linkedin'
  | 'sharepic'
  | 'actionIdeas'
  | 'reelScript';

// Request type for Antrag generator
export type AntragRequestType = 'antrag' | 'kleine_anfrage' | 'grosse_anfrage';

// Text type for Universal generator
export type UniversalTextType = 'universal' | 'rede' | 'wahlprogramm' | 'buergeranfragen';

// Accessibility mode type
export type AccessibilityMode = 'alt-text' | 'leichte-sprache';

// Text improver action type
export type TextImproverAction = 'improve' | 'rewrite' | 'summarize' | 'spellcheck' | 'formalize' | 'simplify';

// Feature toggles shared across all generators
export interface GeneratorFeatures {
  useWebSearchTool?: boolean;
  usePrivacyMode?: boolean;
  useProMode?: boolean;
  useUltraMode?: boolean;
  useBedrock?: boolean;
}

// File attachment
export interface Attachment {
  type: 'file' | 'url';
  name?: string;
  content?: string;
  url?: string;
  mimeType?: string;
}

// Base request payload shared by all generators
export interface BaseGeneratorRequest extends GeneratorFeatures {
  inhalt: string;
  customPrompt?: string;
  selectedDocumentIds?: string[];
  selectedTextIds?: string[];
  searchQuery?: string;
  attachments?: Attachment[];
}

// PresseSocial generator request
export interface PresseSocialRequest extends BaseGeneratorRequest {
  platforms: SocialPlatform[];
  zitatgeber?: string;
  presseabbinder?: string;
}

// Antrag generator request
export interface AntragRequest extends BaseGeneratorRequest {
  requestType: AntragRequestType;
  gliederung?: string;
}

// Universal generator request (supports multiple text types)
export interface UniversalRequest extends BaseGeneratorRequest {
  textType: UniversalTextType;
  // Universal-specific
  textForm?: string;
  sprache?: string;
  // Rede-specific
  rolle?: string;
  thema?: string;
  zielgruppe?: string;
  schwerpunkte?: string;
  redezeit?: number;
  // Wahlprogramm-specific
  zeichenanzahl?: number;
  // Bürgeranfragen-specific
  gremium?: string;
  anliegen?: string;
  antwortart?: string[];
  kontext?: string;
}

// API response with generated content
export interface GeneratorResponse {
  content: string;
  metadata?: {
    title?: string;
    tokens?: number;
    model?: string;
    [key: string]: unknown;
  };
}

// Result wrapper with success/error state
export interface GeneratorResult {
  success: boolean;
  data?: GeneratorResponse;
  error?: string;
}

// Error information
export interface GeneratorError {
  message: string;
  code?: string;
  isRetryable: boolean;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

// Alt-Text generator request
export interface AltTextRequest {
  imageBase64: string;
  imageDescription?: string;
  usePrivacyMode?: boolean;
}

// Alt-Text generator response
export interface AltTextResponse {
  altText: string;
  metadata?: Record<string, unknown>;
}

// Leichte Sprache generator request
export interface LeichteSpracheRequest extends BaseGeneratorRequest {
  originalText: string;
  targetLanguage?: string;
}

// Text Improver generator request
export interface TextImproverRequest extends BaseGeneratorRequest {
  originalText: string;
  action: TextImproverAction;
}
