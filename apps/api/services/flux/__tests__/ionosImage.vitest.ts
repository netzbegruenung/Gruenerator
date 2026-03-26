import { describe, it, expect } from 'vitest';
import { IonosImageService } from '../IonosImageService.js';

const HAS_IONOS_KEY = !!process.env.IONOS_API_TOKEN;

describe('IonosImageService — unit tests', () => {
  it('is importable and constructable', () => {
    const service = new IonosImageService();
    expect(service).toBeDefined();
    expect(typeof service.generateFromPrompt).toBe('function');
  });

  it('throws when IONOS_API_TOKEN is not set', async () => {
    const origKey = process.env.IONOS_API_TOKEN;
    delete process.env.IONOS_API_TOKEN;
    try {
      const service = new IonosImageService();
      await expect(service.generateFromPrompt('test')).rejects.toThrow('IONOS_API_TOKEN');
    } finally {
      if (origKey) process.env.IONOS_API_TOKEN = origKey;
    }
  });
});

describe.skipIf(!HAS_IONOS_KEY)(
  'IonosImageService — integration tests (requires IONOS_API_TOKEN)',
  () => {
    it('generates an image with FLUX.1-schnell', async () => {
      const service = new IonosImageService();
      const result = await service.generateFromPrompt('A sunflower field at sunset', {
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
