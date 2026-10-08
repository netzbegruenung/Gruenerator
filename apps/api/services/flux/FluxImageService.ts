import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { FLUX3_MODEL_PATH, type Flux3Resolution } from '@gruenerator/shared/models';
import axios, { type AxiosResponse, type AxiosRequestConfig } from 'axios';
import sharp from 'sharp';

import { env } from '../../config/env.js';
import { recordOperation } from '../usage/UsageTrackingService.js';

import type { Readable } from 'stream';

const sleep = promisify(setTimeout);

type AxiosConfigWithFamily = AxiosRequestConfig & { family?: 4 | 6 };

export type FluxBackend = 'hosted' | 'melious';

type FluxApiError = Error & {
  code?: string;
  response?: { status?: number; data?: { detail?: string; message?: string } };
};

export interface FluxImageServiceOptions {
  apiKey?: string;
  baseUrl?: string;
  modelPath?: string;
  resolution?: Flux3Resolution;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  jitterFactor?: number;
  networkTimeoutMs?: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitterFactor: number;
  networkTimeoutMs: number;
}

export interface CircuitBreaker {
  failures: number;
  lastFailureTime: number | null;
  threshold: number;
  timeout: number;
}

export interface ErrorInfo {
  type: 'network' | 'billing' | 'validation' | 'server' | 'unknown';
  retryable: boolean;
  userMessage: string;
}

export interface FluxError extends Error {
  originalError?: Error;
  type?: string;
  retryable?: boolean;
}

export interface SubmitOptions {
  modelPathOverride?: string;
  width?: number;
  height?: number;
  aspect_ratio?: string;
  output_format?: 'jpeg' | 'png';
  safety_tolerance?: number;
  prompt_upsampling?: boolean;
}

