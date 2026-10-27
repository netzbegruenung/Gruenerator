/**
 * What the Grünerator's gallery stores about an auto-saved sharepic of its
 * classic templates: the texts as `content`, the look as `styling`. The
 * fields are what share records have always carried; templates without a
 * description store their whole state.
 */
import type { ShareDescription } from '../configs/types';

/** Dreizeilen: three lines, bars and sunflower. */
export function dreizeilenShareMetadata(state: object): ShareDescription {
  // Boundary: the state is the template's own; the description reads it by key.
  const s = state as Record<string, unknown>;
  return {
    content: {
      line1: s.line1 || '',
      line2: s.line2 || '',
      line3: s.line3 || '',
    },
    styling: {
      fontSize: s.fontSize as number | undefined,
      colorScheme: s.colorSchemeId as string | undefined,
      balkenWidthScale: s.balkenWidthScale as number | undefined,
      balkenScale: s.balkenScale as number | undefined,
      balkenOffset: s.balkenOffset as number[] | undefined,
      barOffsets: s.barOffsets as [number, number, number] | undefined,
      sunflowerPos: s.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: s.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: s.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: s.sunflowerOpacity as number | undefined,
      balkenOpacity: s.balkenOpacity as number | undefined,
      currentImageSrc: s.currentImageSrc as string | undefined,
      backgroundImageOpacity: s.backgroundImageOpacity as number | undefined,
      imageOffset: s.imageOffset as { x: number; y: number } | undefined,
      imageScale: s.imageScale as number | undefined,
      selectedIcons: s.selectedIcons as string[] | undefined,
      iconStates: s.iconStates as Record<string, unknown> | undefined,
      shapeInstances: s.shapeInstances as unknown[] | undefined,
      layerOrder: s.layerOrder as string[] | undefined,
      additionalTexts: s.additionalTexts as unknown[] | undefined,
    },
  };
}

/** Zitat and Zitat pur: the quote and who said it. */
export function zitatShareMetadata(state: object): ShareDescription {
  // Boundary: the state is the template's own; the description reads it by key.
  const s = state as Record<string, unknown>;
  return {
    content: {
      quote: s.quote || '',
      name: s.name || '',
    },
    styling: {
      fontSize: s.fontSize as number | undefined,
      colorScheme: s.colorSchemeId as string | undefined,
      currentImageSrc: s.currentImageSrc as string | undefined,
      backgroundImageOpacity: s.backgroundImageOpacity as number | undefined,
      imageOffset: s.imageOffset as { x: number; y: number } | undefined,
      imageScale: s.imageScale as number | undefined,
      sunflowerPos: s.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: s.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: s.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: s.sunflowerOpacity as number | undefined,
      selectedIcons: s.selectedIcons as string[] | undefined,
      iconStates: s.iconStates as Record<string, unknown> | undefined,
      shapeInstances: s.shapeInstances as unknown[] | undefined,
      layerOrder: s.layerOrder as string[] | undefined,
      additionalTexts: s.additionalTexts as unknown[] | undefined,
    },
  };
}

/** Info: header, subheader and body. */
export function infoShareMetadata(state: object): ShareDescription {
  // Boundary: the state is the template's own; the description reads it by key.
  const s = state as Record<string, unknown>;
  return {
    content: {
      header: s.header || '',
      subheader: s.subheader || '',
      body: s.body || '',
    },
    styling: {
      fontSize: s.fontSize as number | undefined,
      colorScheme: s.colorSchemeId as string | undefined,
      currentImageSrc: s.currentImageSrc as string | undefined,
      backgroundImageOpacity: s.backgroundImageOpacity as number | undefined,
      imageOffset: s.imageOffset as { x: number; y: number } | undefined,
      imageScale: s.imageScale as number | undefined,
      sunflowerPos: s.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: s.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: s.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: s.sunflowerOpacity as number | undefined,
      selectedIcons: s.selectedIcons as string[] | undefined,
      iconStates: s.iconStates as Record<string, unknown> | undefined,
      shapeInstances: s.shapeInstances as unknown[] | undefined,
      layerOrder: s.layerOrder as string[] | undefined,
      additionalTexts: s.additionalTexts as unknown[] | undefined,
    },
  };
}
