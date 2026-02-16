/**
 * FLUX.2 Prompt Builder
 * Based on official FLUX.2 Prompting Guide
 *
 * Framework: Subject + Action + Style + Context
 * Priority Order: Main subject → Key action → Critical style → Essential context → Secondary details
 * No negative prompts - describe what you want, not what you don't want
 */

export interface BrandColors {
  TANNE: string;
  KLEE: string;
  SAND: string;
  WHITE: string;
}

export const BRAND_COLORS: BrandColors = {
  TANNE: '#005538',
  KLEE: '#008939',
  SAND: '#F5F1E9',
  WHITE: '#FFFFFF',
};

export interface AspectRatioConfig {
  ratio: string;
  width: number;
  height: number;
  useCase: string;
}

export type AspectRatioKey =
  | 'square'
  | 'portrait'
  | 'landscape'
  | 'classic'
  | 'ultrawide'
  | 'instagram';

/**
 * Aspect Ratios with recommended dimensions
 * FLUX limits: Min 64x64, Max 4MP, multiples of 16
 */
export const ASPECT_RATIOS: Record<AspectRatioKey, AspectRatioConfig> = {
  square: { ratio: '1:1', width: 1024, height: 1024, useCase: 'Social media, product shots' },
  portrait: {
    ratio: '9:16',
    width: 768,
    height: 1360,
    useCase: 'Mobile content, stories, infographics',
  },
  landscape: { ratio: '16:9', width: 1360, height: 768, useCase: 'Landscapes, cinematic shots' },
  classic: { ratio: '4:3', width: 1152, height: 864, useCase: 'Magazine layouts, presentations' },
  ultrawide: { ratio: '21:9', width: 1680, height: 720, useCase: 'Panoramas, wide scenes' },
  instagram: { ratio: '4:5', width: 1088, height: 1360, useCase: 'Instagram posts' },
};

export interface VariantConfig {
  name: string;
  style: string;
  composition?: string;
  aspectRatio: AspectRatioKey;
  defaultAction: string;
  isPhoto?: boolean;
  isPixel?: boolean;
}

export type VariantKey =
  | 'light-top'
  | 'green-bottom'
  | 'realistic-top'
  | 'realistic-bottom'
  | 'pixel-top'
  | 'pixel-bottom'
  | 'editorial'
  | 'illustration-pure'
  | 'realistic-pure'
  | 'pixel-pure'
  | 'editorial-pure';

export const VARIANTS: Record<VariantKey, VariantConfig> = {
  'light-top': {
    name: 'Soft Illustration (Light Top)',
    style:
      'soft painterly illustration with gentle textures, warm atmospheric tones, subtle watercolor quality',
    composition: 'upper 25% light/white sky background smoothly fading into the scene below',
    aspectRatio: 'instagram',
    defaultAction: 'depicted in a warm inviting scene',
  },

  'green-bottom': {
    name: 'Soft Illustration (Green Bottom)',
    style:
      'soft painterly illustration with gentle textures, warm atmospheric tones, subtle watercolor quality',
    composition: 'lower 25% dark green area naturally blending from the scene above',
    aspectRatio: 'instagram',
    defaultAction: 'depicted in a warm inviting scene',
  },

  'realistic-top': {
    name: 'Realistic Photo (Light Top)',
    style:
      'photorealistic, natural photography, authentic documentary style, real people, genuine moment',
    composition: 'upper 25% bright sky or light background fading into the scene below',
    aspectRatio: 'instagram',
    defaultAction: 'captured in an authentic candid moment',
    isPhoto: true,
  },

  'realistic-bottom': {
    name: 'Realistic Photo (Green Bottom)',
    style:
      'photorealistic, natural photography, authentic documentary style, real people, genuine moment',
    composition: 'lower 25% dark green area naturally blending from the scene above',
    aspectRatio: 'instagram',
    defaultAction: 'captured in an authentic candid moment',
    isPhoto: true,
  },

  'pixel-top': {
    name: 'Pixel Art (Light Top)',
    style:
      'beautiful detailed pixel art, 16-bit retro game aesthetic, rich colors, intricate pixel-perfect details, nostalgic video game art style',
    composition: 'upper 25% light sky with pixel clouds fading into the scene below',
    aspectRatio: 'instagram',
    defaultAction: 'rendered in stunning pixel art',
    isPixel: true,
  },

  'pixel-bottom': {
    name: 'Pixel Art (Green Bottom)',
    style:
      'beautiful detailed pixel art, 16-bit retro game aesthetic, rich colors, intricate pixel-perfect details, nostalgic video game art style',
    composition: 'lower 25% dark green pixel area blending from the scene above',
    aspectRatio: 'instagram',
    defaultAction: 'rendered in stunning pixel art',
    isPixel: true,
  },

  editorial: {
    name: 'Editorial',
    style: 'editorial photography, magazine quality, professional studio lighting',
    composition: 'centered subject, clean background',
    aspectRatio: 'portrait',
    defaultAction: 'posed for editorial shoot',
  },

  'illustration-pure': {
    name: 'Illustration (Pure)',
    style:
      'soft painterly illustration with gentle textures, warm atmospheric tones, subtle watercolor quality, soft diffused lighting',
    aspectRatio: 'instagram',
    defaultAction: 'depicted in a warm inviting scene',
  },

  'realistic-pure': {
    name: 'Realistic (Pure)',
    style:
      'photorealistic, natural photography, authentic documentary style, real people, genuine moment, shot on Sony A7IV, 35mm lens, natural daylight',
    aspectRatio: 'instagram',
    defaultAction: 'captured in an authentic candid moment',
    isPhoto: true,
  },

  'pixel-pure': {
    name: 'Pixel Art (Pure)',
    style:
      'beautiful detailed pixel art, 16-bit retro game aesthetic, rich colors, intricate pixel-perfect details, nostalgic video game art style, inspired by classic SNES and Genesis games',
    aspectRatio: 'instagram',
    defaultAction: 'rendered in stunning pixel art',
    isPixel: true,
  },

  'editorial-pure': {
    name: 'Editorial (Pure)',
    style:
      'editorial photography, magazine quality, professional studio lighting, centered subject, clean background',
    aspectRatio: 'instagram',
    defaultAction: 'posed for editorial shoot',
  },
};

