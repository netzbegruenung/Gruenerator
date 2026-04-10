import type { Request } from 'express';

// Note: User type is provided by Express.User through global type augmentation in types/express.d.ts
// The Request.user property is already defined there with the proper UserProfileShape

export interface SharepicRequest extends Request {
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
  systemPrompt?: string | undefined;
  messages?: Array<{ role: string; content: string }>;
  options?: {
    max_tokens?: number | undefined;
    temperature?: number | undefined;
  };
  usePrivacyMode?: boolean | undefined;
}

export interface AIWorkerResult {
  success: boolean;
  content?: string | undefined;
  error?: string | undefined;
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
  credit?: string | undefined;
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
  originalImageData?: string | undefined;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EditSessionResponse {
  sessionId?: string | undefined;
  expiresIn?: number | undefined;
  imageData?: string | undefined;
  originalImageData?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt?: string | undefined;
  deleted?: boolean | undefined;
  error?: string | undefined;
}

export interface SharepicGenerateRequest {
  description: string;
  templateId?: string | undefined;
  content?: Record<string, unknown> | undefined;
  useAI?: boolean | undefined;
  skipCache?: boolean | undefined;
}

export interface SharepicVariantsRequest {
  description: string;
  count?: number | undefined;
}

export interface SharepicEditRequest {
  layoutPlan: Record<string, unknown>;
  editRequest: string;
}

export interface LayoutPlan {
  templateId: string;
  analysis?: {
    category?: string | undefined;
  };
  [key: string]: unknown;
}

export interface InfoData {
  header: string;
  subheader: string;
  body: string;
  searchTerm?: string | undefined;
}

export interface EventData {
  eventTitle: string;
  beschreibung?: string | undefined;
  weekday: string;
  date: string;
  time: string;
  locationName: string;
  address?: string | undefined;
  searchTerm?: string | undefined;
}

export interface QuoteData {
  quote: string;
  name?: string | undefined;
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
    max_tokens?: number | undefined;
    temperature?: number | undefined;
  };
}

export interface CanvasResult {
  image: string;
  creditText?: string | undefined;
}
