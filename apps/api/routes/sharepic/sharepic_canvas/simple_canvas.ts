/**
 * Free Canvas API - Feature-Complete Canvas Renderer
 * JSON-based API supporting: balkens, illustrations, shapes, icons, multi-layer text
 * Replaces original simple_canvas.ts with comprehensive rendering capabilities
 */

import {
  createCanvas,
  type Canvas,
  type SKRSContext2D as CanvasRenderingContext2D,
} from '@napi-rs/canvas';
import { Router, type Request, type Response } from 'express';

import { registerFonts } from '../../../services/sharepic/canvas/fileManagement.js';
import {
  optimizeCanvasBuffer,
  bufferToBase64,
} from '../../../services/sharepic/canvas/imageOptimizer.js';
import { renderBackground } from '../../../services/sharepic/canvas/renderers/backgroundRenderer.js';
import { renderBalken } from '../../../services/sharepic/canvas/renderers/balkenRenderer.js';
import { renderIcon } from '../../../services/sharepic/canvas/renderers/iconRenderer.js';
import { renderIllustration } from '../../../services/sharepic/canvas/renderers/illustrationRenderer.js';
import { renderShape } from '../../../services/sharepic/canvas/renderers/shapeRenderer.js';
import { renderText } from '../../../services/sharepic/canvas/renderers/textRenderer.js';
import { validateFreeCanvasRequest } from '../../../services/sharepic/canvas/utils/layerValidator.js';
import { createLogger } from '../../../utils/logger.js';

import type {
  FreeCanvasRequest,
  FreeCanvasResponse,
} from '../../../services/sharepic/canvas/types/freeCanvasTypes.js';

const log = createLogger('simple_canvas');
const router: Router = Router();

try {
  registerFonts();
} catch (err) {
  log.error('Failed to register fonts:', err);
  process.exit(1);
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const requestData = req.body as FreeCanvasRequest;

    log.debug('Free canvas request received:', {
      canvasSize: `${requestData.canvasWidth}×${requestData.canvasHeight}`,
      backgroundType: requestData.background?.type,
      layerCount: requestData.layerOrder?.length || 0,
    });

    const validationResult = validateFreeCanvasRequest(requestData);
    if (!validationResult.valid) {
      log.warn('Validation failed:', validationResult.error);
      res.status(400).json({
        success: false,
        error: validationResult.error,
      });
      return;
    }

    const canvas: Canvas = createCanvas(requestData.canvasWidth, requestData.canvasHeight);
    const ctx: CanvasRenderingContext2D = canvas.getContext('2d');

    await renderBackground(ctx, requestData.background, canvas.width, canvas.height);

    let layersRendered = 0;

    for (const layerId of requestData.layerOrder) {
      const balken = requestData.layers.balkens?.find((b) => b.id === layerId);
      if (balken) {
        await renderBalken(ctx, balken, canvas.width, canvas.height);
        layersRendered++;
        continue;
      }

      const icon = requestData.layers.icons?.find((i) => i.id === layerId);
      if (icon) {
        await renderIcon(ctx, icon);
        layersRendered++;
        continue;
      }

      const shape = requestData.layers.shapes?.find((s) => s.id === layerId);
      if (shape) {
        renderShape(ctx, shape);
        layersRendered++;
        continue;
      }

      const text = requestData.layers.texts?.find((t) => t.id === layerId);
      if (text) {
        renderText(ctx, text);
        layersRendered++;
        continue;
      }

      const illustration = requestData.layers.illustrations?.find((i) => i.id === layerId);
      if (illustration) {
        await renderIllustration(ctx, illustration);
        layersRendered++;
        continue;
      }

      log.warn(`Layer not found: ${layerId}`);
    }

    const rawBuffer = canvas.toBuffer('image/png');
    const optimizedBuffer = await optimizeCanvasBuffer(rawBuffer);
    const base64Image = bufferToBase64(optimizedBuffer);

    const renderTime = Date.now() - startTime;

    log.debug('Free canvas render completed:', {
      layersRendered,
      renderTime: `${renderTime}ms`,
      outputSize: `${Math.round(optimizedBuffer.length / 1024)}KB`,
    });

    const response: FreeCanvasResponse = {
      success: true,
      image: base64Image,
      metadata: {
        width: canvas.width,
        height: canvas.height,
        layersRendered,
        renderTime,
      },
    };

    res.json(response);
  } catch (error) {
    log.error('Free canvas render error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
