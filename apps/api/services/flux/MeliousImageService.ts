/**
 * Melious image generation service.
 *
 * Melious exposes OpenAI-compatible image generations. FLUX.2 [klein] 9B is the
 * selected Melious fallback model. It only accepts a few fixed sizes, so the
 * requested dimensions are mapped to the closest one (`toMeliousSize`).
 *
 * Not FLUX.2 [dev]: measured 20.09.2026 against the live endpoint, `flux-2-dev`
 * answered in 380 s / 157 s / 76 s over three runs while `flux-2-klein-9b`
 * answered the same prompt in ~2 s. Generation is one synchronous request here,
 * so a slow model blocks the caller for its full duration — hence the deadline
 * below, which no earlier version had.
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
const DEFAULT_MODEL = 'flux-2-klein-9b';
/** Generous enough for a cold start (~60 s measured on a sibling model), still bounded. */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Since ~October 2026 Melious answers every other size with 400 "Invalid size"
 * (measured 11.10.2026; it also lists 256x256 and 512x512, too small for us).
 */
const SUPPORTED_SIZES = [
  { width: 1024, height: 1024 },
  { width: 1792, height: 1024 },
  { width: 1024, height: 1792 },
] as const;

/** The supported size whose aspect ratio is closest to the requested one. */
export function toMeliousSize(width: number, height: number): string {
  const ratio = Math.log(width / height);
  const best = SUPPORTED_SIZES.reduce((a, b) =>
    Math.abs(Math.log(b.width / b.height) - ratio) < Math.abs(Math.log(a.width / a.height) - ratio)
      ? b
      : a
  );
  return `${best.width}x${best.height}`;
}

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

    const size = toMeliousSize(options.width ?? 1024, options.height ?? 1024);
    const response = await fetch(`${MELIOUS_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt,
        n: 1,
        size,
        response_format: 'b64_json',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
