/**
 * Sharepic Service Types
 *
 * Type definitions for sharepic generation services
 */

import type { Request } from 'express';

/**
 * Default sharepic with metadata
 */
export interface DefaultSharepic {
  id: string;
  createdAt: string;
  [key: string]: any; // Additional sharepic properties from chat service
}

/**
 * Metadata for default sharepic generation
 */
export interface DefaultSharepicMetadata {
  generationType: 'default';
  generatedCount: number;
  types: string[];
  timestamp: string;
}

/**
 * Result from generating default sharepics
 */
export interface DefaultSharepicResult {
  success: boolean;
  sharepics: DefaultSharepic[];
  metadata: DefaultSharepicMetadata;
}

/**
 * Request body for sharepic generation
 */
export interface SharepicRequestBody {
  thema?: string;
  details?: string;
  name?: string;
  preserveName?: boolean;
  [key: string]: any; // Additional properties
}
