import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import ComfyUIClient, { type ComfyUIClientOptions } from './ComfyUIClient.js';
import { buildImg2ImgWorkflow } from './workflows/img2img.js';
import { buildText2ImgWorkflow } from './workflows/text2img.js';

import type {
  GenerateResult,
  GenerateFromPromptOptions,
  GenerateFromImageOptions,
  DownloadResult,
  SubmitResponse,
  PollResponse,
} from '../flux/FluxImageService.js';

export interface ComfyUIImageServiceOptions extends ComfyUIClientOptions {
  stepsText2Img?: number;
  stepsImg2Img?: number;
  defaultDenoise?: number;
}

class ComfyUIImageService {
  private client: ComfyUIClient;
  private stepsText2Img: number;
  private stepsImg2Img: number;
  private defaultDenoise: number;

  constructor(options: ComfyUIImageServiceOptions = {}) {
    this.client = new ComfyUIClient(options);
    this.stepsText2Img = options.stepsText2Img || 20;
    this.stepsImg2Img = options.stepsImg2Img || 20;
    this.defaultDenoise = options.defaultDenoise || 0.7;
  }

  async generateFromPrompt(
    prompt: string,
    options: GenerateFromPromptOptions = {}
  ): Promise<GenerateResult> {
    const width = options.width || 1024;
    const height = options.height || 1024;

    console.log(`[ComfyUIImageService] Generating text-to-image: ${width}x${height}`);
    console.log(`[ComfyUIImageService] Prompt: "${prompt.substring(0, 100)}..."`);

    const workflow = buildText2ImgWorkflow({
      prompt,
      width,
      height,
      steps: this.stepsText2Img,
      seed: options.safety_tolerance !== undefined ? options.safety_tolerance : undefined,
    });

    const startTime = Date.now();
    const images = await this.client.generateImage(workflow);
    const generationTime = Date.now() - startTime;

    console.log(`[ComfyUIImageService] Generation completed in ${generationTime}ms`);

    if (images.length === 0) {
      throw new Error('No images generated');
    }

    const stored = await this.storeImage(images[0], options.output_format || 'jpeg');

    const mockRequest: SubmitResponse = {
      id: randomUUID(),
      polling_url: `local://comfyui/result`,
    };

    const mockResult: PollResponse = {
      status: 'Ready',
      result: {
        sample: stored.filePath,
      },
    };

    return {
      request: mockRequest,
      result: mockResult,
      stored,
    };
  }

  async generateFromImage(
    prompt: string,
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg',
    options: GenerateFromImageOptions = {}
  ): Promise<GenerateResult> {
    console.log(
      `[ComfyUIImageService] Generating image-to-image, input size: ${Math.round(imageBuffer.length / 1024)}KB`
    );
    console.log(`[ComfyUIImageService] Prompt: "${prompt.substring(0, 100)}..."`);

    // Upload the input image to ComfyUI
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    const inputFilename = `input_${Date.now()}_${randomUUID().substring(0, 8)}.${extension}`;

    console.log(`[ComfyUIImageService] Uploading input image as: ${inputFilename}`);
    await this.client.uploadImage(imageBuffer, inputFilename);

    const workflow = buildImg2ImgWorkflow({
      prompt,
      imageFilename: inputFilename,
      steps: this.stepsImg2Img,
      denoise: this.defaultDenoise,
      seed: options.seed,
    });

    const startTime = Date.now();
    const images = await this.client.generateImage(workflow);
    const generationTime = Date.now() - startTime;

    console.log(`[ComfyUIImageService] Generation completed in ${generationTime}ms`);

    if (images.length === 0) {
      throw new Error('No images generated');
    }

    const stored = await this.storeImage(images[0], options.output_format || 'jpeg');

    const mockRequest: SubmitResponse = {
      id: randomUUID(),
      polling_url: `local://comfyui/result`,
    };

    const mockResult: PollResponse = {
      status: 'Ready',
      result: {
        sample: stored.filePath,
      },
    };

    return {
      request: mockRequest,
      result: mockResult,
      stored,
    };
  }

  private async storeImage(
    imageBuffer: Buffer,
    format: 'jpeg' | 'png' = 'jpeg'
  ): Promise<DownloadResult> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const baseDir = path.join(process.cwd(), 'uploads', 'flux', 'results', today);

    fs.mkdirSync(baseDir, { recursive: true });

    const extension = format === 'png' ? 'png' : 'jpg';
    const filename = `generated_image_${now.toISOString().replace(/[:.]/g, '-')}.${extension}`;
    const filePath = path.join(baseDir, filename);

    fs.writeFileSync(filePath, imageBuffer);

    const stats = fs.statSync(filePath);
    const relativePath = path.join('uploads', 'flux', 'results', today, filename);
    const base64 = imageBuffer.toString('base64');

    console.log(
      `[ComfyUIImageService] Image stored: ${filePath} (${Math.round(stats.size / 1024)}KB)`
    );

    return {
      filePath,
      relativePath,
      filename,
      size: stats.size,
      base64,
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.client.healthCheck();
  }

  async getSystemStats() {
    return this.client.getSystemStats();
  }
}

export default ComfyUIImageService;
