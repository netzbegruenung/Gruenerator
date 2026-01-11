import type { Request, Response } from 'express';

export interface AIWorkerPool {
  processRequest(payload: AIWorkerPayload, req: Request): Promise<AIWorkerResult>;
}

export interface AIWorkerPayload {
  type: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  options?: Record<string, unknown>;
}

export interface AIWorkerResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface SharepicRequest extends Request {
  body: SharepicRequestBody;
  app: Request['app'] & {
    locals: {
      aiWorkerPool: AIWorkerPool;
    };
  };
}

export interface SharepicRequestBody {
  type?: string;
  thema?: string;
  details?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  count?: number;
  source?: string;
  quote?: string;
  name?: string;
  preserveName?: boolean;
  _campaignPrompt?: PromptConfig;
}

export interface PromptConfig {
  systemRole: string;
  requestTemplate?: string;
  singleItemTemplate?: string;
  alternativesTemplate?: string;
  options?: Record<string, unknown>;
  alternativesOptions?: Record<string, unknown>;
}

export interface DreizeilenResponse {
  success: boolean;
  mainSlogan?: {
    line1: string;
    line2: string;
    line3: string;
  };
  alternatives?: Array<{
    line1: string;
    line2: string;
    line3: string;
  }>;
  searchTerms?: string[];
  error?: string;
  debug?: Record<string, unknown>;
}

export interface ZitatResponse {
  success: boolean;
  quote?: string;
  alternatives?: Array<{ quote: string }>;
  name?: string;
  error?: string;
}

export interface InfoResponse {
  success: boolean;
  mainInfo?: {
    header: string;
    subheader: string;
    body: string;
  };
  alternatives?: Array<{
    header: string;
    subheader: string;
    body: string;
  }>;
  searchTerms?: string[];
  error?: string;
}

export interface EventResponse {
  success: boolean;
  mainEvent?: {
    eventTitle: string;
    beschreibung: string;
    weekday: string;
    date: string;
    time: string;
    locationName: string;
    address: string;
  };
  alternatives?: Array<{
    eventTitle: string;
    beschreibung: string;
    weekday: string;
    date: string;
    time: string;
    locationName: string;
    address: string;
  }>;
  searchTerms?: string[];
  error?: string;
}

export interface DefaultResponse {
  success: boolean;
  sharepics?: unknown[];
  metadata?: Record<string, unknown>;
  error?: string;
}

export type SharepicHandler = (req: SharepicRequest, res: Response) => Promise<void>;
