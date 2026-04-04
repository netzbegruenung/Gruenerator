import { describe, it, expect, beforeAll } from 'vitest';

import { isProviderConfigured } from '../../ai/providers.js';
import { isVisionCapable, getAvailableModels } from '../../ai/modelDiscovery.js';
import { executeProvider } from '../../../workers/providers/index.js';

const HAS_REGOLO = !!process.env.REGOLO_API_KEY;

// A tiny 1x1 red PNG pixel as base64
const TINY_RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// ─── Unit tests (no API key required) ────────────────────────────────────

describe('Vision — unit tests', () => {
  describe('isVisionCapable', () => {
    it('returns true for known vision models', () => {
      expect(isVisionCapable('qwen3-vl-32b')).toBe(true);
      expect(isVisionCapable('pixtral-large-latest')).toBe(true);
    });

    it('returns false for non-vision models', () => {
      expect(isVisionCapable('qwen3.5-122b')).toBe(false);
      expect(isVisionCapable('mistral-large-2512')).toBe(false);
      expect(isVisionCapable('gpt-oss-120b')).toBe(false);
    });

    it('returns false for unknown model IDs', () => {
      expect(isVisionCapable('nonexistent-model-999')).toBe(false);
    });
  });

  describe('VisionService import and structure', () => {
    it('exports visionService singleton', async () => {
      const { visionService } = await import('../index.js');
      expect(visionService).toBeDefined();
      expect(typeof visionService.analyzeImage).toBe('function');
      expect(typeof visionService.describeImage).toBe('function');
      expect(typeof visionService.detectTextContent).toBe('function');
      expect(typeof visionService.analyzeWithOcr).toBe('function');
      expect(typeof visionService.generateAltText).toBe('function');
    });
  });
});

// ─── Regolo adapter multimodal tests (no API call, tests message conversion) ─

describe('Regolo adapter — multimodal message handling', () => {
  it('preserves image content in Anthropic format via executeProvider', async () => {
    if (!HAS_REGOLO) {
      expect(true).toBe(true);
      return;
    }

    const result = await executeProvider('regolo', 'test-vision-anthropic-format', {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What color is this pixel? Answer in one word.' },
            {
              type: 'image',
              source: {
                type: 'base64',
                data: TINY_RED_PNG,
                media_type: 'image/png',
              },
            },
          ] as any,
        },
      ],
      type: 'vision-test',
      options: { max_tokens: 50, model: 'qwen3-vl-32b', temperature: 0.1 },
      metadata: {},
    });

    expect(result.success).toBe(true);
    expect(result.content).toBeTruthy();
    expect(result.metadata?.provider).toBe('regolo');
  }, 30000);

  it('preserves image_url content format via executeProvider', async () => {
    if (!HAS_REGOLO) {
      expect(true).toBe(true);
      return;
    }

    const dataUrl = `data:image/png;base64,${TINY_RED_PNG}`;

    const result = await executeProvider('regolo', 'test-vision-imageurl-format', {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What color is this pixel? Answer in one word.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] as any,
        },
      ],
      type: 'vision-test',
      options: { max_tokens: 50, model: 'qwen3-vl-32b', temperature: 0.1 },
      metadata: {},
    });

    expect(result.success).toBe(true);
    expect(result.content).toBeTruthy();
    expect(result.metadata?.provider).toBe('regolo');
  }, 30000);

  it('falls back to text-only for non-image content arrays', async () => {
    if (!HAS_REGOLO) {
      expect(true).toBe(true);
      return;
    }

    const result = await executeProvider('regolo', 'test-text-array', {
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Say just "OK"' }] as any,
        },
      ],
      type: 'text-test',
      options: { max_tokens: 50, model: 'qwen3-vl-32b', temperature: 0.1 },
      metadata: {},
    });

    expect(result.success).toBe(true);
    expect(result.content).toBeTruthy();
  }, 30000);
});

// ─── VisionService integration tests (requires REGOLO_API_KEY) ───────────

describe.skipIf(!HAS_REGOLO)('VisionService — integration tests (requires REGOLO_API_KEY)', () => {
  beforeAll(() => {
    expect(isProviderConfigured('regolo')).toBe(true);
  });

  it('analyzeImage returns a description', async () => {
    const { visionService } = await import('../index.js');

    const result = await visionService.analyzeImage(
      TINY_RED_PNG,
      'What is this image? Answer briefly.'
    );

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);

  it('analyzeImage accepts data URL format', async () => {
    const { visionService } = await import('../index.js');

    const result = await visionService.analyzeImage(
      `data:image/png;base64,${TINY_RED_PNG}`,
      'What is this image? Answer briefly.'
    );

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);

  it('detectTextContent returns structured result', async () => {
    const { visionService } = await import('../index.js');

    const result = await visionService.detectTextContent(TINY_RED_PNG);

    expect(result).toHaveProperty('hasText');
    expect(result).toHaveProperty('textType');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('briefDescription');
    expect(typeof result.hasText).toBe('boolean');
    expect(['screenshot', 'document', 'sign', 'handwriting', 'none']).toContain(result.textType);
    expect(typeof result.confidence).toBe('number');
  }, 30000);

  it('detectTextContent returns hasText=false for a plain pixel', async () => {
    const { visionService } = await import('../index.js');

    const result = await visionService.detectTextContent(TINY_RED_PNG);

    expect(result.hasText).toBe(false);
    expect(result.textType).toBe('none');
  }, 30000);

  it('analyzeWithOcr returns full analysis result', async () => {
    const { visionService } = await import('../index.js');

    const result = await visionService.analyzeWithOcr(TINY_RED_PNG);

    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('textDetection');
    expect(result).toHaveProperty('extractedText');
    expect(typeof result.description).toBe('string');
    expect(result.description.length).toBeGreaterThan(0);
    expect(result.textDetection.hasText).toBe(false);
    expect(result.extractedText).toBeNull();
  }, 60000);

  it('generateAltText returns alt text string', async () => {
    const { visionService } = await import('../index.js');

    const result = await visionService.generateAltText(TINY_RED_PNG);

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Should not contain the XML tags (they should be stripped)
    expect(result).not.toContain('<alt_text>');
    expect(result).not.toContain('</alt_text>');
  }, 30000);

  it('generateAltText accepts context parameter', async () => {
    const { visionService } = await import('../index.js');

    const result = await visionService.generateAltText(
      TINY_RED_PNG,
      'Dieses Bild zeigt ein Testbild für Barrierefreiheit'
    );

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  }, 30000);
});

// ─── Model discovery vision utilities ────────────────────────────────────

describe('Model discovery — vision utilities', () => {
  it('getAvailableModels includes vision flag', async () => {
    const models = await getAvailableModels();
    expect(Array.isArray(models)).toBe(true);

    if (models.length > 0) {
      const firstModel = models[0];
      expect(firstModel).toHaveProperty('vision');
      expect(typeof firstModel.vision).toBe('boolean');
    }
  }, 15000);

  it('getVisionCapableModels returns only vision models', async () => {
    const { getVisionCapableModels } = await import('../../ai/modelDiscovery.js');
    const visionModels = await getVisionCapableModels();

    expect(Array.isArray(visionModels)).toBe(true);
    for (const model of visionModels) {
      expect(model.vision).toBe(true);
    }
  }, 15000);
});
