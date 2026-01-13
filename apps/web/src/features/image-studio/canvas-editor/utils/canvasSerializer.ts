/**
 * Canvas State Serializer
 * Converts GenericCanvas state to Free Canvas API request format
 * Maps frontend Konva.js layer instances to backend rendering format
 */

interface BalkenData {
  id: string;
  mode: string;
  colorSchemeId?: string;
  texts?: string[];
  x: number;
  y: number;
  rotation: number;
  scale: number;
  widthScale: number;
  opacity: number;
}

interface IllustrationData {
  id: string;
  source: string;
  illustrationId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  color?: string;
  mood?: string;
}

interface ShapeData {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

interface IconData {
  id: string;
  iconId: string;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  opacity: number;
}

interface TextData {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  color: string;
  maxWidth: number;
  align: string;
  rotation: number;
  opacity: number;
}

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
    balkens?: BalkenData[];
    illustrations?: IllustrationData[];
    shapes?: ShapeData[];
    icons?: IconData[];
    texts?: TextData[];
  };
}

interface CanvasState {
  backgroundImage?: string | null;
  backgroundColor?: string;
  balkenInstances?: Record<string, unknown>[];
  illustrationInstances?: Record<string, unknown>[];
  shapeInstances?: Record<string, unknown>[];
  iconInstances?: Record<string, unknown>[];
  textInstances?: Record<string, unknown>[];
  layerOrder?: string[];
}

interface CanvasConfig {
  canvas?: {
    width: number;
    height: number;
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
  config: CanvasConfig,
  state: CanvasState
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

  const balkens = state.balkenInstances?.map((balken: Record<string, unknown>) => ({
    id: String(balken.id),
    mode: String(balken.mode),
    colorSchemeId: balken.colorSchemeId ? String(balken.colorSchemeId) : undefined,
    texts: Array.isArray(balken.texts) ? balken.texts : undefined,
    x: ((balken.offset as Record<string, number> | undefined)?.x) || (balken.x as number) || 540,
    y: ((balken.offset as Record<string, number> | undefined)?.y) || (balken.y as number) || 675,
    rotation: (balken.rotation as number) || 0,
    scale: (balken.scale as number) || 1.0,
    widthScale: (balken.widthScale as number) || 1.0,
    opacity: (balken.opacity as number) ?? 1.0
  } as BalkenData));

  const illustrations = state.illustrationInstances?.map((illust: Record<string, unknown>) => ({
    id: String(illust.id),
    source: String(illust.source),
    illustrationId: String(illust.illustrationId),
    x: illust.x as number,
    y: illust.y as number,
    scale: (illust.scale as number) || 1.0,
    rotation: (illust.rotation as number) || 0,
    opacity: (illust.opacity as number) ?? 1.0,
    color: illust.color ? String(illust.color) : undefined,
    mood: illust.mood ? String(illust.mood) : undefined
  } as IllustrationData));

  const shapes = state.shapeInstances?.map((shape: Record<string, unknown>) => ({
    id: String(shape.id),
    type: String(shape.type),
    x: shape.x as number,
    y: shape.y as number,
    width: shape.width as number,
    height: shape.height as number,
    fill: String(shape.fill),
    rotation: (shape.rotation as number) || 0,
    scaleX: (shape.scaleX as number) || 1.0,
    scaleY: (shape.scaleY as number) || 1.0,
    opacity: (shape.opacity as number) ?? 1.0
  } as ShapeData));

  const icons = state.iconInstances?.map((icon: Record<string, unknown>) => ({
    id: String(icon.id),
    iconId: String(icon.iconId),
    x: icon.x as number,
    y: icon.y as number,
    size: (icon.size as number) || 64,
    color: (icon.color as string) || '#005538',
    rotation: (icon.rotation as number) || 0,
    opacity: (icon.opacity as number) ?? 1.0
  } as IconData));

  const texts = state.textInstances?.map((text: Record<string, unknown>) => ({
    id: String(text.id),
    text: String(text.text),
    x: text.x as number,
    y: text.y as number,
    fontSize: text.fontSize as number,
    fontFamily: (text.fontFamily as string) || 'GrueneTypeNeue',
    fontStyle: (text.fontStyle as string) || 'normal',
    color: (text.color as string) || '#FFFFFF',
    maxWidth: text.maxWidth as number,
    align: (text.align as string) || 'left',
    rotation: (text.rotation as number) || 0,
    opacity: (text.opacity as number) ?? 1.0
  } as TextData));

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

interface ExportResult {
  image?: string;
}

/**
 * Export canvas as PNG via Free Canvas API
 * @param config - Canvas configuration
 * @param state - Canvas state
 * @param apiEndpoint - API endpoint URL (default: '/api/sharepic/simple_canvas')
 * @returns Base64 PNG data URL or null on error
 */
export async function exportFreeCanvas(
  config: CanvasConfig,
  state: CanvasState,
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
      return null;
    }

    const result = (await response.json()) as ExportResult;
    return result.image || null;
  } catch (error) {
    return null;
  }
}
