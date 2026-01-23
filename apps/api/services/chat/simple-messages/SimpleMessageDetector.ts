/**
 * Simple Message Detector
 * Detects simple greetings and common messages to provide quick responses
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import type { SimpleMessagesConfig, SimpleMessageDetectionResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SimpleMessageDetector {
  private configCache: SimpleMessagesConfig | null = null;

  /**
   * Load configuration from JSON file
   */
  private loadConfig(): SimpleMessagesConfig {
    if (this.configCache) return this.configCache;

    const configPath = join(__dirname, '../../../prompts/simpleMessages.json');
    this.configCache = JSON.parse(readFileSync(configPath, 'utf-8')) as SimpleMessagesConfig;
    return this.configCache;
  }

  /**
   * Detect if a message is a simple greeting or common phrase
   */
  detectSimpleMessage(message: string): SimpleMessageDetectionResult {
    const config = this.loadConfig();
    const normalized = message.toLowerCase().trim();

    for (const [category, categoryConfig] of Object.entries(config.categories)) {
      if (normalized.length > categoryConfig.maxLength) continue;

      for (const patternStr of categoryConfig.patterns) {
        const pattern = new RegExp(patternStr, 'i');
        if (pattern.test(normalized)) {
          return { isSimple: true, category, confidence: 1.0 };
        }
      }
    }

    return { isSimple: false };
  }

  /**
   * Generate a simple response for a detected category
   */
  generateSimpleResponse(category: string, locale: string = 'de-DE'): string | null {
    const config = this.loadConfig();
    const categoryConfig = config.categories[category];
    if (!categoryConfig) return null;

    const responses =
      categoryConfig.responses[locale] || categoryConfig.responses[config.defaultLocale];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Expose config loader for external use
   */
  getConfig(): SimpleMessagesConfig {
    return this.loadConfig();
  }
}

// Export singleton instance
export const simpleMessageDetector = new SimpleMessageDetector();

// Export named functions for backward compatibility
export const detectSimpleMessage = (message: string) =>
  simpleMessageDetector.detectSimpleMessage(message);

export const generateSimpleResponse = (category: string, locale: string = 'de-DE') =>
  simpleMessageDetector.generateSimpleResponse(category, locale);

export const loadConfig = () => simpleMessageDetector.getConfig();
