import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The share metadata the auto-save stored before the templates described
 * themselves (`FullCanvasConfig.shareMetadata`), kept verbatim as the
 * reference: each template must describe a design exactly as before.
 */

function legacyShareMetadata(
  canvasType: string,
  canvasState: Record<string, unknown>,
  hasOriginalImage: boolean
): Record<string, unknown> {
  const metadata: {
    content: Record<string, unknown>;
    styling: Record<string, unknown>;
    [key: string]: unknown;
  } = {
    sharepicType: canvasType,
    hasOriginalImage,
    content: {},
    styling: {},
    generatedAt: new Date().toISOString(),
  };

  // Extract canvas-specific content based on type
  if (canvasType === 'dreizeilen') {
    metadata.content = {
      line1: canvasState.line1 || '',
      line2: canvasState.line2 || '',
      line3: canvasState.line3 || '',
    };
    metadata.styling = {
      fontSize: canvasState.fontSize as number | undefined,
      colorScheme: canvasState.colorSchemeId as string | undefined,
      balkenWidthScale: canvasState.balkenWidthScale as number | undefined,
      balkenScale: canvasState.balkenScale as number | undefined,
      balkenOffset: canvasState.balkenOffset as number[] | undefined,
      barOffsets: canvasState.barOffsets as [number, number, number] | undefined,
      sunflowerPos: canvasState.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: canvasState.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: canvasState.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: canvasState.sunflowerOpacity as number | undefined,
      balkenOpacity: canvasState.balkenOpacity as number | undefined,
      currentImageSrc: canvasState.currentImageSrc as string | undefined,
      backgroundImageOpacity: canvasState.backgroundImageOpacity as number | undefined,
      imageOffset: canvasState.imageOffset as { x: number; y: number } | undefined,
      imageScale: canvasState.imageScale as number | undefined,
      selectedIcons: canvasState.selectedIcons as string[] | undefined,
      iconStates: canvasState.iconStates as Record<string, unknown> | undefined,
      shapeInstances: canvasState.shapeInstances as unknown[] | undefined,
      layerOrder: canvasState.layerOrder as string[] | undefined,
      additionalTexts: canvasState.additionalTexts as unknown[] | undefined,
    };
  } else if (canvasType === 'zitat' || canvasType === 'zitat-pure') {
    metadata.content = {
      quote: canvasState.quote || '',
      name: canvasState.name || '',
    };
    metadata.styling = {
      fontSize: canvasState.fontSize as number | undefined,
      colorScheme: canvasState.colorSchemeId as string | undefined,
      currentImageSrc: canvasState.currentImageSrc as string | undefined,
      backgroundImageOpacity: canvasState.backgroundImageOpacity as number | undefined,
      imageOffset: canvasState.imageOffset as { x: number; y: number } | undefined,
      imageScale: canvasState.imageScale as number | undefined,
      sunflowerPos: canvasState.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: canvasState.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: canvasState.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: canvasState.sunflowerOpacity as number | undefined,
      selectedIcons: canvasState.selectedIcons as string[] | undefined,
      iconStates: canvasState.iconStates as Record<string, unknown> | undefined,
      shapeInstances: canvasState.shapeInstances as unknown[] | undefined,
      layerOrder: canvasState.layerOrder as string[] | undefined,
      additionalTexts: canvasState.additionalTexts as unknown[] | undefined,
    };
  } else if (canvasType === 'info') {
    metadata.content = {
      header: canvasState.header || '',
      subheader: canvasState.subheader || '',
      body: canvasState.body || '',
    };
    metadata.styling = {
      fontSize: canvasState.fontSize as number | undefined,
      colorScheme: canvasState.colorSchemeId as string | undefined,
      currentImageSrc: canvasState.currentImageSrc as string | undefined,
      backgroundImageOpacity: canvasState.backgroundImageOpacity as number | undefined,
      imageOffset: canvasState.imageOffset as { x: number; y: number } | undefined,
      imageScale: canvasState.imageScale as number | undefined,
      sunflowerPos: canvasState.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: canvasState.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: canvasState.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: canvasState.sunflowerOpacity as number | undefined,
      selectedIcons: canvasState.selectedIcons as string[] | undefined,
      iconStates: canvasState.iconStates as Record<string, unknown> | undefined,
      shapeInstances: canvasState.shapeInstances as unknown[] | undefined,
      layerOrder: canvasState.layerOrder as string[] | undefined,
      additionalTexts: canvasState.additionalTexts as unknown[] | undefined,
    };
  } else {
    // Generic canvas - store full state
    metadata.content = { canvasState };
    metadata.styling = {};
  }

  return metadata;
}

const STATE: Record<string, unknown> = {
  line1: 'Eins',
  line2: 'Zwei',
  line3: '',
  quote: 'Ein Zitat',
  name: 'Jemand',
  header: 'Kopf',
  subheader: 'Unterzeile',
  body: 'Text',
  fontSize: 42,
  colorSchemeId: 'tanne-sand',
  balkenWidthScale: 1.2,
  balkenScale: 0.9,
  balkenOffset: [1, 2, 3],
  barOffsets: [4, 5, 6],
  sunflowerPos: { x: 10, y: 20 },
  sunflowerSize: { w: 30, h: 40 },
  sunflowerVisible: true,
  sunflowerOpacity: 0.5,
  balkenOpacity: 0.8,
  currentImageSrc: '/photo.jpg',
  backgroundImageOpacity: 0.7,
  imageOffset: { x: 1, y: 2 },
  imageScale: 1.5,
  selectedIcons: ['icon-a'],
  iconStates: { 'icon-a': { x: 1 } },
  shapeInstances: [{ id: 's' }],
  layerOrder: ['a', 'b'],
  additionalTexts: [{ id: 't' }],
  unrelated: 'stays out',
};

const DESCRIBED = ['dreizeilen', 'zitat', 'zitat-pure', 'info'] as const;
type ConfigOf = Awaited<ReturnType<typeof loadCanvasConfig>>;

describe('share metadata of the Grünerator templates', () => {
  const configs = new Map<string, ConfigOf>();

  // Loading the template chunks cold outlasts a test's 5 s budget.
  beforeAll(async () => {
    for (const id of [...DESCRIBED, 'simple'] as const) configs.set(id, await loadCanvasConfig(id));
  }, 60_000);

  it.each(DESCRIBED)('%s describes a design as the auto-save did before', (id) => {
    const config = configs.get(id);
    const legacy = legacyShareMetadata(id, STATE, true);

    expect(config?.shareMetadata?.(STATE)).toEqual({
      content: legacy.content,
      styling: legacy.styling,
    });
  });

  it('leaves the other templates to the whole-state fallback', () => {
    expect(configs.get('simple')?.shareMetadata).toBeUndefined();
  });
});
