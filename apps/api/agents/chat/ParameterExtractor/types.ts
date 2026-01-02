/**
 * Type definitions for Parameter Extractor
 * Comprehensive interfaces for parameter extraction across all agent types
 */

import type { ChatContext } from '../types.js';

/**
 * Base extraction request
 */
export interface ExtractionRequest {
  /** User's message */
  message: string;
  /** Target agent name */
  agent: string;
  /** Chat context from conversation */
  context: ChatContext;
}

/**
 * Confidence metadata for extracted parameters
 */
export interface ParameterConfidence {
  [field: string]: number;
}

/**
 * Source metadata for extracted parameters
 */
export interface ParameterSources {
  [field: string]: 'mistral_ai' | 'regex' | 'context' | 'default';
}

/**
 * Base extracted parameters (common to all agents)
 */
export interface BaseParameters {
  /** Original user message */
  originalMessage: string;
  /** Chat context */
  chatContext: ChatContext;
  /** Confidence scores for parameters */
  _parameterConfidence?: ParameterConfidence;
  /** Sources for parameters */
  _parameterSources?: ParameterSources;
  /** Allow index signature for dynamic access */
  [key: string]: unknown;
}

/**
 * Social media parameters
 */
export interface SocialMediaParameters extends BaseParameters {
  /** Main theme */
  thema: string;
  /** Additional details */
  details: string;
  /** Target platforms */
  platforms: string[];
  /** What information (press releases) */
  was: string | null;
  /** How information (press releases) */
  wie: string | null;
  /** Quote author */
  zitatgeber: AuthorExtractionResult | null;
}

/**
 * Antrag/proposal parameters
 */
export interface AntragParameters extends BaseParameters {
  /** Main idea */
  idee: string;
  /** Additional details */
  details: string;
  /** Structure/outline */
  gliederung: string | null;
  /** Request type */
  requestType: 'default' | 'kleine_anfrage' | 'grosse_anfrage';
}

/**
 * Grüne Jugend parameters
 */
export interface GrueneJugendParameters extends BaseParameters {
  /** Main theme */
  thema: string;
  /** Additional details */
  details: string;
  /** Target platforms */
  platforms: string[];
}

/**
 * Leichte Sprache parameters
 */
export interface LeichteSpracheParameters extends BaseParameters {
  /** Original text to translate */
  originalText: string;
  /** Target language style */
  targetLanguage: string;
}

/**
 * Sharepic parameters (base)
 */
export interface SharepicParameters extends BaseParameters {
  /** Main theme */
  thema: string;
  /** Additional details */
  details: string;
  /** Sharepic type */
  type: string;
}

/**
 * Zitat (quote) sharepic parameters
 */
export interface ZitatParameters extends SharepicParameters {
  /** Quote author name */
  name: string;
}

/**
 * Dreizeilen (three-line) sharepic parameters
 */
export interface DreiZeilenParameters extends SharepicParameters {
  /** First line */
  line1?: string;
  /** Second line */
  line2?: string;
  /** Third line */
  line3?: string;
}

/**
 * Imagine (FLUX image generation) parameters
 */
export interface ImagineParameters extends BaseParameters {
  /** Generation mode */
  mode: 'pure' | 'sharepic' | 'edit';
  /** Image subject/description */
  subject: string | null;
  /** Style variant */
  variant: string | null;
  /** Whether variant was explicitly specified */
  variantExplicit: boolean;
  /** Title for sharepic mode */
  title: string | null;
  /** Edit action for edit mode */
  action: string | null;
}

/**
 * Universal text generation parameters
 */
export interface UniversalParameters extends BaseParameters {
  /** Text form (e.g., 'Tweet', 'Pressemitteilung') */
  textForm: string;
  /** Writing style/language */
  sprache: string;
  /** Main theme */
  thema: string;
  /** Additional details */
  details: string;
}

/**
 * Union type of all parameter types
 */
export type ExtractedParameters =
  | SocialMediaParameters
  | AntragParameters
  | GrueneJugendParameters
  | LeichteSpracheParameters
  | SharepicParameters
  | ZitatParameters
  | DreiZeilenParameters
  | ImagineParameters
  | UniversalParameters;

/**
 * Author extraction result
 */
export interface AuthorExtractionResult {
  /** Extracted author name */
  value: string | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extraction source */
  source: 'regex' | 'default';
}

/**
 * Three-line extraction result
 */
export interface LinesExtractionResult {
  /** First line */
  line1: string;
  /** Second line */
  line2: string;
  /** Third line */
  line3: string;
}

/**
 * Imagine variant detection result
 */
export interface VariantResult {
  /** Detected variant */
  variant: string | null;
  /** Whether variant was explicitly specified */
  explicit: boolean;
}

/**
 * Confidence analysis result
 */
export interface ConfidenceAnalysis {
  /** Whether all required fields are present */
  allRequiredPresent: boolean;
  /** Fields with low confidence */
  lowConfidenceFields: Array<{
    field: string;
    value: unknown;
    confidence: number;
    threshold: number;
  }>;
  /** Missing required fields */
  missingFields: string[];
}

/**
 * Mistral extraction response format
 */
export interface MistralExtractionResponse {
  /** Author name (for zitat) */
  author?: string | null;
  /** Main theme */
  theme?: string;
  /** Additional details */
  details?: string;
  /** Three lines (for dreizeilen) */
  lines?: {
    line1: string;
    line2: string;
    line3: string;
  };
  /** Confidence scores */
  confidence?: {
    author?: number;
    theme?: number;
  };
}

/**
 * Imagine variant keyword mapping
 */
export type ImagineVariantKeywords = Record<string, string>;
