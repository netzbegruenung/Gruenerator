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

export type ImageFamilyId = 'flux' | 'regolo' | 'ionos';

export interface ImageModelOption extends BaseModelOption {
  modality: 'image';
  id: ImageModelId;
  family: ImageFamilyId;
  backend: ImageBackend;
  modelPath?: string;
  costMultiplier: number;
}

export interface ImageFamilyOption {
  id: ImageFamilyId;
  name: string;
  description: string;
  region: ModelRegion;
}

export type ModelOption = TextModelOption | ImageModelOption;

export const QWEN_WARNING =
  'Chinesisches Modell – unterliegt staatlicher Zensur. Antworten zu politisch sensiblen Themen können eingeschränkt sein.';

export const MODEL_OPTIONS: ModelOption[] = [
  {
    modality: 'text',
    id: 'gemma-litellm',
    name: '🌳 Gemma 4',
    description: 'Am besten für Kreativtexte',
    model: 'gemma',
    provider: 'litellm',
    icon: 'zap',
    region: 'self-hosted',
  },
  {
    modality: 'text',
    id: 'mistral-medium-3.5',
    name: '⭐ Mistral Medium',
    description: 'Bester Allrounder',
    model: 'mistral-medium-2604',
    provider: 'mistral',
    icon: 'sparkles',
    region: 'eu',
  },
  {
    modality: 'text',
    id: 'litellm',
    name: '🌳 GPT-OSS',
    description: 'Schnellstes Modell',
    model: 'gpt-oss:120b',
    provider: 'litellm',
    icon: 'server',
    region: 'self-hosted',
  },
  {
    modality: 'text',
    id: 'qwen-regolo',
    name: 'Qwen 120B',
    description: 'Chinesisch, groß & vielseitig',
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
    description: 'Chinesisch, mit Reasoning',
    model: 'qwen3.6-27b',
    provider: 'regolo',
    icon: 'brain',
    region: 'cn',
    offByDefault: true,
  },
  {
    modality: 'image',
    id: 'flux-pro',
    family: 'flux',
    name: '⭐ Flux Pro',
    description: 'Ausgewogener Standard (1 Bild)',
    backend: 'hosted',
    modelPath: '/v1/flux-2-pro',
    costMultiplier: 1,
    icon: 'sparkles',
    region: 'eu',
  },
  {
    modality: 'image',
    id: 'flux-klein',
    family: 'flux',
    name: '⭐ Flux Klein',
    description: 'Schnell & günstig (½ Bild)',
    backend: 'hosted',
    modelPath: '/v1/flux-2-klein-9b',
    costMultiplier: 0.5,
    icon: 'zap',
    region: 'eu',
  },
  {
    modality: 'image',
    id: 'flux-max',
    family: 'flux',
    name: '⭐ Flux Max',
    description: 'Höchste Qualität (2 Bilder)',
    backend: 'hosted',
    modelPath: '/v1/flux-2-max',
    costMultiplier: 2,
    icon: 'brain',
    region: 'eu',
  },
  {
    modality: 'image',
    id: 'regolo-image',
    family: 'regolo',
    name: '🌳 Qwen-Image',
    description: 'Selbst gehostet, eigener Stil',
    backend: 'regolo',
    costMultiplier: 1,
    icon: 'server',
    region: 'self-hosted',
  },
  {
    modality: 'image',
    id: 'ionos-image',
    family: 'ionos',
    name: '🌳 IONOS Schnell',
    description: 'Schnell, EU-Cloud',
    backend: 'ionos',
    costMultiplier: 1,
    icon: 'server',
    region: 'self-hosted',
  },
];

export const IMAGE_FAMILIES: ImageFamilyOption[] = [
  { id: 'flux', name: '⭐ Flux', description: 'Black Forest Labs (EU)', region: 'eu' },
  {
    id: 'regolo',
    name: '🌳 Qwen-Image',
    description: 'Selbst gehostet, klimaneutral',
    region: 'self-hosted',
  },
  {
    id: 'ionos',
    name: '🌳 IONOS Schnell',
    description: 'EU-Cloud, klimaneutral',
    region: 'self-hosted',
  },
];

export const DEFAULT_FLUX_MODEL_ID: ImageModelId = 'flux-pro';
export const FLUX_VARIANT_ORDER: ImageModelId[] = ['flux-klein', 'flux-pro', 'flux-max'];

export function getImageFamily(id: ImageModelId): ImageFamilyId {
  return IMAGE_MODEL_BY_ID[id].family;
}

export function getDefaultModelForFamily(family: ImageFamilyId): ImageModelId {
  if (family === 'flux') return DEFAULT_FLUX_MODEL_ID;
  if (family === 'regolo') return 'regolo-image';
  return 'ionos-image';
}

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
