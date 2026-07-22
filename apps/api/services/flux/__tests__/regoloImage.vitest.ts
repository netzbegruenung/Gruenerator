import { describe, it, expect } from 'vitest';
import { RegoloImageService } from '../RegoloImageService.js';

const HAS_REGOLO_KEY = !!process.env.REGOLO_API_KEY;
// Live image generation is a real, billable, minute-long Regolo call — opt in
// with RUN_LIVE_PROVIDER_TESTS=1 so the default `pnpm test` stays deterministic
// and offline even when a key is present in the local .env.
const RUN_LIVE = HAS_REGOLO_KEY && !!process.env.RUN_LIVE_PROVIDER_TESTS;

describe('RegoloImageService — unit tests', () => {
  it('is importable and constructable', () => {
    const service = new RegoloImageService();
    expect(service).toBeDefined();
    expect(typeof service.generateFromPrompt).toBe('function');
    expect(typeof service.generateFromImage).toBe('function');
  });

  it('throws when REGOLO_API_KEY is not set', async () => {
    const origKey = process.env.REGOLO_API_KEY;
    delete process.env.REGOLO_API_KEY;
    try {
      const service = new RegoloImageService();
      await expect(service.generateFromPrompt('test')).rejects.toThrow('REGOLO_API_KEY');
    } finally {
      if (origKey) process.env.REGOLO_API_KEY = origKey;
    }
  });
});

describe.skipIf(!RUN_LIVE)(
  'RegoloImageService — integration tests (RUN_LIVE_PROVIDER_TESTS=1 + REGOLO_API_KEY)',
  () => {
    it('generates an image from a prompt', async () => {
      const service = new RegoloImageService();
      const result = await service.generateFromPrompt('A green leaf on a white background', {
        width: 512,
        height: 512,
      });

      expect(result).toHaveProperty('stored');
      expect(result.stored.base64).toBeTruthy();
      expect(result.stored.size).toBeGreaterThan(1000);
      expect(result.result.status).toBe('Ready');

      console.log(`  Image size: ${result.stored.size} bytes`);
      console.log(`  File: ${result.stored.filename}`);
    }, 60000);
  }
);
