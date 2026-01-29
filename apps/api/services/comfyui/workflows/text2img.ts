export interface Text2ImgWorkflowOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
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

export function buildText2ImgWorkflow(options: Text2ImgWorkflowOptions): ComfyUIWorkflow {
  const {
    prompt,
    negativePrompt = DEFAULT_NEGATIVE_PROMPT,
    width = 1024,
    height = 1024,
    steps = 20,
    cfg = 1.0,
    seed = Math.floor(Math.random() * 2147483647),
    denoise = 1.0,
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

    // Positive prompt encoding
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: prompt,
        clip: ['2', 0],
      },
      _meta: { title: 'Positive Prompt' },
    },

    // Negative prompt encoding
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negativePrompt,
        clip: ['2', 0],
      },
      _meta: { title: 'Negative Prompt' },
    },

    // Empty latent image
    '6': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width,
        height,
        batch_size: 1,
      },
      _meta: { title: 'Empty Latent' },
    },

    // KSampler
    '7': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: sampler,
        scheduler,
        denoise,
        model: ['1', 0],
        positive: ['4', 0],
        negative: ['5', 0],
        latent_image: ['6', 0],
      },
      _meta: { title: 'KSampler' },
    },

    // VAE Decode
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['7', 0],
        vae: ['3', 0],
      },
      _meta: { title: 'VAE Decode' },
    },

    // Save Image
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'ComfyUI_FLUX',
        images: ['8', 0],
      },
      _meta: { title: 'Save Image' },
    },
  };
}

export default buildText2ImgWorkflow;
