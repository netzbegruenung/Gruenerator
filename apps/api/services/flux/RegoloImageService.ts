/**
 * Regolo Image Generation Service
 *
 * Uses Regolo's OpenAI-compatible /v1/images/generations endpoint
 * with the Qwen-Image model. Implements the same interface as FluxImageService.
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

const REGOLO_BASE_URL = 'https://api.regolo.ai/v1';
const DEFAULT_MODEL = 'Qwen-Image';

interface RegoloImageResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
}

class RegoloImageService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.REGOLO_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[RegoloImageService] Missing REGOLO_API_KEY');
    }
  }

  async generateFromPrompt(
    prompt: string,
    options: GenerateFromPromptOptions = {}
  ): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new Error('REGOLO_API_KEY is not configured');
    }

    const width = options.width || 1024;
    const height = options.height || 1024;
    const size = `${width}x${height}`;

    console.log(`[RegoloImageService] Generating image: ${prompt.substring(0, 80)}...`);

    const response = await fetch(`${REGOLO_BASE_URL}/images/generations`, {
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
      throw new Error(`Regolo image generation failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as RegoloImageResponse;

    if (!data.data?.[0]?.b64_json) {
      throw new Error('No image data in Regolo response');
    }

    const base64 = data.data[0].b64_json;
    const stored = await this.storeImage(base64, options.output_format === 'png' ? 'png' : 'jpg');

    const submitResponse: SubmitResponse = {
      id: `regolo_${Date.now()}`,
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
    const nameBase = `regolo_image_${now.toISOString().replace(/[:.]/g, '-')}`;
    const filename = `${nameBase}.${extension}`;
    const filePath = path.join(baseDir, filename);

    fs.mkdirSync(baseDir, { recursive: true });

    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const relativePath = path.join('uploads', 'flux', 'results', today!, filename);
    return { filePath, relativePath, filename, size: buffer.length, base64 };
  }
}

export default RegoloImageService;
export { RegoloImageService };
