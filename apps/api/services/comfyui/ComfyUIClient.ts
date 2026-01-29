import { randomUUID } from 'crypto';
import { promisify } from 'util';

import { WebSocket } from 'ws';

const sleep = promisify(setTimeout);

export interface ComfyUIClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  wsReconnectAttempts?: number;
}

export interface QueuePromptResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

export interface HistoryOutput {
  images?: Array<{
    filename: string;
    subfolder: string;
    type: string;
  }>;
}

export interface HistoryResponse {
  [promptId: string]: {
    prompt: unknown[];
    outputs: Record<string, HistoryOutput>;
    status: {
      status_str: string;
      completed: boolean;
      messages: Array<[string, Record<string, unknown>]>;
    };
  };
}

export interface SystemStatsResponse {
  system: {
    os: string;
    python_version: string;
    embedded_python: boolean;
  };
  devices: Array<{
    name: string;
    type: string;
    index: number;
    vram_total: number;
    vram_free: number;
    torch_vram_total: number;
    torch_vram_free: number;
  }>;
}

interface WebSocketMessage {
  type: string;
  data: {
    prompt_id?: string;
    node?: string;
    output?: Record<string, unknown>;
    value?: number;
    max?: number;
    [key: string]: unknown;
  };
}

class ComfyUIClient {
  private baseUrl: string;
  private timeoutMs: number;
  private wsReconnectAttempts: number;
  private clientId: string;

  constructor(options: ComfyUIClientOptions = {}) {
    this.baseUrl = options.baseUrl || process.env.COMFYUI_URL || 'http://comfyui:8188';
    this.timeoutMs = options.timeoutMs || parseInt(process.env.COMFYUI_TIMEOUT_MS || '300000', 10);
    this.wsReconnectAttempts = options.wsReconnectAttempts || 3;
    this.clientId = randomUUID();

    // Remove trailing slash if present
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
  }

