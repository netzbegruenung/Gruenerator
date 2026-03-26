// Derived from Presenton (Apache-2.0) — https://github.com/presenton/presenton

import { type z } from 'zod/v4';

export interface ImageData {
  __image_url__: string;
  __image_prompt__: string;
}

export interface IconData {
  __icon_url__: string;
  __icon_query__: string;
}

export interface Slide {
  id: string;
  presentationId: string;
  index: number;
  layoutGroup: string;
  layout: string;
  content: Record<string, unknown>;
  speakerNote: string | null;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Presentation {
  id: string;
  title: string;
  userId: string;
  language: string;
  theme: PresentationTheme;
  template: string;
  permissions: Record<string, PermissionEntry>;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationTheme {
  primaryColor?: string;
  backgroundColor?: string;
  backgroundText?: string;
  primaryText?: string;
  cardColor?: string;
  stroke?: string;
  headingFontFamily?: string;
}

export interface PermissionEntry {
  level: 'owner' | 'editor' | 'viewer';
  granted_at: string;
  granted_by?: string;
}

export interface PresentationWithSlides extends Presentation {
  slides: Slide[];
}

export interface LayoutRegistryEntry {
  component: React.ComponentType<{ data?: Record<string, unknown> }>;
  schema: z.ZodType;
  layoutId: string;
  layoutName: string;
  layoutDescription: string;
  layoutGroup: string;
  sampleData: Record<string, unknown>;
}

export type GenerationTone =
  | 'default'
  | 'casual'
  | 'professional'
  | 'funny'
  | 'educational'
  | 'sales_pitch';

export type GenerationVerbosity = 'concise' | 'standard' | 'text-heavy';

export type ExportFormat = 'pptx' | 'pdf';

export interface GeneratePresentationRequest {
  content: string;
  slidesMarkdown?: string[] | null;
  instructions?: string | null;
  tone?: GenerationTone;
  verbosity?: GenerationVerbosity;
  webSearch?: boolean;
  nSlides?: number;
  language?: string;
  template?: string;
  includeTableOfContents?: boolean;
  includeTitleSlide?: boolean;
  exportAs?: ExportFormat;
}

export interface GeneratePresentationResponse {
  presentationId: string;
  path: string;
  editPath: string;
}
