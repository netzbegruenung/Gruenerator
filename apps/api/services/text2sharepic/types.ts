/**
 * Text2Sharepic Types
 *
 * Type definitions for sharepic component library
 */

import type { CanvasRenderingContext2D } from 'canvas';

/**
 * Component parameter definition
 */
export interface ComponentParameter {
  type: 'string' | 'number' | 'boolean' | 'color' | 'file' | 'array';
  description?: string;
  default?: any;
  required?: boolean;
  min?: number;
  max?: number;
  options?: string[];
}

/**
 * Bounds for component positioning
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Component definition
 */
export interface ComponentDefinition {
  type: string;
  description: string;
  category: 'background' | 'text' | 'decoration' | 'balken' | 'container';
  parameters: Record<string, ComponentParameter>;
  render: (
    ctx: CanvasRenderingContext2D,
    params: Record<string, any>,
    bounds: Bounds
  ) => Promise<boolean | null>;
  registeredAt?: number;
}

/**
 * Corporate design constants
 */
export interface CorporateDesign {
  colors: {
    tanne: string;
    klee: string;
    grashalm: string;
    sand: string;
    white: string;
    black: string;
    zitatBg: string;
    [key: string]: string;
  };
  fonts: {
    primary: string;
    secondary: string;
    secondaryBold: string;
  };
  spacing: {
    small: number;
    medium: number;
    large: number;
    xlarge: number;
  };
}

/**
 * Wrapped text line
 */
export interface WrappedTextLine {
  text: string;
  width: number;
}

/**
 * Canvas dimensions
 */
export interface CanvasDimensions {
  width: number;
  height: number;
}

/**
 * Zone definition in a template
 */
export interface Zone {
  name: string;
  x: number | string; // Can be percentage or absolute
  y: number | string;
  width: number | string;
  height: number | string;
  allowedComponents: string[];
  required: boolean;
  multiLine?: boolean;
  maxLines?: number;
}

/**
 * Zone with calculated bounds
 */
export interface ZoneWithBounds extends Zone {
  bounds: Bounds;
}

/**
 * Zone template definition
 */
export interface ZoneTemplate {
  id: string;
  name: string;
  description: string;
  category: 'statement' | 'quote' | 'information' | 'mixed' | 'slogan' | 'campaign' | 'story';
  dimensions: CanvasDimensions;
  bestFor: string[];
  zones: Zone[];
  registeredAt?: number;
}

/**
 * Template list item (summary)
 */
export interface TemplateListItem {
  id: string;
  name: string;
  description: string;
  dimensions: CanvasDimensions;
  category: string;
  zones: string[];
}

/**
 * Component placement validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Parameter validation result
 */
export interface ParamsValidationResult {
  params: Record<string, any>;
  warnings: string[];
}

/**
 * Zone validation result
 */
export interface ZoneValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  corrected: ZoneConfig | null;
}

/**
 * Layout validation result
 */
export interface LayoutValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  corrected: LayoutPlan | null;
}

/**
 * AI output validation result
 */
export interface AIOutputValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  corrected: {
    generatedText: GeneratedText;
    layout: LayoutPlan;
  } | null;
}

/**
 * Text validation result
 */
export interface TextValidationResult {
  valid: boolean;
  warnings: string[];
}

/**
 * Numeric constraints
 */
export interface NumericConstraint {
  min: number;
  max: number;
}

// ============================================================================
// Layout Planner Types
// ============================================================================

/**
 * Intent category for layout planning
 */
export type IntentCategory =
  | 'quote'
  | 'quotePure'
  | 'slogan'
  | 'headerBalken'
  | 'info'
  | 'event'
  | 'announcement'
  | 'story'
  | 'statement';

/**
 * Mood for color scheme selection
 */
export type Mood = 'serious' | 'energetic' | 'warm' | 'fresh' | 'contrast';

/**
 * Format type for sharepics
 */
export type FormatType = 'portrait' | 'story' | 'landscape' | 'square';

/**
 * Analysis result from description parsing
 */
export interface AnalysisResult {
  category: IntentCategory;
  mood: Mood;
  format: FormatType;
  wantsImage: boolean;
  wantsGradient: boolean;
  originalDescription: string;
}

/**
 * Background configuration
 */
export interface BackgroundConfig {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  colorStart?: string;
  colorEnd?: string;
  overlayColor?: string;
  overlayOpacity?: number;
}

/**
 * Color scheme for layout
 */
export interface ColorScheme {
  background: BackgroundConfig;
  text: string;
  accent: string;
  primary: string;
  secondary: string;
}

/**
 * Extracted content from description
 */
export interface ExtractedContent extends GeneratedText {
  mainText: string;
  credit: string;
}

/**
 * Options for layout generation
 */
export interface GenerateLayoutOptions {
  templateId?: string;
}

/**
 * Layout planner validation result (extends base ValidationResult)
 */
export interface LayoutPlannerValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Layout plan for rendering
 */
export interface LayoutPlan {
  templateId: string;
  dimensions: CanvasDimensions;
  zones: ZoneConfig[];
  content?: GeneratedText;
  analysis?: AnalysisResult | { category?: string; aiGenerated?: boolean; [key: string]: any };
  colorScheme?: ColorScheme;
  metadata?: {
    generatedAt: number;
    description: string;
    category: string;
    aiGenerated?: boolean;
  };
}

/**
 * Zone configuration in a layout plan
 */
export interface ZoneConfig {
  zoneName: string;
  component?: string;
  params?: Record<string, any>;
}

/**
 * Generated text content
 */
export interface GeneratedText {
  headline?: string;
  mainText?: string;
  quote?: string;
  body?: string;
  subText?: string;
  footer?: string;
  attribution?: string;
  lines?: string[];
}

/**
 * SharepicComposer options
 */
export interface SharepicComposerOptions {
  redis?: any;
  claudeApiHelper?: any;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

/**
 * Generation options
 */
export interface GenerationOptions {
  skipCache?: boolean;
  useAI?: boolean;
  content?: GeneratedText;
  templateId?: string;
  contentType?: string;
  backgroundColor?: string;
  [key: string]: any;
}

/**
 * Rendered sharepic result
 */
export interface SharepicResult {
  image: string; // Data URL
  width: number;
  height: number;
  format: string;
  size: number;
  layoutPlan?: LayoutPlan;
  generatedText?: GeneratedText;
  aiGenerated?: boolean;
  edited?: boolean;
  fromCache?: boolean;
  validationWarnings?: string[];
  fallbackReason?: string;
  generationTime?: number;
  imageSelection?: any;
  variantId?: number;
  templateId?: string;
}