  private get wsUrl(): string {
    return this.baseUrl.replace(/^http/, 'ws') + `/ws?clientId=${this.clientId}`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/system_stats`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getSystemStats(): Promise<SystemStatsResponse> {
    const response = await fetch(`${this.baseUrl}/system_stats`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Failed to get system stats: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async uploadImage(
    imageBuffer: Buffer,
    filename: string,
    subfolder: string = ''
  ): Promise<{ name: string; subfolder: string; type: string }> {
    const formData = new FormData();
    // Use ArrayBuffer.slice to create a copy and assert as ArrayBuffer
    // (Node.js Buffers never use SharedArrayBuffer in practice)
    const arrayBuffer = imageBuffer.buffer.slice(
      imageBuffer.byteOffset,
      imageBuffer.byteOffset + imageBuffer.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'image/png' });
    formData.append('image', blob, filename);
    if (subfolder) {
      formData.append('subfolder', subfolder);
    }
    formData.append('type', 'input');
    formData.append('overwrite', 'true');

    const response = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to upload image: ${response.status} ${response.statusText} - ${text}`
      );
    }

    return response.json();
  }

  async queuePrompt(workflow: Record<string, unknown>): Promise<QueuePromptResponse> {
    const payload = {
      prompt: workflow,
      client_id: this.clientId,
    };

    const response = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to queue prompt: ${response.status} ${response.statusText} - ${text}`
      );
    }

    return response.json();
  }

  async getHistory(promptId: string): Promise<HistoryResponse> {
    const response = await fetch(`${this.baseUrl}/history/${promptId}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getImage(
    filename: string,
    subfolder: string = '',
    type: string = 'output'
  ): Promise<Buffer> {
    const params = new URLSearchParams({
      filename,
      subfolder,
      type,
    });

    const response = await fetch(`${this.baseUrl}/view?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      throw new Error(`Failed to get image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async waitForResult(promptId: string): Promise<Buffer[]> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let ws: WebSocket | null = null;
      let reconnectCount = 0;
      let isResolved = false;

      const cleanup = () => {
        if (ws) {
          try {
            ws.close();
          } catch {
            // Ignore close errors
          }
          ws = null;
        }
      };

      const timeoutCheck = setInterval(() => {
        if (Date.now() - startTime > this.timeoutMs) {
          clearInterval(timeoutCheck);
          cleanup();
          if (!isResolved) {
            isResolved = true;
            reject(
              new Error(`Generation timed out after ${Math.round(this.timeoutMs / 1000)} seconds`)
            );
          }
        }
      }, 1000);

      const connect = () => {
        if (isResolved) return;

        console.log(`[ComfyUIClient] Connecting to WebSocket: ${this.wsUrl}`);
        ws = new WebSocket(this.wsUrl);

        ws.on('open', () => {
          console.log('[ComfyUIClient] WebSocket connected');
          reconnectCount = 0;
        });

        ws.on('message', async (data: Buffer) => {
          try {
            const message: WebSocketMessage = JSON.parse(data.toString());

            if (message.type === 'executing' && message.data.prompt_id === promptId) {
              if (message.data.node === null) {
                // Execution complete
                console.log(`[ComfyUIClient] Execution complete for prompt ${promptId}`);
                clearInterval(timeoutCheck);
                cleanup();

                if (isResolved) return;
                isResolved = true;

                // Fetch images from history
                try {
                  const images = await this.fetchImagesFromHistory(promptId);
                  resolve(images);
                } catch (err) {
                  reject(err);
                }
              }
            } else if (message.type === 'progress') {
              const value = message.data.value || 0;
              const max = message.data.max || 1;
              console.log(
                `[ComfyUIClient] Progress: ${value}/${max} (${Math.round((value / max) * 100)}%)`
              );
            } else if (message.type === 'execution_error' && message.data.prompt_id === promptId) {
              clearInterval(timeoutCheck);
              cleanup();
              if (!isResolved) {
                isResolved = true;
                reject(new Error(`Execution error: ${JSON.stringify(message.data)}`));
              }
            }
          } catch (err) {
            console.error('[ComfyUIClient] Error parsing WebSocket message:', err);
          }
        });

        ws.on('error', (err) => {
          console.error('[ComfyUIClient] WebSocket error:', err);
        });

        ws.on('close', () => {
          console.log('[ComfyUIClient] WebSocket closed');
          if (!isResolved && reconnectCount < this.wsReconnectAttempts) {
            reconnectCount++;
            console.log(
              `[ComfyUIClient] Reconnecting (attempt ${reconnectCount}/${this.wsReconnectAttempts})...`
            );
            setTimeout(connect, 1000);
          }
        });
      };

      connect();
    });
  }

  private async fetchImagesFromHistory(promptId: string): Promise<Buffer[]> {
    // Wait a bit for history to be updated
    await sleep(500);

    const history = await this.getHistory(promptId);
    const promptHistory = history[promptId];

    if (!promptHistory) {
      throw new Error(`No history found for prompt ${promptId}`);
    }

    if (!promptHistory.status.completed) {
      throw new Error(`Prompt ${promptId} did not complete successfully`);
    }

    const images: Buffer[] = [];

    // Find all output images
    for (const nodeId of Object.keys(promptHistory.outputs)) {
      const output = promptHistory.outputs[nodeId];
      if (output.images && Array.isArray(output.images)) {
        for (const imageInfo of output.images) {
          const imageBuffer = await this.getImage(
            imageInfo.filename,
            imageInfo.subfolder,
            imageInfo.type
          );
          images.push(imageBuffer);
        }
      }
    }

    if (images.length === 0) {
      throw new Error(`No images found in output for prompt ${promptId}`);
    }

    return images;
  }

  async pollForResult(promptId: string): Promise<Buffer[]> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < this.timeoutMs) {
      try {
        const history = await this.getHistory(promptId);
        const promptHistory = history[promptId];

        if (promptHistory && promptHistory.status.completed) {
          console.log(`[ComfyUIClient] Generation complete via polling`);
          return this.fetchImagesFromHistory(promptId);
        }

        // Check for errors in messages
        if (promptHistory?.status?.messages) {
          for (const [msgType, msgData] of promptHistory.status.messages) {
            if (msgType === 'execution_error') {
              throw new Error(`Execution error: ${JSON.stringify(msgData)}`);
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message.includes('Execution error')) {
          throw err;
        }
        // Ignore other errors, keep polling
      }

      await sleep(pollInterval);
    }

    throw new Error(`Generation timed out after ${Math.round(this.timeoutMs / 1000)} seconds`);
  }

  async generateImage(workflow: Record<string, unknown>): Promise<Buffer[]> {
    // Queue the workflow
    const queueResponse = await this.queuePrompt(workflow);
    const promptId = queueResponse.prompt_id;

    console.log(`[ComfyUIClient] Queued workflow with prompt_id: ${promptId}`);

    // Check for immediate errors
    if (Object.keys(queueResponse.node_errors || {}).length > 0) {
      throw new Error(`Workflow has node errors: ${JSON.stringify(queueResponse.node_errors)}`);
    }

    // Try WebSocket first, fall back to polling
    try {
      return await this.waitForResult(promptId);
    } catch (wsError) {
      console.warn(`[ComfyUIClient] WebSocket failed, falling back to polling:`, wsError);
      return await this.pollForResult(promptId);
    }
  }
}

export default ComfyUIClient;