export interface SubmitResponse {
  id: string;
  polling_url: string;
  [key: string]: unknown;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export interface PollResponse {
  status:
    | 'Ready'
    | 'Error'
    | 'Failed'
    | 'Pending'
    | 'Reasoning'
    | 'Generating'
    | 'Request Moderated'
    | 'Content Moderated'
    | 'Task not found';
  message?: string;
  result?: {
    sample?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface DownloadOptions {
  baseDir?: string;
  extension?: string;
  fileNameBase?: string;
  /** Re-encode the downloaded image as JPEG (FLUX 3 only answers PNG). */
  transcodeToJpeg?: boolean;
}

export interface DownloadResult {
  filePath: string;
  relativePath: string;
  filename: string;
  size: number;
  base64: string;
}

export interface GenerateFromPromptOptions extends SubmitOptions, PollOptions {}

export interface GenerateResult {
  request: SubmitResponse;
  result: PollResponse;
  stored: DownloadResult;
}

export interface GenerateFromImageOptions extends SubmitOptions, PollOptions {
  seed?: number;
}

export interface ReferenceImage {
  buffer: Buffer;
  mimeType: string;
}

export interface OutpaintOptions extends PollOptions {
  width: number;
  height: number;
  output_format?: 'jpeg' | 'png';
  reference_offset_x?: number;
  reference_offset_y?: number;
  auto_crop?: boolean;
}

export function isFlux3Path(modelPath: string): boolean {
  return modelPath === FLUX3_MODEL_PATH;
}

/** `aspect_ratio` values `/v1/flux-3-image` accepts besides `auto`. */
export const FLUX3_ASPECT_RATIOS = [
  '21:9',
  '2:1',
  '16:9',
  '3:2',
  '7:5',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '5:7',
  '2:3',
  '9:16',
  '1:2',
  '9:21',
] as const;
export type Flux3AspectRatio = (typeof FLUX3_ASPECT_RATIOS)[number];

/** FLUX 3 takes no pixel size — snap width/height to the closest ratio it offers. */
export function toFlux3AspectRatio(width: number, height: number): Flux3AspectRatio {
  const target = Math.log(width / height);
  let best: Flux3AspectRatio = '1:1';
  let bestDistance = Infinity;
  for (const ratio of FLUX3_ASPECT_RATIOS) {
    const [w, h] = ratio.split(':').map(Number);
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }
  return best;
}

export interface Flux3BodyOptions {
  images?: ReferenceImage[];
  width?: number;
  height?: number;
  aspect_ratio?: string;
  resolution?: Flux3Resolution;
  safety_tolerance?: number;
}

/**
 * Request body for `/v1/flux-3-image`. The endpoint answers unknown fields with
 * 422, so nothing FLUX.2 sends (`width`, `seed`, `input_image*`,
 * `output_format`, `prompt_upsampling`) may leak in here.
 *
 * `grounding: false`: the default lets BFL run its own web and image search on
 * the prompt — a data flow our processing agreement with BFL does not cover.
 */
export function buildFlux3Body(prompt: string, options: Flux3BodyOptions = {}) {
  const aspectRatio =
    options.aspect_ratio &&
    (FLUX3_ASPECT_RATIOS as readonly string[]).includes(options.aspect_ratio)
      ? options.aspect_ratio
      : options.width && options.height
        ? toFlux3AspectRatio(options.width, options.height)
        : 'auto';
  return {
    prompt,
    ...(options.images?.length && {
      images: options.images.map(
        (img) => `data:${img.mimeType};base64,${img.buffer.toString('base64')}`
      ),
    }),
    aspect_ratio: aspectRatio,
    resolution: options.resolution ?? '1k',
    safety_tolerance: options.safety_tolerance ?? 2,
    grounding: false,
  };
}

const POLL_RUNNING = new Set(['Pending', 'Reasoning', 'Generating']);
const POLL_MODERATED = new Set(['Request Moderated', 'Content Moderated']);

class FluxImageService {
  private apiKey: string;
  private baseUrl: string;
  private modelPath: string;
  private resolution: Flux3Resolution | undefined;
  private retryConfig: RetryConfig;
  private retryableErrors: Set<string>;
  private circuitBreaker: CircuitBreaker;

  static async create(
    backend?: FluxBackend,
    modelPath?: string,
    resolution?: Flux3Resolution
  ): Promise<FluxImageService> {
    const configuredBackend = backend || env.FLUX_BACKEND || 'hosted';
    // F0 compatibility: a persisted/deployed `FLUX_BACKEND=regolo` must no
    // longer send a Qwen request. It now selects the Melious replacement.
    const useBackend: FluxBackend =
      configuredBackend === 'regolo' ? 'melious' : (configuredBackend as FluxBackend);

    if (useBackend === 'melious') {
      console.log('[FluxImageService] Using Melious FLUX.2 [klein] backend');
      const mod = await import('./MeliousImageService.js');
      return new mod.MeliousImageService() as unknown as FluxImageService;
    }

    if (useBackend !== 'hosted') {
      console.warn(
        `[FluxImageService] Unknown FLUX_BACKEND "${useBackend}" (retired?), falling back to hosted BFL API`
      );
    }

    console.log(
      `[FluxImageService] Using hosted BFL API backend${modelPath ? ` (${modelPath})` : ''}`
    );
    return new FluxImageService({
      ...(modelPath && { modelPath }),
      ...(resolution && { resolution }),
    });
  }

  constructor(options: FluxImageServiceOptions = {}) {
    this.apiKey = options.apiKey || env.BFL_API_KEY || '';
    this.baseUrl = options.baseUrl || 'https://api.eu.bfl.ai';
    this.modelPath = options.modelPath || FLUX3_MODEL_PATH;
    this.resolution = options.resolution;

    this.retryConfig = {
      maxRetries: options.maxRetries || env.FLUX_MAX_RETRIES,
      baseDelay: options.baseDelay || env.FLUX_BASE_DELAY,
      maxDelay: options.maxDelay || env.FLUX_MAX_DELAY,
      jitterFactor: options.jitterFactor || 0.1,
      networkTimeoutMs: options.networkTimeoutMs || 60000,
    };

    this.retryableErrors = new Set([
      'ENETUNREACH',
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      '429',
      '500',
      '502',
      '503',
      '504',
    ]);

    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      threshold: 5,
      timeout: 60000,
    };

    if (!this.apiKey) {
      console.warn('[FluxImageService] Missing BFL_API_KEY');
    }
  }

  /**
   * Count one generated image against the requesting user. Called at submit
   * time (not after polling) so retries inside executeWithRetry don't inflate
   * the number — BFL bills per submitted request.
   */
  private recordImageOperation(modelPath: string): void {
    const model = modelPath.replace(/^\/v1\//, '');
    recordOperation({
      unit: 'images',
      provider: 'bfl',
      // Pro and Max share the FLUX 3 route; the resolution tier is what differs.
      model:
        isFlux3Path(modelPath) && this.resolution && this.resolution !== '1k'
          ? `${model}@${this.resolution}`
          : model,
    });
  }

  private resultFormat(modelPath: string, outputFormat?: 'jpeg' | 'png'): DownloadOptions {
    const png = outputFormat === 'png';
    return {
      extension: png ? 'png' : 'jpg',
      transcodeToJpeg: !png && isFlux3Path(modelPath),
    };
  }

  async submit(prompt: string, options: SubmitOptions = {}): Promise<SubmitResponse> {
    const modelPath = options.modelPathOverride || this.modelPath;
    const url = `${this.baseUrl}${modelPath}`;
    const headers = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'x-key': this.apiKey,
    };
    const body = isFlux3Path(modelPath)
      ? buildFlux3Body(prompt, {
          ...options,
          ...(this.resolution && { resolution: this.resolution }),
        })
      : {
          prompt,
          ...(options.width && { width: options.width }),
          ...(options.height && { height: options.height }),
          ...(options.aspect_ratio && { aspect_ratio: options.aspect_ratio }),
          output_format: options.output_format || 'jpeg',
          safety_tolerance: options.safety_tolerance ?? 2,
          prompt_upsampling: options.prompt_upsampling ?? false,
        };

    console.log(`[FluxImageService] Submitting text-to-image request to ${url}`);
    this.recordImageOperation(modelPath);

    return await this.executeWithRetry(async (family?: number) => {
      const axiosConfig: AxiosConfigWithFamily = {
        headers,
        timeout: this.retryConfig.networkTimeoutMs,
      };
      if (family) axiosConfig.family = family as 4 | 6;

      const res = await axios.post<SubmitResponse>(url, body, axiosConfig);
      console.log(
        `[FluxImageService] Text-to-image request submitted successfully, ID: ${res.data?.id}${res.data?.cost != null ? `, cost: ${String(res.data.cost)}` : ''}`
      );
      return res.data;
    }, 'submit');
  }

  private async executeWithRetry<T>(
    operation: (family?: number) => Promise<T>,
    operationType: string = 'unknown'
  ): Promise<T> {
    if (this.isCircuitBreakerOpen()) {
      throw new Error(
        `Circuit breaker is open for ${operationType}. Service temporarily unavailable.`
      );
    }

    let lastError!: FluxApiError;
    const networkPreferences = [undefined, 4, 6];

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      const isNetworkRetry = lastError?.code && this.retryableErrors.has(lastError.code);
      const networkOptions = isNetworkRetry ? networkPreferences : [undefined];

      for (const family of networkOptions) {
        try {
          const result = await operation(family);
          this.resetCircuitBreaker();
          if (family && lastError?.code) {
            console.log(
              `[FluxImageService] ${operationType} succeeded using IPv${family} after network error`
            );
          }
          return result;
        } catch (error: unknown) {
          lastError = error as typeof lastError;
          const errorInfo = this.classifyError(lastError);

          if (
            errorInfo.type === 'network' &&
            family !== networkOptions[networkOptions.length - 1]
          ) {
            console.log(
              `[FluxImageService] ${operationType} failed with IPv${family || 'default'}, trying next network option`
            );
            continue;
          }

          const errMsg = error instanceof Error ? error.message : String(error);
          const axiosErr = error as { response?: { data?: unknown } };
          console.log(
            `[FluxImageService] ${operationType} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), error: ${errorInfo.type} - ${errMsg}`
          );
          if (axiosErr.response?.data) {
            console.log(
              `[FluxImageService] API response body:`,
              JSON.stringify(axiosErr.response.data)
            );
          }
          break;
        }
      }

      const errorInfo = this.classifyError(lastError);

      if (attempt === this.retryConfig.maxRetries || !errorInfo.retryable) {
        this.recordFailure();
        break;
      }

      const delay = this.calculateDelay(attempt);
      console.log(`[FluxImageService] Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }

    const finalError = this.createUserFriendlyError(lastError);
    throw finalError;
  }

  private classifyError(error: FluxApiError): ErrorInfo {
    const status = error.response?.status?.toString();
    const code = error.code;

    if (code && this.retryableErrors.has(code)) {
      return { type: 'network', retryable: true, userMessage: 'Network connection issue' };
    }

    if (status) {
      if (status === '402') {
        return {
          type: 'billing',
          retryable: false,
          userMessage: 'Insufficient credits. Please add credits to your account.',
        };
      }
      if (status === '400' || status === '422') {
        return { type: 'validation', retryable: false, userMessage: 'Invalid request parameters' };
      }
      if (this.retryableErrors.has(status)) {
        return { type: 'server', retryable: true, userMessage: 'Server temporarily unavailable' };
      }
    }

    return { type: 'unknown', retryable: false, userMessage: 'An unexpected error occurred' };
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelay * Math.pow(2, attempt);
    const jitter = exponentialDelay * this.retryConfig.jitterFactor * Math.random();
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelay);
  }

  private isCircuitBreakerOpen(): boolean {
    if (this.circuitBreaker.failures < this.circuitBreaker.threshold) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - (this.circuitBreaker.lastFailureTime || 0);
    return timeSinceLastFailure < this.circuitBreaker.timeout;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
  }

  private resetCircuitBreaker(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailureTime = null;
  }

  private createUserFriendlyError(originalError: FluxApiError): FluxError {
    const errorInfo = this.classifyError(originalError);
    const detail: unknown =
      originalError.response?.data?.detail || originalError.response?.data?.message;
    // FLUX 3 answers 422 with a pydantic `detail` array, not a string.
    const apiMessage = typeof detail === 'string' || !detail ? detail : JSON.stringify(detail);
    const message = apiMessage ? `${errorInfo.userMessage}: ${apiMessage}` : errorInfo.userMessage;
    const error = new Error(message) as FluxError;
    error.originalError = originalError;
    error.type = errorInfo.type;
    error.retryable = errorInfo.retryable;
    return error;
  }

  async poll(
    pollingUrl: string,
    requestId: string,
    options: PollOptions = {}
  ): Promise<PollResponse> {
    const headers = { accept: 'application/json', 'x-key': this.apiKey };
    const intervalMs = options.intervalMs || 500;
    const timeoutMs = options.timeoutMs || 120000;
    const start = Date.now();
    // Pending means queued at BFL, Reasoning/Generating means it is being painted.
    let lastStatus = 'none';

    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `Polling timed out after ${Math.round(timeoutMs / 1000)} seconds (last status: ${lastStatus})`
        );
      }

      try {
        const data = await this.executeWithRetry(async (family?: number) => {
          const axiosConfig: AxiosConfigWithFamily = {
            headers,
            params: requestId ? { id: requestId } : undefined,
            timeout: 30000,
          };
          if (family) axiosConfig.family = family as 4 | 6;

          const res = await axios.get<PollResponse>(pollingUrl, axiosConfig);
          return res.data;
        }, 'poll');

        lastStatus = String(data?.status);
        if (data?.status === 'Ready') return data;
        if (POLL_MODERATED.has(data?.status)) {
          const error = new Error(
            'Die Anfrage wurde von der Inhaltsprüfung des Bildmodells blockiert. Bitte formuliere sie um.'
          ) as FluxError;
          error.type = 'moderated';
          error.retryable = false;
          throw error;
        }
        // Anything else that is not still running is terminal — before FLUX 3
        // an unknown status (moderation, expired task) polled until the timeout.
        if (!POLL_RUNNING.has(data?.status)) {
          throw new Error(data?.message || `Generation failed (${String(data?.status)})`);
        }
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.message.includes('Generation failed') || error.message.includes('timed out'))
        ) {
          throw error;
        }
        throw error;
      }

      await sleep(intervalMs);
    }
  }

  async download(resultUrl: string, options: DownloadOptions = {}): Promise<DownloadResult> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const baseDir =
      options.baseDir || path.join(process.cwd(), 'uploads', 'flux', 'results', today);
    const extension = options.extension || 'jpg';
    const nameBase =
      options.fileNameBase || `generated_image_${now.toISOString().replace(/[:.]/g, '-')}`;
    const filename = `${nameBase}.${extension}`;
    const filePath = path.join(baseDir, filename);
    fs.mkdirSync(baseDir, { recursive: true });

    const response: AxiosResponse<Readable> = await this.executeWithRetry(
      async (family?: number) => {
        const axiosConfig: AxiosConfigWithFamily = {
          method: 'GET',
          url: resultUrl,
          responseType: 'stream',
          timeout: this.retryConfig.networkTimeoutMs,
        };
        if (family) axiosConfig.family = family as 4 | 6;

        return await axios<Readable>(axiosConfig);
      },
      'download'
    );

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    if (options.transcodeToJpeg) {
      fs.writeFileSync(filePath, await sharp(filePath).jpeg({ quality: 92 }).toBuffer());
    }

    const stats = fs.statSync(filePath);
    const relativePath = path.join('uploads', 'flux', 'results', today, filename);
    const base64 = fs.readFileSync(filePath).toString('base64');
    return { filePath, relativePath, filename, size: stats.size, base64 };
  }

  async generateFromPrompt(
    prompt: string,
    options: GenerateFromPromptOptions = {}
  ): Promise<GenerateResult> {
    const request = await this.submit(prompt, options);
    const { id, polling_url } = request;
    const result = await this.poll(polling_url, id, options);
    if (result?.status !== 'Ready' || !result?.result?.sample) {
      throw new Error('No sample URL in result');
    }
    const stored = await this.download(
      result.result.sample,
      this.resultFormat(options.modelPathOverride || this.modelPath, options.output_format)
    );
    return { request, result, stored };
  }

  async generateFromImage(
    prompt: string,
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg',
    options: GenerateFromImageOptions = {}
  ): Promise<GenerateResult> {
    return this.generateFromImages(prompt, [{ buffer: imageBuffer, mimeType }], options);
  }

  /**
   * Image-to-image with one or more reference images. FLUX 3 takes them as the
   * `images` array (up to 10); FLUX.2 maps the first to `input_image`, further
   * ones to `input_image_2`… `input_image_8` in the order given.
   */
  async generateFromImages(
    prompt: string,
    images: ReferenceImage[],
    options: GenerateFromImageOptions = {}
  ): Promise<GenerateResult> {
    if (images.length === 0) {
      throw new Error('generateFromImages requires at least one reference image');
    }
    const modelPath = options.modelPathOverride || this.modelPath;
    const url = `${this.baseUrl}${modelPath}`;
    const headers = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'x-key': this.apiKey,
    };

    let body: Record<string, unknown>;
    if (isFlux3Path(modelPath)) {
      body = buildFlux3Body(prompt, {
        images,
        ...(options.aspect_ratio && { aspect_ratio: options.aspect_ratio }),
        ...(options.safety_tolerance !== undefined && {
          safety_tolerance: options.safety_tolerance,
        }),
        ...(this.resolution && { resolution: this.resolution }),
      });
    } else {
      body = {
        prompt,
        output_format: options.output_format || 'jpeg',
        safety_tolerance: options.safety_tolerance ?? 2,
        ...(options.width && { width: options.width }),
        ...(options.height && { height: options.height }),
        ...(options.seed && { seed: options.seed }),
      };
      images.forEach((img, i) => {
        const key = i === 0 ? 'input_image' : `input_image_${i + 1}`;
        body[key] = `data:${img.mimeType};base64,${img.buffer.toString('base64')}`;
      });
    }

    const totalKb = Math.round(images.reduce((sum, img) => sum + img.buffer.length, 0) / 1024);
    console.log(
      `[FluxImageService] Submitting image-to-image request to ${url}, ${images.length} reference image(s), total size: ${totalKb}KB`
    );
    this.recordImageOperation(modelPath);

    const request = await this.executeWithRetry(async (family?: number) => {
      const axiosConfig: AxiosConfigWithFamily = {
        headers,
        timeout: this.retryConfig.networkTimeoutMs,
      };
      if (family) axiosConfig.family = family as 4 | 6;

      const res = await axios.post<SubmitResponse>(url, body, axiosConfig);
      return res.data;
    }, 'generateFromImages');

    const { id, polling_url } = request;
    console.log(`[FluxImageService] Image-to-image request submitted successfully, ID: ${id}`);

    const result = await this.poll(polling_url, id, options);
    if (result?.status !== 'Ready' || !result?.result?.sample) {
      console.log(`[FluxImageService] Image-to-image generation failed, status: ${result?.status}`);
      throw new Error('No sample URL in result');
    }

    console.log(`[FluxImageService] Image-to-image generation completed successfully`);
    const stored = await this.download(
      result.result.sample,
      this.resultFormat(modelPath, options.output_format)
    );
    return { request, result, stored };
  }

  /**
   * Outpainting via FLUX Tools — extends an image beyond its borders without
   * a prompt. Always hits the hosted BFL `/v1/flux-tools/outpainting-v1`
   * endpoint regardless of which backend the service was constructed with;
   * outpainting is its own paid endpoint and isn't model-parameterized.
   */
  async outpaintImage(imageBuffer: Buffer, options: OutpaintOptions): Promise<GenerateResult> {
    const url = `${this.baseUrl}/v1/flux-tools/outpainting-v1`;
    const headers = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'x-key': this.apiKey,
    };
    const base64 = imageBuffer.toString('base64');

    const body: Record<string, unknown> = {
      input_image: base64,
      width: options.width,
      height: options.height,
      output_format: options.output_format || 'jpeg',
    };
    if (typeof options.reference_offset_x === 'number') {
      body.reference_offset_x = options.reference_offset_x;
    }
    if (typeof options.reference_offset_y === 'number') {
      body.reference_offset_y = options.reference_offset_y;
    }
    if (options.auto_crop) body.auto_crop = true;

    console.log(
      `[FluxImageService] Submitting outpainting request to ${url}, target ${options.width}x${options.height}, source size: ${Math.round(imageBuffer.length / 1024)}KB`
    );
    this.recordImageOperation('/v1/flux-tools/outpainting-v1');

    const request = await this.executeWithRetry(async (family?: number) => {
      const axiosConfig: AxiosConfigWithFamily = {
        headers,
        timeout: this.retryConfig.networkTimeoutMs,
      };
      if (family) axiosConfig.family = family as 4 | 6;

      const res = await axios.post<SubmitResponse>(url, body, axiosConfig);
      return res.data;
    }, 'outpaint');

    const { id, polling_url } = request;
    console.log(`[FluxImageService] Outpainting submitted, ID: ${id}`);

    const result = await this.poll(polling_url, id, options);
    if (result?.status !== 'Ready' || !result?.result?.sample) {
      throw new Error('No sample URL in outpainting result');
    }

    const stored = await this.download(result.result.sample, {
      extension: options.output_format === 'png' ? 'png' : 'jpg',
    });
    return { request, result, stored };
  }
}

export default FluxImageService;
