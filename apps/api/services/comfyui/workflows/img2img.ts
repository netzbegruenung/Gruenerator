export interface Img2ImgWorkflowOptions {
  prompt: string;
  negativePrompt?: string;
  imageFilename: string;
  steps?: number;
  cfg?: number;
  seed?: number;
  denoise?: number;
  scheduler?: string;
  sampler?: string;
}

export interface ComfyUIWorkflow {
  [nodeId: string]: {
    class_type: string;
    inputs: Record<string, unknown>;
    _meta?: { title: string };
  };
}

const DEFAULT_NEGATIVE_PROMPT =
  'blurry, ugly, distorted, low quality, artifacts, worst quality, watermark, text';

export function buildImg2ImgWorkflow(options: Img2ImgWorkflowOptions): ComfyUIWorkflow {
  const {
    prompt,
    negativePrompt = DEFAULT_NEGATIVE_PROMPT,
    imageFilename,
    steps = 20,
    cfg = 1.0,
    seed = Math.floor(Math.random() * 2147483647),
    denoise = 0.7,
    scheduler = 'simple',
    sampler = 'euler',
  } = options;

  return {
    // UNET Loader - Load FLUX.2 Klein model
    '1': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: 'flux2-klein-9b-fp8.safetensors',
        weight_dtype: 'fp8_e4m3fn',
      },
      _meta: { title: 'Load FLUX.2 Klein' },
    },

    // CLIP Loader - Load T5-XXL text encoder
    '2': {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: 'clip_l.safetensors',
        clip_name2: 't5xxl_fp8_e4m3fn.safetensors',
        type: 'flux',
      },
      _meta: { title: 'Load CLIP' },
    },

    // VAE Loader
    '3': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: 'ae.safetensors',
      },
      _meta: { title: 'Load VAE' },
    },

    // Load input image
    '4': {
      class_type: 'LoadImage',
      inputs: {
        image: imageFilename,
      },
      _meta: { title: 'Load Input Image' },
    },

    // VAE Encode - convert input image to latent
    '5': {
      class_type: 'VAEEncode',
      inputs: {
        pixels: ['4', 0],
        vae: ['3', 0],
      },
      _meta: { title: 'VAE Encode' },
    },

    // Positive prompt encoding
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: prompt,
        clip: ['2', 0],
      },
      _meta: { title: 'Positive Prompt' },
    },

    // Negative prompt encoding
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negativePrompt,
        clip: ['2', 0],
      },
      _meta: { title: 'Negative Prompt' },
    },

    // KSampler - runs the diffusion process
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: sampler,
        scheduler,
        denoise,
        model: ['1', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
      _meta: { title: 'KSampler' },
    },

    // VAE Decode - convert latent back to image
    '9': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['8', 0],
        vae: ['3', 0],
      },
      _meta: { title: 'VAE Decode' },
    },

    // Save Image
    '10': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'ComfyUI_FLUX_edit',
        images: ['9', 0],
      },
      _meta: { title: 'Save Image' },
    },
  };
}

export default buildImg2ImgWorkflow;
