/**
 * Melious image generation service.
 *
 * Melious exposes OpenAI-compatible image generations. FLUX.2 [dev] is the
 * selected Melious fallback model; unlike the former Qwen endpoint it accepts
 * the requested dimensions directly.
 */

import fs from 'fs';
import path from 'path';

import { recordOperation } from '../usage/UsageTrackingService.js';

import type {
  DownloadResult,
  GenerateFromImageOptions,
  GenerateFromPromptOptions,
  GenerateResult,
  PollResponse,
  ReferenceImage,
  SubmitResponse,
} from './FluxImageService.js';

const MELIOUS_BASE_URL = 'https://api.melious.ai/v1';
const DEFAULT_MODEL = 'flux-2-dev';

interface MeliousImageResponse {
  data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
}

class MeliousImageService {
  private getApiKey(): string {
    return process.env.MELIOUS_API_KEY ?? '';
  }

  async generateFromPrompt(
    prompt: string,
    options: GenerateFromPromptOptions = {}
  ): Promise<GenerateResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('MELIOUS_API_KEY is not configured');

    const width = options.width ?? 1024;
    const height = options.height ?? 1024;
    const response = await fetch(`${MELIOUS_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt,
        n: 1,
        size: `${width}x${height}`,
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Melious image generation failed (${response.status}): ${await response.text()}`
      );
    }

    const data = (await response.json()) as MeliousImageResponse;
    const base64 = data.data?.[0]?.b64_json;
    if (!base64) throw new Error('No image data in Melious response');

    recordOperation({ unit: 'images', provider: 'melious', model: DEFAULT_MODEL });
    const stored = await this.storeImage(base64, options.output_format === 'png' ? 'png' : 'jpg');
    const request: SubmitResponse = { id: `melious_${Date.now()}`, polling_url: '' };
    const result: PollResponse = { status: 'Ready', result: { sample: stored.filePath } };
    return { request, result, stored };
  }

  async generateFromImage(
    prompt: string,
    _imageBuffer: Buffer,
    _mimeType = 'image/jpeg',
    options: GenerateFromImageOptions = {}
  ): Promise<GenerateResult> {
    return this.generateFromPrompt(prompt, options);
  }

  async generateFromImages(
    prompt: string,
    _images: ReferenceImage[],
    options: GenerateFromImageOptions = {}
  ): Promise<GenerateResult> {
    return this.generateFromPrompt(prompt, options);
  }

  private async storeImage(base64: string, extension: string): Promise<DownloadResult> {
    const now = new Date();
    const today = now.toISOString().split('T')[0]!;
    const baseDir = path.join(process.cwd(), 'uploads', 'flux', 'results', today);
    const filename = `melious_image_${now.toISOString().replace(/[:.]/g, '-')}.${extension}`;
    const filePath = path.join(baseDir, filename);
    fs.mkdirSync(baseDir, { recursive: true });
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);
    return {
      filePath,
      relativePath: path.join('uploads', 'flux', 'results', today, filename),
      filename,
      size: buffer.length,
      base64,
    };
  }
}

export { MeliousImageService };
