/**
 * The vision endpoints answer on the service's own default model. A body that
 * names a provider or a model is answered like one that does not.
 */

import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeWithOcr = vi.fn(async (..._args: unknown[]) => ({
  description: 'ein Bild',
  textDetection: null,
  extractedText: null,
}));
const generateAltText = vi.fn(async (..._args: unknown[]) => 'ein Alt-Text');
vi.mock('../../services/vision/index.js', () => ({
  visionService: {
    analyzeWithOcr: (...args: unknown[]) => analyzeWithOcr(...args),
    generateAltText: (...args: unknown[]) => generateAltText(...args),
  },
}));
vi.mock('../../services/vision/VisionService.js', () => ({
  DEFAULT_VISION_MODEL: 'default-vision-model',
  DEFAULT_VISION_PROVIDER: 'default-vision-provider',
}));
vi.mock('../../services/OcrService/index.js', () => ({ ocrService: {} }));
vi.mock('../../services/ai/modelDiscovery.js', () => ({ getAvailableModels: async () => [] }));

const { default: visionRouter } = await import('./visionController.js');

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/vision', visionRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/vision`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  analyzeWithOcr.mockClear();
  generateAltText.mockClear();
});

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

const NAMED = { provider: 'greenpt', model: 'body-chosen-model' };

describe('vision routes', () => {
  it('/analyze does not pass a provider or model from the body to the service', async () => {
    const answer = await post('/analyze', { image: 'aGVsbG8=', ...NAMED });

    expect(analyzeWithOcr).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(analyzeWithOcr.mock.calls[0])).not.toContain('body-chosen-model');
    expect(JSON.stringify(analyzeWithOcr.mock.calls[0])).not.toContain('greenpt');
    expect(answer.model).toBe('default-vision-model');
    expect(answer.provider).toBe('default-vision-provider');
  });

  it('/alt-text does not pass a provider or model from the body to the service', async () => {
    const answer = await post('/alt-text', { image: 'aGVsbG8=', ...NAMED });

    expect(generateAltText).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(generateAltText.mock.calls[0])).not.toContain('body-chosen-model');
    expect(JSON.stringify(generateAltText.mock.calls[0])).not.toContain('greenpt');
    expect(answer.model).toBe('default-vision-model');
    expect(answer.provider).toBe('default-vision-provider');
  });
});
