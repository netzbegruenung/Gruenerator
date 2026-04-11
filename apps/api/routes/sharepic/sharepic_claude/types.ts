import type { Request, Response } from 'express';
import type { AIWorkerPool, AIRequestData as AIWorkerPayload, AIWorkerResult } from '../../../workers/types.js';

export type { AIWorkerPool, AIWorkerPayload, AIWorkerResult };

export interface SharepicRequest extends Request {
  body: SharepicRequestBody;
  app: Request['app'] & {
    locals: {
      aiWorkerPool: AIWorkerPool;
    };
  };
}

export interface SharepicRequestBody {
  type?: string | undefined;
  thema?: string | undefined;
  details?: string | undefined;
  line1?: string | undefined;
  line2?: string | undefined;
  line3?: string | undefined;
  count?: number | undefined;
  smartCount?: boolean | undefined;
  source?: string | undefined;
  quote?: string | undefined;
  name?: string | undefined;
  preserveName?: boolean | undefined;
  _campaignPrompt?: PromptConfig | undefined;
  [key: string]: unknown;
}

export interface PromptConfig {
  systemRole: string;
  requestTemplate?: string | undefined;
  singleItemTemplate?: string | undefined;
  alternativesTemplate?: string | undefined;
  options?: Record<string, unknown> | undefined;
  alternativesOptions?: Record<string, unknown> | undefined;
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
  searchTerms?: string[] | undefined;
  error?: string | undefined;
  debug?: Record<string, unknown> | undefined;
}

export interface ZitatResponse {
  success: boolean;
  quote?: string | undefined;
  alternatives?: Array<{ quote: string }>;
  name?: string | undefined;
  error?: string | undefined;
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
  searchTerms?: string[] | undefined;
  error?: string | undefined;
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
  searchTerms?: string[] | undefined;
  error?: string | undefined;
}

export interface DefaultResponse {
  success: boolean;
  sharepics?: unknown[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  error?: string | undefined;
}

export type SharepicHandler = (req: SharepicRequest, res: Response) => Promise<void>;
