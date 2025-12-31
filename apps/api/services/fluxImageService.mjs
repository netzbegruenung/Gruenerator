import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
const sleep = promisify(setTimeout);

class FluxImageService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.BFL_API_KEY;
    this.baseUrl = options.baseUrl || 'https://api.eu.bfl.ai';
    this.modelPath = options.modelPath || '/v1/flux-2-pro';
    
    // Retry configuration
    this.retryConfig = {
      maxRetries: options.maxRetries || parseInt(process.env.FLUX_MAX_RETRIES, 10) || 3,
      baseDelay: options.baseDelay || parseInt(process.env.FLUX_BASE_DELAY, 10) || 1000,
      maxDelay: options.maxDelay || parseInt(process.env.FLUX_MAX_DELAY, 10) || 30000,
      jitterFactor: options.jitterFactor || 0.1,
      networkTimeoutMs: options.networkTimeoutMs || 60000
    };
    
    // Error classification
    this.retryableErrors = new Set([
      'ENETUNREACH', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED',
      '429', '500', '502', '503', '504'
    ]);
    
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      threshold: 5,
      timeout: 60000
    };
    
    if (!this.apiKey) {
      console.warn('[FluxImageService] Missing BFL_API_KEY');
    }
  }

  async submit(prompt, options = {}) {
    const modelPath = options.modelPathOverride || this.modelPath;
    const url = `${this.baseUrl}${modelPath}`;
    const headers = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'x-key': this.apiKey
    };
    const body = {
      prompt,
      ...(options.width && { width: options.width }),
      ...(options.height && { height: options.height }),
      ...(options.aspect_ratio && { aspect_ratio: options.aspect_ratio }),
      output_format: options.output_format || 'jpeg',
      safety_tolerance: options.safety_tolerance ?? 2,
      prompt_upsampling: options.prompt_upsampling ?? false
    };

    console.log(`[FluxImageService] Submitting text-to-image request to ${url}`);
    
    return await this.executeWithRetry(async (family) => {
      const axiosConfig = { 
        headers, 
        timeout: this.retryConfig.networkTimeoutMs
      };
      if (family) axiosConfig.family = family;
      
      const res = await axios.post(url, body, axiosConfig);
      console.log(`[FluxImageService] Text-to-image request submitted successfully, ID: ${res.data?.id}`);
      return res.data;
    }, 'submit');
  }

  // Core retry mechanism with exponential backoff and intelligent network fallback
  async executeWithRetry(operation, operationType = 'unknown') {
    if (this.isCircuitBreakerOpen()) {
      throw new Error(`Circuit breaker is open for ${operationType}. Service temporarily unavailable.`);
    }

    let lastError;
    const networkPreferences = [undefined, 4, 6]; // Try default, then IPv4, then IPv6
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      // Try different network preferences for network errors
      const isNetworkRetry = lastError?.code && this.retryableErrors.has(lastError.code);
      const networkOptions = isNetworkRetry ? networkPreferences : [undefined];
      
      for (const family of networkOptions) {
        try {
          const result = await operation(family);
          // Reset circuit breaker on success
          this.resetCircuitBreaker();
          if (family && lastError?.code) {
            console.log(`[FluxImageService] ${operationType} succeeded using IPv${family} after network error`);
          }
          return result;
        } catch (error) {
          lastError = error;
          const errorInfo = this.classifyError(error);
          
          // If this is a network error and we haven't tried all network options, continue
          if (errorInfo.type === 'network' && family !== networkOptions[networkOptions.length - 1]) {
            console.log(`[FluxImageService] ${operationType} failed with IPv${family || 'default'}, trying next network option`);
            continue;
          }
          
          console.log(`[FluxImageService] ${operationType} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), error: ${errorInfo.type} - ${error.message}`);
          
          // Break out of network options loop to try next attempt
          break;
        }
      }
      
      const errorInfo = this.classifyError(lastError);
      
      // Don't retry on final attempt or non-retryable errors
      if (attempt === this.retryConfig.maxRetries || !errorInfo.retryable) {
        this.recordFailure();
        break;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = this.calculateDelay(attempt);
      console.log(`[FluxImageService] Waiting ${delay}ms before retry...`);
      await sleep(delay);
    }
    
    // Final error handling
    const finalError = this.createUserFriendlyError(lastError);
    throw finalError;
  }
  
  // Classify errors for retry decisions
  classifyError(error) {
    const status = error.response?.status?.toString();
    const code = error.code;
    
    // Network errors
    if (code && this.retryableErrors.has(code)) {
      return { type: 'network', retryable: true, userMessage: 'Network connection issue' };
    }
    
    // HTTP status errors
    if (status) {
      if (status === '402') {
        return { type: 'billing', retryable: false, userMessage: 'Insufficient credits. Please add credits to your account.' };
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
  
  // Calculate exponential backoff delay with jitter
  calculateDelay(attempt) {
    const exponentialDelay = this.retryConfig.baseDelay * Math.pow(2, attempt);
    const jitter = exponentialDelay * this.retryConfig.jitterFactor * Math.random();
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelay);
  }
  
  // Circuit breaker implementation
  isCircuitBreakerOpen() {
    if (this.circuitBreaker.failures < this.circuitBreaker.threshold) {
      return false;
    }
    
    const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
    return timeSinceLastFailure < this.circuitBreaker.timeout;
  }
  
  recordFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
  }
  
  resetCircuitBreaker() {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailureTime = null;
  }
  
  // Create user-friendly error messages
  createUserFriendlyError(originalError) {
    const errorInfo = this.classifyError(originalError);
    const error = new Error(errorInfo.userMessage);
    error.originalError = originalError;
    error.type = errorInfo.type;
    error.retryable = errorInfo.retryable;
    return error;
  }

  async poll(pollingUrl, requestId, options = {}) {
    const headers = { accept: 'application/json', 'x-key': this.apiKey };
    const intervalMs = options.intervalMs || 500;
    const timeoutMs = options.timeoutMs || 120000;
    const start = Date.now();

    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('Polling timed out after ' + Math.round(timeoutMs / 1000) + ' seconds');
      }
      
      try {
        const data = await this.executeWithRetry(async (family) => {
          const axiosConfig = {
            headers,
            params: requestId ? { id: requestId } : undefined,
            timeout: 30000
          };
          if (family) axiosConfig.family = family;
          
          const res = await axios.get(pollingUrl, axiosConfig);
          return res.data;
        }, 'poll');
        
        if (data?.status === 'Ready') return data;
        if (data?.status === 'Error' || data?.status === 'Failed') {
          throw new Error(data?.message || 'Generation failed');
        }
      } catch (error) {
        // If it's a generation failure or timeout, don't retry the whole polling
        if (error.message.includes('Generation failed') || error.message.includes('timed out')) {
          throw error;
        }
        // For other errors, let the retry mechanism handle it
        throw error;
      }
      
      await sleep(intervalMs);
    }
  }

  async download(resultUrl, options = {}) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const baseDir = options.baseDir || path.join(process.cwd(), 'uploads', 'flux', 'results', today);
    const extension = options.extension || 'jpg';
    const nameBase = options.fileNameBase || `generated_image_${now.toISOString().replace(/[:.]/g, '-')}`;
    const filename = `${nameBase}.${extension}`;
    const filePath = path.join(baseDir, filename);
    fs.mkdirSync(baseDir, { recursive: true });

    const response = await this.executeWithRetry(async (family) => {
      const axiosConfig = { 
        method: 'GET', 
        url: resultUrl, 
        responseType: 'stream', 
        timeout: this.retryConfig.networkTimeoutMs
      };
      if (family) axiosConfig.family = family;
      
      return await axios(axiosConfig);
    }, 'download');

    await new Promise((resolve, reject) => {
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

  async generateFromPrompt(prompt, options = {}) {
    const request = await this.submit(prompt, options);
    const { id, polling_url } = request;
    const result = await this.poll(polling_url, id, options);
    if (result?.status !== 'Ready' || !result?.result?.sample) {
      throw new Error('No sample URL in result');
    }
    const stored = await this.download(result.result.sample, { extension: options.output_format === 'png' ? 'png' : 'jpg' });
    return { request, result, stored };
  }

  async generateFromImage(prompt, imageBuffer, mimeType = 'image/jpeg', options = {}) {
    const modelPath = options.modelPathOverride || '/v1/flux-2-pro';
    const url = `${this.baseUrl}${modelPath}`;
    const headers = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'x-key': this.apiKey
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
      ...(options.seed && { seed: options.seed })
    };

    console.log(`[FluxImageService] Submitting image-to-image request to ${url}, image size: ${Math.round(imageBuffer.length / 1024)}KB`);
    
    const request = await this.executeWithRetry(async (family) => {
      const axiosConfig = { 
        headers, 
        timeout: this.retryConfig.networkTimeoutMs
      };
      if (family) axiosConfig.family = family;
      
      const res = await axios.post(url, body, axiosConfig);
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
    const stored = await this.download(result.result.sample, { extension: options.output_format === 'png' ? 'png' : 'jpg' });
    return { request, result, stored };
  }
}

export default FluxImageService;


