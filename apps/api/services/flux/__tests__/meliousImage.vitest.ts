import { describe, expect, it } from 'vitest';

import { MeliousImageService } from '../MeliousImageService.js';

const RUN_LIVE = !!process.env.MELIOUS_API_KEY && !!process.env.RUN_LIVE_PROVIDER_TESTS;

describe('MeliousImageService — unit tests', () => {
  it('is importable and constructable', () => {
    const service = new MeliousImageService();
    expect(typeof service.generateFromPrompt).toBe('function');
    expect(typeof service.generateFromImage).toBe('function');
  });

  it('throws when MELIOUS_API_KEY is not set', async () => {
    const original = process.env.MELIOUS_API_KEY;
    delete process.env.MELIOUS_API_KEY;
    try {
      await expect(new MeliousImageService().generateFromPrompt('test')).rejects.toThrow(
        'MELIOUS_API_KEY'
      );
    } finally {
      if (original) process.env.MELIOUS_API_KEY = original;
    }
  });
});

describe.skipIf(!RUN_LIVE)(
  'MeliousImageService — integration tests (RUN_LIVE_PROVIDER_TESTS=1 + MELIOUS_API_KEY)',
  () => {
    it('generates an image from a prompt', async () => {
      const result = await new MeliousImageService().generateFromPrompt(
        'A green leaf on a white background',
        { width: 512, height: 512 }
      );

      expect(result.stored.base64).toBeTruthy();
      expect(result.stored.size).toBeGreaterThan(1000);
      expect(result.result.status).toBe('Ready');
    }, 60000);
  }
);
