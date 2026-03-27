/**
 * IONOS Image Generation Service
 *
 * Uses IONOS AI inference OpenAI-compatible /v1/images/generations endpoint
 * with the Flux 1 Schnell model.
 */

import fs from 'fs';
import path from 'path';

import type {
  GenerateFromPromptOptions,
  GenerateResult,
  SubmitResponse,
  PollResponse,
  DownloadResult,
  GenerateFromImageOptions,
} from './FluxImageService.js';

const IONOS_BASE_URL = 'https://openai.inference.de-txl.ionos.com/v1';
const DEFAULT_MODEL = 'black-forest-labs/FLUX.1-schnell';

interface OpenAIImageResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}

class IonosImageService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.IONOS_API_TOKEN || '';
    if (!this.apiKey) {
      console.warn('[IonosImageService] Missing IONOS_API_TOKEN');
    }
  }

  async generateFromPrompt(
    prompt: string,
    options: GenerateFromPromptOptions = {}
  ): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new Error('IONOS_API_TOKEN is not configured');
    }

    const width = options.width || 1024;
    const height = options.height || 1024;
    const size = `${width}x${height}`;

    console.log(
      `[IonosImageService] Generating image with FLUX.1-schnell: ${prompt.substring(0, 80)}...`
    );

    const response = await fetch(`${IONOS_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt,
        n: 1,
        size,
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`IONOS image generation failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as OpenAIImageResponse;

    if (!data.data?.[0]?.b64_json) {
      throw new Error('No image data in IONOS response');
    }

    const base64 = data.data[0].b64_json;
    const stored = await this.storeImage(base64, options.output_format === 'png' ? 'png' : 'jpg');

    const submitResponse: SubmitResponse = {
      id: `ionos_${Date.now()}`,
      polling_url: '',
    };

    const pollResponse: PollResponse = {
      status: 'Ready',
      result: { sample: stored.filePath },
    };

    return { request: submitResponse, result: pollResponse, stored };
  }

  async generateFromImage(
    prompt: string,
    _imageBuffer: Buffer,
    _mimeType: string = 'image/jpeg',
    options: GenerateFromImageOptions = {}
  ): Promise<GenerateResult> {
    return this.generateFromPrompt(prompt, options);
  }

  private async storeImage(base64: string, extension: string): Promise<DownloadResult> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const baseDir = path.join(process.cwd(), 'uploads', 'flux', 'results', today!);
    const nameBase = `ionos_image_${now.toISOString().replace(/[:.]/g, '-')}`;
    const filename = `${nameBase}.${extension}`;
    const filePath = path.join(baseDir, filename);

    fs.mkdirSync(baseDir, { recursive: true });

    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const relativePath = path.join('uploads', 'flux', 'results', today!, filename);
    return { filePath, relativePath, filename, size: buffer.length, base64 };
  }
}

export default IonosImageService;
export { IonosImageService };
