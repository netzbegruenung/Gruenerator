import type { Request, Response } from 'express';

export interface User {
  id: string;
  email?: string;
  locale?: string;
}

export interface SharepicRequest extends Request {
  user?: User;
  app: Request['app'] & {
    locals: {
      aiWorkerPool?: {
        processRequest: (payload: AIWorkerPayload, req: Request) => Promise<AIWorkerResult>;
      };
    };
  };
}

export interface AIWorkerPayload {
  type: string;
  systemPrompt?: string;
  messages?: Array<{ role: string; content: string }>;
  options?: {
    max_tokens?: number;
    temperature?: number;
  };
  usePrivacyMode?: boolean;
}

export interface AIWorkerResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface SharepicColors {
  background: string;
  text: string;
}

export interface DreizeilenParams {
  balkenGruppenOffset: [number, number];
  fontSize: number;
  colors: SharepicColors[];
  balkenOffset: number[];
  sunflowerOffset: [number, number];
  sunflowerPosition: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  credit?: string;
}

export interface TextLine {
  text: string;
}

export interface Slogan {
  line1: string;
  line2: string;
  line3: string;
}

export interface EditSessionData {
  imageData: string;
  originalImageData?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EditSessionResponse {
  sessionId?: string;
  expiresIn?: number;
  imageData?: string;
  originalImageData?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  deleted?: boolean;
  error?: string;
}

export interface SharepicGenerateRequest {
  description: string;
  templateId?: string;
  content?: Record<string, unknown>;
  useAI?: boolean;
  skipCache?: boolean;
}

export interface SharepicVariantsRequest {
  description: string;
  count?: number;
}

export interface SharepicEditRequest {
  layoutPlan: Record<string, unknown>;
  editRequest: string;
}

export interface LayoutPlan {
  templateId: string;
  analysis?: {
    category?: string;
  };
  [key: string]: unknown;
}

export interface InfoData {
  header: string;
  subheader: string;
  body: string;
  searchTerm?: string;
}

export interface EventData {
  eventTitle: string;
  beschreibung?: string;
  weekday: string;
  date: string;
  time: string;
  locationName: string;
  address?: string;
  searchTerm?: string;
}

export interface QuoteData {
  quote: string;
  name?: string;
}

export type SharepicType =
  | 'default'
  | 'dreizeilen'
  | 'zitat'
  | 'zitat_pure'
  | 'headline'
  | 'info'
  | 'veranstaltung';

export interface CampaignConfig {
  systemRole: string;
  singleItemTemplate: string;
  requestTemplate: string;
  options: {
    max_tokens?: number;
    temperature?: number;
  };
}

export interface CanvasResult {
  image: string;
  creditText?: string;
}
