/**
 * FLUX.2 Prompt Builder
 * Based on official FLUX.2 Prompting Guide
 *
 * Framework: Subject + Action + Style + Context
 * Priority Order: Main subject → Key action → Critical style → Essential context → Secondary details
 * No negative prompts - describe what you want, not what you don't want
 */

const BRAND_COLORS = {
  TANNE: '#005538',
  KLEE: '#008939',
  SAND: '#F5F1E9',
  WHITE: '#FFFFFF'
};

/**
 * Aspect Ratios with recommended dimensions
 * FLUX limits: Min 64x64, Max 4MP, multiples of 16
 */
const ASPECT_RATIOS = {
  'square': { ratio: '1:1', width: 1024, height: 1024, useCase: 'Social media, product shots' },
  'portrait': { ratio: '9:16', width: 768, height: 1360, useCase: 'Mobile content, stories, infographics' },
  'landscape': { ratio: '16:9', width: 1360, height: 768, useCase: 'Landscapes, cinematic shots' },
  'classic': { ratio: '4:3', width: 1152, height: 864, useCase: 'Magazine layouts, presentations' },
  'ultrawide': { ratio: '21:9', width: 1680, height: 720, useCase: 'Panoramas, wide scenes' },
  'instagram': { ratio: '4:5', width: 1080, height: 1350, useCase: 'Instagram posts' }
};

const VARIANTS = {
  'light-top': {
    name: 'Soft Illustration (Light Top)',
    style: 'soft painterly illustration with gentle textures, warm atmospheric tones, subtle watercolor quality',
    composition: 'upper 25% light/white sky background smoothly fading into the scene below',
    aspectRatio: 'instagram',
    defaultAction: 'depicted in a warm inviting scene'
  },

  'green-bottom': {
    name: 'Soft Illustration (Green Bottom)',
    style: 'soft painterly illustration with gentle textures, warm atmospheric tones, subtle watercolor quality',
    composition: 'lower 25% dark green area naturally blending from the scene above',
    aspectRatio: 'instagram',
    defaultAction: 'depicted in a warm inviting scene'
  },

  'realistic-top': {
    name: 'Realistic Photo (Light Top)',
    style: 'photorealistic, natural photography, authentic documentary style, real people, genuine moment',
    composition: 'upper 25% bright sky or light background fading into the scene below',
    aspectRatio: 'instagram',
    defaultAction: 'captured in an authentic candid moment',
    isPhoto: true
  },

  'realistic-bottom': {
    name: 'Realistic Photo (Green Bottom)',
    style: 'photorealistic, natural photography, authentic documentary style, real people, genuine moment',
    composition: 'lower 25% dark green area naturally blending from the scene above',
    aspectRatio: 'instagram',
    defaultAction: 'captured in an authentic candid moment',
    isPhoto: true
  },

  'pixel-top': {
    name: 'Pixel Art (Light Top)',
    style: 'beautiful detailed pixel art, 16-bit retro game aesthetic, rich colors, intricate pixel-perfect details, nostalgic video game art style',
    composition: 'upper 25% light sky with pixel clouds fading into the scene below',
    aspectRatio: 'instagram',
    defaultAction: 'rendered in stunning pixel art',
    isPixel: true
  },

  'pixel-bottom': {
    name: 'Pixel Art (Green Bottom)',
    style: 'beautiful detailed pixel art, 16-bit retro game aesthetic, rich colors, intricate pixel-perfect details, nostalgic video game art style',
    composition: 'lower 25% dark green pixel area blending from the scene above',
    aspectRatio: 'instagram',
    defaultAction: 'rendered in stunning pixel art',
    isPixel: true
  },

  'editorial': {
    name: 'Editorial',
    style: 'editorial photography, magazine quality, professional studio lighting',
    composition: 'centered subject, clean background',
    aspectRatio: 'portrait',
    defaultAction: 'posed for editorial shoot'
  },

  // Pure variants (no composition hints - full image without reserved space)
  'illustration-pure': {
    name: 'Illustration (Pure)',
    style: 'soft painterly illustration with gentle textures, warm atmospheric tones, subtle watercolor quality, soft diffused lighting',
    aspectRatio: 'instagram',
    defaultAction: 'depicted in a warm inviting scene'
  },

  'realistic-pure': {
    name: 'Realistic (Pure)',
    style: 'photorealistic, natural photography, authentic documentary style, real people, genuine moment, shot on Sony A7IV, 35mm lens, natural daylight',
    aspectRatio: 'instagram',
    defaultAction: 'captured in an authentic candid moment',
    isPhoto: true
  },

  'pixel-pure': {
    name: 'Pixel Art (Pure)',
    style: 'beautiful detailed pixel art, 16-bit retro game aesthetic, rich colors, intricate pixel-perfect details, nostalgic video game art style, inspired by classic SNES and Genesis games',
    aspectRatio: 'instagram',
    defaultAction: 'rendered in stunning pixel art',
    isPixel: true
  },

  'editorial-pure': {
    name: 'Editorial (Pure)',
    style: 'editorial photography, magazine quality, professional studio lighting, centered subject, clean background',
    aspectRatio: 'instagram',
    defaultAction: 'posed for editorial shoot'
  }
};

