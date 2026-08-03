// Shared types for provider system

/**
 * Abgeleitet, nicht neu deklariert.
 *
 * Bis 01.08.2026 stand hier eine eigene Kopie der Liste. Sie fiel erst auf, als
 * `services/ai/providers.ts` um `'scaleway'` wuchs und der Compiler die beiden
 * Typen nicht mehr ineinander schieben konnte — vorher waren sie zufällig
 * gleich, also unsichtbar auseinanderdriftbar. CLAUDE.md verlangt genau das
 * hier: Konsumenten leiten ab und deklarieren nie neu.
 */
export type { ProviderName } from '../ai/providers.js';
import type { ProviderName } from '../ai/providers.js';

export type ModelName = string;

export interface ProviderOptions {
  provider?: ProviderName | undefined;
  model?: ModelName | undefined;
  explicitProvider?: ProviderName | undefined;
}

export interface RequestMetadata {
  [key: string]: unknown;
}

export interface ProviderResult {
  provider: ProviderName;
  model: ModelName;
}

export interface FallbackProviderData {
  type?: string | undefined;
  options: ProviderOptions;
  [key: string]: unknown;
}

export type ProviderExecutor = (
  providerName: ProviderName,
  data: FallbackProviderData
) => Promise<ExecutionResponse>;

export interface ExecutionResponse {
  content?: unknown | undefined;
  stop_reason?: string | undefined;
  [key: string]: unknown;
}
