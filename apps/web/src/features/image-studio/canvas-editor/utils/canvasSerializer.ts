/**
 * Canvas State Serializer
 * Converts GenericCanvas state to Free Canvas API request format
 * Maps frontend Konva.js layer instances to backend rendering format
 */

interface FreeCanvasRequest {
  canvasWidth: number;
  canvasHeight: number;
  background: {
    type: 'color' | 'image';
    color?: string;
    imageData?: string;
  };
  layerOrder: string[];
  layers: {
    balkens?: any[];
    illustrations?: any[];
    shapes?: any[];
    icons?: any[];
    texts?: any[];
  };
}

/**
 * Serialize canvas state for Free Canvas API
 * Note: This is a basic serializer - actual implementation depends on
 * the specific GenericCanvas state structure used in your frontend
 *
 * @param config - Canvas configuration
 * @param state - Canvas state from GenericCanvas
 * @returns Serialized request for Free Canvas API
 */
export function serializeCanvasState(
  config: any,
  state: any
): FreeCanvasRequest {
  const background = state.backgroundImage
    ? {
        type: 'image' as const,
        imageData: state.backgroundImage
      }
    : {
        type: 'color' as const,
        color: state.backgroundColor || '#F5F1E9'
      };

  const balkens = state.balkenInstances?.map((balken: any) => ({
    id: balken.id,
    mode: balken.mode,
    colorSchemeId: balken.colorSchemeId,
    texts: balken.texts,
    x: balken.offset?.x || balken.x || 540,
    y: balken.offset?.y || balken.y || 675,
    rotation: balken.rotation || 0,
    scale: balken.scale || 1.0,
    widthScale: balken.widthScale || 1.0,
    opacity: balken.opacity ?? 1.0
  }));

  const illustrations = state.illustrationInstances?.map((illust: any) => ({
    id: illust.id,
    source: illust.source,
    illustrationId: illust.illustrationId,
    x: illust.x,
    y: illust.y,
    scale: illust.scale || 1.0,
    rotation: illust.rotation || 0,
    opacity: illust.opacity ?? 1.0,
    color: illust.color,
    mood: illust.mood
  }));

  const shapes = state.shapeInstances?.map((shape: any) => ({
    id: shape.id,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    fill: shape.fill,
    rotation: shape.rotation || 0,
    scaleX: shape.scaleX || 1.0,
    scaleY: shape.scaleY || 1.0,
    opacity: shape.opacity ?? 1.0
  }));

  const icons = state.iconInstances?.map((icon: any) => ({
    id: icon.id,
    iconId: icon.iconId,
    x: icon.x,
    y: icon.y,
    size: icon.size || 64,
    color: icon.color || '#005538',
    rotation: icon.rotation || 0,
    opacity: icon.opacity ?? 1.0
  }));

  const texts = state.textInstances?.map((text: any) => ({
    id: text.id,
    text: text.text,
    x: text.x,
    y: text.y,
    fontSize: text.fontSize,
    fontFamily: text.fontFamily || 'GrueneTypeNeue',
    fontStyle: text.fontStyle || 'normal',
    color: text.color || '#FFFFFF',
    maxWidth: text.maxWidth,
    align: text.align || 'left',
    rotation: text.rotation || 0,
    opacity: text.opacity ?? 1.0
  }));

  const layerOrder = state.layerOrder || [];

  return {
    canvasWidth: config.canvas?.width || 1080,
    canvasHeight: config.canvas?.height || 1350,
    background,
    layerOrder,
    layers: {
      balkens,
      illustrations,
      shapes,
      icons,
      texts
    }
  };
}

/**
 * Export canvas as PNG via Free Canvas API
 * @param config - Canvas configuration
 * @param state - Canvas state
 * @param apiEndpoint - API endpoint URL (default: '/api/sharepic/simple_canvas')
 * @returns Base64 PNG data URL or null on error
 */
export async function exportFreeCanvas(
  config: any,
  state: any,
  apiEndpoint: string = '/api/sharepic/simple_canvas'
): Promise<string | null> {
  try {
    const serialized = serializeCanvasState(config, state);

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(serialized)
    });

    if (!response.ok) {
      const errorData = await response.json();
      return null;
    }

    const result = await response.json();
    return result.image;
  } catch (error) {
    return null;
  }
}
