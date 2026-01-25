/**
 * Layer Validation Utilities
 * Comprehensive validation for Free Canvas API requests
 * Security: Prevents path traversal, XSS, resource exhaustion
 */

import type {
  FreeCanvasRequest,
  LayerValidationResult,
  LayerCollection,
} from '../types/freeCanvasTypes.js';

const MIN_CANVAS_SIZE = 400;
const MAX_CANVAS_SIZE = 4000;
const MAX_LAYERS = 100;
const MAX_TEXT_LENGTH = 5000;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function validateCanvasDimensions(width: number, height: number): LayerValidationResult {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return {
      valid: false,
      error: 'Canvas dimensions must be integers',
    };
  }

  if (width < MIN_CANVAS_SIZE || width > MAX_CANVAS_SIZE) {
    return {
      valid: false,
      error: `Canvas width must be between ${MIN_CANVAS_SIZE} and ${MAX_CANVAS_SIZE}px`,
    };
  }

  if (height < MIN_CANVAS_SIZE || height > MAX_CANVAS_SIZE) {
    return {
      valid: false,
      error: `Canvas height must be between ${MIN_CANVAS_SIZE} and ${MAX_CANVAS_SIZE}px`,
    };
  }

  return { valid: true };
}

export function validateColorFormat(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

export function validateIllustrationPath(illustrationId: string): LayerValidationResult {
  if (
    illustrationId.includes('..') ||
    illustrationId.includes('/') ||
    illustrationId.includes('\\')
  ) {
    return {
      valid: false,
      error: 'Invalid illustration filename: path traversal detected',
    };
  }

  if (illustrationId.length > 100) {
    return {
      valid: false,
      error: 'Illustration filename too long (max 100 characters)',
    };
  }

  return { valid: true };
}

export function validateLayerReferences(
  layerOrder: string[],
  layers: LayerCollection
): LayerValidationResult {
  const allLayerIds = new Set<string>();

  if (layers.balkens) {
    layers.balkens.forEach((b) => allLayerIds.add(b.id));
  }
  if (layers.illustrations) {
    layers.illustrations.forEach((i) => allLayerIds.add(i.id));
  }
  if (layers.shapes) {
    layers.shapes.forEach((s) => allLayerIds.add(s.id));
  }
  if (layers.icons) {
    layers.icons.forEach((i) => allLayerIds.add(i.id));
  }
  if (layers.texts) {
    layers.texts.forEach((t) => allLayerIds.add(t.id));
  }

  const missingIds = layerOrder.filter((id) => !allLayerIds.has(id));

  if (missingIds.length > 0) {
    return {
      valid: false,
      error: `Layer IDs in layerOrder not found in layers: ${missingIds.join(', ')}`,
    };
  }

  return { valid: true };
}

export function validateFreeCanvasRequest(request: FreeCanvasRequest): LayerValidationResult {
  if (!request.canvasWidth || !request.canvasHeight) {
    return {
      valid: false,
      error: 'Missing canvas dimensions',
    };
  }

  const dimensionsCheck = validateCanvasDimensions(request.canvasWidth, request.canvasHeight);
  if (!dimensionsCheck.valid) {
    return dimensionsCheck;
  }

  if (!request.background || !request.background.type) {
    return {
      valid: false,
      error: 'Missing background configuration',
    };
  }

  if (request.background.type === 'color' && request.background.color) {
    if (!validateColorFormat(request.background.color)) {
      return {
        valid: false,
        error: `Invalid background color format: ${request.background.color}. Use hex format #RRGGBB`,
      };
    }
  }

  if (request.background.type === 'image' && request.background.imageData) {
    if (!request.background.imageData.startsWith('data:image/')) {
      return {
        valid: false,
        error: 'Invalid image data URL format. Must start with "data:image/"',
      };
    }
  }

  if (!request.layerOrder || !Array.isArray(request.layerOrder)) {
    return {
      valid: false,
      error: 'Missing or invalid layerOrder array',
    };
  }

  if (!request.layers) {
    return {
      valid: false,
      error: 'Missing layers object',
    };
  }

  const totalLayers =
    (request.layers.balkens?.length || 0) +
    (request.layers.illustrations?.length || 0) +
    (request.layers.shapes?.length || 0) +
    (request.layers.icons?.length || 0) +
    (request.layers.texts?.length || 0);

  if (totalLayers > MAX_LAYERS) {
    return {
      valid: false,
      error: `Too many layers: ${totalLayers}. Maximum is ${MAX_LAYERS}`,
    };
  }

  const layerRefCheck = validateLayerReferences(request.layerOrder, request.layers);
  if (!layerRefCheck.valid) {
    return layerRefCheck;
  }

  if (request.layers.illustrations) {
    for (const illust of request.layers.illustrations) {
      const pathCheck = validateIllustrationPath(illust.illustrationId);
      if (!pathCheck.valid) {
        return pathCheck;
      }

      if (!['undraw', 'opendoodles', 'kawaii'].includes(illust.source)) {
        return {
          valid: false,
          error: `Invalid illustration source: ${illust.source}. Must be 'undraw', 'opendoodles', or 'kawaii'`,
        };
      }
    }
  }

  if (request.layers.texts) {
    for (const text of request.layers.texts) {
      if (text.text.length > MAX_TEXT_LENGTH) {
        return {
          valid: false,
          error: `Text too long: ${text.text.length} characters. Maximum is ${MAX_TEXT_LENGTH}`,
        };
      }

      if (text.color && !validateColorFormat(text.color)) {
        return {
          valid: false,
          error: `Invalid text color format: ${text.color}. Use hex format #RRGGBB`,
        };
      }
    }
  }

  if (request.layers.shapes) {
    for (const shape of request.layers.shapes) {
      if (shape.fill && !validateColorFormat(shape.fill)) {
        return {
          valid: false,
          error: `Invalid shape fill color: ${shape.fill}. Use hex format #RRGGBB`,
        };
      }
    }
  }

  if (request.layers.icons) {
    for (const icon of request.layers.icons) {
      if (icon.color && !validateColorFormat(icon.color)) {
        return {
          valid: false,
          error: `Invalid icon color: ${icon.color}. Use hex format #RRGGBB`,
        };
      }

      if (!icon.iconId.includes('-')) {
        return {
          valid: false,
          error: `Invalid icon ID format: ${icon.iconId}. Must be in format '{library}-{name}'`,
        };
      }
    }
  }

  return { valid: true };
}