export interface PromptData {
  subject: string;
  action: string;
  style: string;
  composition?: string;
  color_palette?: string[];
  mood?: string;
  lighting?: string;
  rendering: string;
}

/**
 * Build prompt for illustration variants (light-top, green-bottom)
 */
export function buildIllustrationPrompt(
  subject: string,
  action: string | undefined,
  variant: VariantKey
): PromptData {
  const config = VARIANTS[variant];

  if (config.isPhoto) {
    return {
      subject: subject,
      action: action || config.defaultAction,
      style: `${config.style}, shot on Sony A7IV, 35mm lens, natural daylight`,
      composition: config.composition,
      mood: 'authentic, hopeful, community spirit',
      rendering: 'Real photograph. No illustration. Natural colors, genuine atmosphere.',
    };
  }

  if (config.isPixel) {
    return {
      subject: subject,
      action: action || config.defaultAction,
      style: `${config.style}, inspired by classic SNES and Genesis games`,
      composition: config.composition,
      color_palette: ['rich greens', 'warm earth tones', 'vibrant accents'],
      rendering:
        'Pure pixel art. Every pixel carefully placed. Dithering for gradients. Retro gaming masterpiece.',
    };
  }

  return {
    subject: subject,
    action: action || config.defaultAction,
    style: `${config.style}, soft diffused lighting`,
    composition: config.composition,
    color_palette: ['muted forest green', 'soft sage green', 'warm cream'],
    rendering: 'Pure visual illustration. Wordless artistic scene. Soft edges, gentle atmosphere.',
  };
}

/**
 * Flatten prompt object to natural language string
 * Optimized Priority Order: Subject → Action → Style → Context → Details
 */
export function flattenPromptToString(promptData: PromptData): string {
  const parts = [
    promptData.subject,
    promptData.action,
    promptData.style,
    promptData.composition ? `Composition: ${promptData.composition}` : null,
    promptData.color_palette
      ? `Colors: ${Array.isArray(promptData.color_palette) ? promptData.color_palette.join(', ') : promptData.color_palette}`
      : null,
    promptData.mood ? `Mood: ${promptData.mood}` : null,
    promptData.lighting ? `Lighting: ${promptData.lighting}` : null,
    promptData.rendering,
  ].filter(Boolean);

  return parts.join('. ');
}

export interface BuildFluxPromptOptions {
  variant?: VariantKey;
  subject: string;
  action?: string;
}

export interface BuildFluxPromptResult {
  prompt: string;
  dimensions: {
    width: number;
    height: number;
    ratio: string;
  };
}

/**
 * Main prompt builder function
 * Returns formatted prompt string based on variant
 *
 * @param options - Prompt building options
 * @returns Formatted prompt and dimensions
 */
export function buildFluxPrompt(options: BuildFluxPromptOptions): BuildFluxPromptResult {
  const { variant = 'light-top', subject, action } = options;

  const variantConfig = VARIANTS[variant] || VARIANTS['light-top'];
  const aspectConfig = ASPECT_RATIOS[variantConfig.aspectRatio] || ASPECT_RATIOS['instagram'];

  const promptData = buildIllustrationPrompt(subject, action, variant);
  const prompt = flattenPromptToString(promptData);

  return {
    prompt,
    dimensions: {
      width: aspectConfig.width,
      height: aspectConfig.height,
      ratio: aspectConfig.ratio,
    },
  };
}

export interface VariantInfo {
  id: string;
  name: string;
  aspectRatio: string;
  dimensions: string;
  useCase: string;
}

/**
 * Get available variants with their configurations
 */
export function getVariants(): VariantInfo[] {
  return Object.keys(VARIANTS).map((key) => {
    const variantKey = key as VariantKey;
    const config = VARIANTS[variantKey];
    const aspect = ASPECT_RATIOS[config.aspectRatio];
    return {
      id: key,
      name: config.name,
      aspectRatio: aspect.ratio,
      dimensions: `${aspect.width}x${aspect.height}`,
      useCase: aspect.useCase,
    };
  });
}

/**
 * Get aspect ratio configurations
 */
export function getAspectRatios(): Record<AspectRatioKey, AspectRatioConfig> {
  return ASPECT_RATIOS;
}
