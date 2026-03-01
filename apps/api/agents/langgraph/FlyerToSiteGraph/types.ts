import type { ExtractionResult } from '../../../services/OcrService/types.js';
import type { WebsiteContent } from '../../../types/routes.js';

export interface FlyerToSiteInput {
  pdfBuffer: Buffer;
  originalFilename: string;
  email?: string;
  req: any;
}

export interface FlyerContactInfo {
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
}

export interface FlyerAnalysis {
  name: string;
  politicalRole: string;
  region: string;
  themes: string[];
  slogans: string[];
  contactInfo: FlyerContactInfo;
  keyMessages: string[];
  rawDescription: string;
}

export interface FlyerToSiteState {
  // Input (immutable after initialization)
  pdfBuffer: Buffer;
  originalFilename: string;
  email: string;
  req: any;

  // extractNode output
  extractedText: string | null;
  extractionResult: ExtractionResult | null;
  extractTimeMs: number;

  // analyzeNode output
  flyerAnalysis: FlyerAnalysis | null;
  analyzeTimeMs: number;

  // generateNode output
  websiteContent: WebsiteContent | null;
  generateTimeMs: number;

  // selectImagesNode output
  websiteContentWithImages: WebsiteContent | null;
  imageTimeMs: number;

  // Timing
  startTime: number;
  error: string | null;
}

export interface FlyerToSiteOutput {
  success: boolean;
  json: WebsiteContent | null;
  metadata: {
    filename: string;
    extractTimeMs: number;
    analyzeTimeMs: number;
    generateTimeMs: number;
    imageTimeMs: number;
    totalTimeMs: number;
    ocrMethod: string;
    extractedTextLength: number;
  };
  error?: string;
}
