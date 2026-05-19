export type TextProvider = 'mistral' | 'litellm' | 'regolo';
export type ImageBackend = 'hosted' | 'regolo' | 'ionos';

export type Provider = TextProvider;

export type TextModelId =
  | 'mistral-medium-3.5'
  | 'litellm'
  | 'gemma-litellm'
  | 'qwen-regolo'
  | 'qwen3.6-regolo';

export type ImageModelId = 'flux-klein' | 'flux-pro' | 'flux-max' | 'regolo-image' | 'ionos-image';

export type ModelId = TextModelId | ImageModelId;

export type ModelRegion = 'eu' | 'us' | 'cn' | 'self-hosted';

export type ModelIcon = 'sparkles' | 'server' | 'zap' | 'brain';

interface BaseModelOption {
  name: string;
  description: string;
  icon: ModelIcon;
  region: ModelRegion;
}

export interface TextModelOption extends BaseModelOption {
  modality: 'text';
  id: TextModelId;
  provider: TextProvider;
  model: string;
  offByDefault?: boolean;
}

export interface ImageModelOption extends BaseModelOption {
  modality: 'image';
  id: ImageModelId;
  backend: ImageBackend;
  modelPath?: string;
  costMultiplier: number;
}

export type ModelOption = TextModelOption | ImageModelOption;

export const QWEN_WARNING =
  'Chinesisches Modell – unterliegt staatlicher Zensur. Antworten zu politisch sensiblen Themen können eingeschränkt sein.';

export const MODEL_OPTIONS: ModelOption[] = [
  {
    modality: 'text',
    id: 'gemma-litellm',
    name: '🌳 Gemma 4',
    description: 'Leichtgewichtig, antwortet schnell',
    model: 'gemma',
    provider: 'litellm',
    icon: 'zap',
    region: 'self-hosted',
  },
  {
    modality: 'text',
    id: 'mistral-medium-3.5',
    name: '⭐ Mistral Medium',
    description: 'EU-gehostet, ausgewogen für allgemeine Aufgaben',
    model: 'mistral-medium-2604',
    provider: 'mistral',
    icon: 'sparkles',
    region: 'eu',
  },
  {
    modality: 'text',
    id: 'litellm',
    name: '🌳 GPT-OSS',
    description: 'Selbst gehostet bei Verdigado, Regolo als Overflow',
    model: 'gpt-oss:120b',
    provider: 'litellm',
    icon: 'server',
    region: 'self-hosted',
  },
  {
    modality: 'text',
    id: 'qwen-regolo',
    name: 'Qwen 120B',
    description: 'Groß & vielseitig, für komplexe Aufgaben',
    model: 'qwen3.5-122b',
    provider: 'regolo',
    icon: 'brain',
    region: 'cn',
    offByDefault: true,
  },
  {
    modality: 'text',
    id: 'qwen3.6-regolo',
    name: 'Qwen 3.6 27B',
    description: 'Kompaktes Reasoning-Modell, denkt sichtbar mit',
    model: 'qwen3.6-27b',
    provider: 'regolo',
    icon: 'brain',
    region: 'cn',
    offByDefault: true,
  },
  {
    modality: 'image',
    id: 'flux-pro',
    name: '⭐ Flux Pro',
    description: 'Ausgewogen — Standard für produktive Bildgenerierung',
    backend: 'hosted',
    modelPath: '/v1/flux-2-pro',
    costMultiplier: 1,
    icon: 'sparkles',
    region: 'eu',
  },
  {
    modality: 'image',
    id: 'flux-klein',
    name: '⚡ Flux Klein',
    description: 'Schnell & günstig — verbraucht nur ½ Bild pro Generation',
    backend: 'hosted',
    modelPath: '/v1/flux-2-klein-9b-preview',
    costMultiplier: 0.5,
    icon: 'zap',
    region: 'eu',
  },
  {
    modality: 'image',
    id: 'flux-max',
    name: '👑 Flux Max',
    description: 'Höchste Qualität & Recherche — verbraucht 2 Bilder pro Generation',
    backend: 'hosted',
    modelPath: '/v1/flux-2-max-preview',
    costMultiplier: 2,
    icon: 'brain',
    region: 'eu',
  },
  {
    modality: 'image',
    id: 'regolo-image',
    name: '🌳 Qwen-Image',
    description: 'Selbst gehostet, klimaneutral',
    backend: 'regolo',
    costMultiplier: 1,
    icon: 'server',
    region: 'self-hosted',
  },
  {
    modality: 'image',
    id: 'ionos-image',
    name: 'IONOS Schnell',
    description: 'EU-Cloud, FLUX.1-schnell',
    backend: 'ionos',
    costMultiplier: 1,
    icon: 'server',
    region: 'eu',
  },
];

export const TEXT_MODELS: TextModelOption[] = MODEL_OPTIONS.filter(
  (m): m is TextModelOption => m.modality === 'text'
);

export const IMAGE_MODELS: ImageModelOption[] = MODEL_OPTIONS.filter(
  (m): m is ImageModelOption => m.modality === 'image'
);

export const MODEL_BY_ID: Record<ModelId, ModelOption> = MODEL_OPTIONS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<ModelId, ModelOption>
);

export const TEXT_MODEL_BY_ID: Record<TextModelId, TextModelOption> = TEXT_MODELS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<TextModelId, TextModelOption>
);

export const IMAGE_MODEL_BY_ID: Record<ImageModelId, ImageModelOption> = IMAGE_MODELS.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<ImageModelId, ImageModelOption>
);

export const ALL_MODEL_IDS: ModelId[] = MODEL_OPTIONS.map((m) => m.id);
export const TEXT_MODEL_IDS: TextModelId[] = TEXT_MODELS.map((m) => m.id);
export const IMAGE_MODEL_IDS: ImageModelId[] = IMAGE_MODELS.map((m) => m.id);

export const DEFAULT_IMAGE_MODEL_ID: ImageModelId = 'flux-pro';

export function isModelEnabledByDefault(id: TextModelId): boolean {
  return !TEXT_MODEL_BY_ID[id]?.offByDefault;
}

export const REGION_LABELS: Record<ModelRegion, string> = {
  'self-hosted': 'Klimaneutral',
  eu: 'EU',
  us: 'USA',
  cn: 'Chinesisch',
};

export const REGION_ORDER: ModelRegion[] = ['self-hosted', 'eu', 'us', 'cn'];