/**
 * Build prompt for illustration variants (light-top, green-bottom)
 */
function buildIllustrationPrompt(subject, action, variant) {
  const config = VARIANTS[variant];

  if (config.isPhoto) {
    return {
      subject: subject,
      action: action || config.defaultAction,
      style: `${config.style}, shot on Sony A7IV, 35mm lens, natural daylight`,
      composition: config.composition,
      mood: 'authentic, hopeful, community spirit',
      rendering: 'Real photograph. No illustration. Natural colors, genuine atmosphere.'
    };
  }

  if (config.isPixel) {
    return {
      subject: subject,
      action: action || config.defaultAction,
      style: `${config.style}, inspired by classic SNES and Genesis games`,
      composition: config.composition,
      color_palette: ['rich greens', 'warm earth tones', 'vibrant accents'],
      rendering: 'Pure pixel art. Every pixel carefully placed. Dithering for gradients. Retro gaming masterpiece.'
    };
  }

  return {
    subject: subject,
    action: action || config.defaultAction,
    style: `${config.style}, soft diffused lighting`,
    composition: config.composition,
    color_palette: ['muted forest green', 'soft sage green', 'warm cream'],
    rendering: 'Pure visual illustration. Wordless artistic scene. Soft edges, gentle atmosphere.'
  };
}

/**
 * Flatten prompt object to natural language string
 * Optimized Priority Order: Subject → Action → Style → Context → Details
 */
function flattenPromptToString(promptData) {
  const parts = [
    promptData.subject,
    promptData.action,
    promptData.style,
    promptData.composition ? `Composition: ${promptData.composition}` : null,
    promptData.color_palette ? `Colors: ${Array.isArray(promptData.color_palette) ? promptData.color_palette.join(', ') : promptData.color_palette}` : null,
    promptData.mood ? `Mood: ${promptData.mood}` : null,
    promptData.lighting ? `Lighting: ${promptData.lighting}` : null,
    promptData.rendering
  ].filter(Boolean);

  return parts.join('. ');
}

/**
 * Main prompt builder function
 * Returns formatted prompt string based on variant
 *
 * @param {Object} options
 * @param {string} options.variant - Variant ID
 * @param {string} options.subject - Main subject
 * @param {string} options.action - What subject is doing (optional)
 * @returns {Object} { prompt: string, dimensions: {width, height} }
 */
function buildFluxPrompt(options) {
  const {
    variant = 'light-top',
    subject,
    action
  } = options;

  const variantConfig = VARIANTS[variant] || VARIANTS['light-top'];
  const aspectConfig = ASPECT_RATIOS[variantConfig.aspectRatio] || ASPECT_RATIOS['instagram'];

  let promptData;

  switch (variant) {
    case 'light-top':
    case 'green-bottom':
    case 'realistic-top':
    case 'realistic-bottom':
    case 'pixel-top':
    case 'pixel-bottom':
    case 'editorial':
    case 'illustration-pure':
    case 'realistic-pure':
    case 'pixel-pure':
    case 'editorial-pure':
    default:
      promptData = buildIllustrationPrompt(subject, action, variant);
      break;
  }

  const prompt = flattenPromptToString(promptData);

  return {
    prompt,
    dimensions: {
      width: aspectConfig.width,
      height: aspectConfig.height,
      ratio: aspectConfig.ratio
    }
  };
}

/**
 * Get available variants with their configurations
 */
function getVariants() {
  return Object.keys(VARIANTS).map(key => {
    const config = VARIANTS[key];
    const aspect = ASPECT_RATIOS[config.aspectRatio];
    return {
      id: key,
      name: config.name,
      aspectRatio: aspect?.ratio,
      dimensions: aspect ? `${aspect.width}x${aspect.height}` : null,
      useCase: aspect?.useCase
    };
  });
}

/**
 * Get aspect ratio configurations
 */
function getAspectRatios() {
  return ASPECT_RATIOS;
}

export { buildFluxPrompt, buildIllustrationPrompt, flattenPromptToString, getVariants, getAspectRatios, VARIANTS, ASPECT_RATIOS, BRAND_COLORS };