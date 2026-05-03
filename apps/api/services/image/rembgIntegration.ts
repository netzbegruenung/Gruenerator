/**
 * Rembg integration
 * Calls the self-hosted rembg sidecar container for background removal.
 * See: https://github.com/danielgatis/rembg (HTTP server mode: `rembg s`)
 *
 * Mirror of the docling-serve integration in OcrService/doclingIntegration.ts.
 */

import { env } from '../../config/env.js';

const REMBG_BASE_URL = env.REMBG_URL ?? 'http://rembg:7000';

const REMBG_TIMEOUT_MS = 60_000;

/**
 * Send an image buffer to rembg and receive a transparent PNG buffer back.
 * The PNG response body is the raw bytes (image/png) — no JSON wrapper.
 */
export async function removeBackgroundWithRembg(
  imageBuffer: Buffer,
  fileName = 'image.png'
): Promise<Buffer> {
  const startTime = Date.now();

  try {
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(imageBuffer)]), fileName);

    console.log(
      `[Rembg] POST ${REMBG_BASE_URL}/api/remove (${imageBuffer.length} bytes, file=${fileName})`
    );

    const response = await fetch(`${REMBG_BASE_URL}/api/remove`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(REMBG_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(`Rembg API returned ${response.status}: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const elapsed = Date.now() - startTime;
    console.log(`[Rembg] OK after ${elapsed}ms, ${arrayBuffer.byteLength} bytes returned`);
    return Buffer.from(arrayBuffer);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Rembg] FAILED after ${elapsed}ms: ${errMsg}`);
    throw new Error(`Background removal failed: ${errMsg}`);
  }
}

/**
 * Check if the rembg sidecar is healthy and reachable.
 * Rembg's HTTP server exposes `/api` for the OpenAPI docs page; a 200 there
 * means the process is up.
 */
export async function isRembgAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${REMBG_BASE_URL}/api`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
