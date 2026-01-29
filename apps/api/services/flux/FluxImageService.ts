import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import axios, { AxiosResponse } from 'axios';

const sleep = promisify(setTimeout);

export type FluxBackend = 'hosted' | 'local';

export interface FluxImageServiceOptions {
  apiKey?: string;
  baseUrl?: string;
  modelPath?: string;
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
  status: 'Ready' | 'Error' | 'Failed' | 'Pending';
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

class FluxImageService {
  private apiKey: string;
  private baseUrl: string;
  private modelPath: string;
  private retryConfig: RetryConfig;
  private retryableErrors: Set<string>;
  private circuitBreaker: CircuitBreaker;

  /**
   * Factory method to create the appropriate image service based on backend selection.
   *
   * @param backend - 'hosted' for BFL API, 'local' for ComfyUI. Defaults to FLUX_BACKEND env var or 'hosted'.
   * @returns FluxImageService for hosted backend, ComfyUIImageService for local backend
   */
  static async create(backend?: FluxBackend): Promise<FluxImageService> {
    const useBackend = backend || (process.env.FLUX_BACKEND as FluxBackend) || 'hosted';

    if (useBackend === 'local') {
      console.log('[FluxImageService] Using local ComfyUI backend');
      // @ts-expect-error - comfyui module is local-only and not available in CI
      const mod = await import('../comfyui/ComfyUIImageService.js');
      return new mod.default() as unknown as FluxImageService;
    }

    console.log('[FluxImageService] Using hosted BFL API backend');
    return new FluxImageService();
  }

  constructor(options: FluxImageServiceOptions = {}) {
    this.apiKey = options.apiKey || process.env.BFL_API_KEY || '';
    this.baseUrl = options.baseUrl || 'https://api.eu.bfl.ai';
    this.modelPath = options.modelPath || '/v1/flux-2-pro';

    this.retryConfig = {
      maxRetries: options.maxRetries || parseInt(process.env.FLUX_MAX_RETRIES || '3', 10),
      baseDelay: options.baseDelay || parseInt(process.env.FLUX_BASE_DELAY || '1000', 10),
      maxDelay: options.maxDelay || parseInt(process.env.FLUX_MAX_DELAY || '30000', 10),
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

  async submit(prompt: string, options: SubmitOptions = {}): Promise<SubmitResponse> {
    const modelPath = options.modelPathOverride || this.modelPath;
    const url = `${this.baseUrl}${modelPath}`;
    const headers = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'x-key': this.apiKey,
    };
    const body = {
      prompt,
      ...(options.width && { width: options.width }),
      ...(options.height && { height: options.height }),
      ...(options.aspect_ratio && { aspect_ratio: options.aspect_ratio }),
      output_format: options.output_format || 'jpeg',
      safety_tolerance: options.safety_tolerance ?? 2,
      prompt_upsampling: options.prompt_upsampling ?? false,
    };

    console.log(`[FluxImageService] Submitting text-to-image request to ${url}`);

    return await this.executeWithRetry(async (family?: number) => {
      const axiosConfig: any = {
        headers,
        timeout: this.retryConfig.networkTimeoutMs,
      };
      if (family) axiosConfig.family = family;

      const res = await axios.post<SubmitResponse>(url, body, axiosConfig);
      console.log(
        `[FluxImageService] Text-to-image request submitted successfully, ID: ${res.data?.id}`
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

    let lastError: any;
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
        } catch (error: any) {
          lastError = error;
          const errorInfo = this.classifyError(error);

          if (
            errorInfo.type === 'network' &&
            family !== networkOptions[networkOptions.length - 1]
          ) {
            console.log(
              `[FluxImageService] ${operationType} failed with IPv${family || 'default'}, trying next network option`
            );
            continue;
          }

          console.log(
            `[FluxImageService] ${operationType} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), error: ${errorInfo.type} - ${error.message}`
          );
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

  private classifyError(error: any): ErrorInfo {
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
      if (status === '400') {
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

  private createUserFriendlyError(originalError: any): FluxError {
    const errorInfo = this.classifyError(originalError);
    const error = new Error(errorInfo.userMessage) as FluxError;
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

    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Polling timed out after ' + Math.round(timeoutMs / 1000) + ' seconds');
      }

      try {
        const data = await this.executeWithRetry(async (family?: number) => {
          const axiosConfig: any = {
            headers,
            params: requestId ? { id: requestId } : undefined,
            timeout: 30000,
          };
          if (family) axiosConfig.family = family;

          const res = await axios.get<PollResponse>(pollingUrl, axiosConfig);
          return res.data;
        }, 'poll');

        if (data?.status === 'Ready') return data;
        if (data?.status === 'Error' || data?.status === 'Failed') {
          throw new Error(data?.message || 'Generation failed');
        }
      } catch (error: any) {
        if (error.message.includes('Generation failed') || error.message.includes('timed out')) {
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

    const response = await this.executeWithRetry(async (family?: number) => {
      const axiosConfig: any = {
        method: 'GET',
        url: resultUrl,
        responseType: 'stream',
        timeout: this.retryConfig.networkTimeoutMs,
      };
      if (family) axiosConfig.family = family;

      return await axios(axiosConfig);
    }, 'download');

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

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
    const stored = await this.download(result.result.sample, {
      extension: options.output_format === 'png' ? 'png' : 'jpg',
    });
    return { request, result, stored };
  }

  async generateFromImage(
    prompt: string,
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg',
    options: GenerateFromImageOptions = {}
  ): Promise<GenerateResult> {
    const modelPath = options.modelPathOverride || '/v1/flux-2-pro';
    const url = `${this.baseUrl}${modelPath}`;
    const headers = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'x-key': this.apiKey,
    };
    const base64 = imageBuffer.toString('base64');
    const imageDataUrl = `data:${mimeType};base64,${base64}`;

    const body = {
      prompt,
      input_image: imageDataUrl,
      output_format: options.output_format || 'jpeg',
      safety_tolerance: options.safety_tolerance ?? 2,
      ...(options.width && { width: options.width }),
      ...(options.height && { height: options.height }),
      ...(options.seed && { seed: options.seed }),
    };

    console.log(
      `[FluxImageService] Submitting image-to-image request to ${url}, image size: ${Math.round(imageBuffer.length / 1024)}KB`
    );

    const request = await this.executeWithRetry(async (family?: number) => {
      const axiosConfig: any = {
        headers,
        timeout: this.retryConfig.networkTimeoutMs,
      };
      if (family) axiosConfig.family = family;

      const res = await axios.post<SubmitResponse>(url, body, axiosConfig);
      return res.data;
    }, 'generateFromImage');

    const { id, polling_url } = request;
    console.log(`[FluxImageService] Image-to-image request submitted successfully, ID: ${id}`);

    const result = await this.poll(polling_url, id, options);
    if (result?.status !== 'Ready' || !result?.result?.sample) {
      console.log(`[FluxImageService] Image-to-image generation failed, status: ${result?.status}`);
      throw new Error('No sample URL in result');
    }

    console.log(`[FluxImageService] Image-to-image generation completed successfully`);
    const stored = await this.download(result.result.sample, {
      extension: options.output_format === 'png' ? 'png' : 'jpg',
    });
    return { request, result, stored };
  }
}

export default FluxImageService;
