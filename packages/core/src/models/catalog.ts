export type TextProvider = 'mistral' | 'litellm' | 'regolo' | 'greenpt';
export type ImageBackend = 'hosted' | 'regolo';

export type Provider = TextProvider;

/**
 * Die auswählbaren Text-Lanes.
 *
 * Benannte Größen statt Vendormodellen — dieselben Kennungen, die der
 * OpenAI-kompatible Endpunkt (`GATEWAY_LANES` in
 * `apps/api/services/ai/modelGateway.ts`) den Erweiterungen anbietet, damit
 * Web, Mobile und die Add-ins dieselbe Auswahl zeigen. Der Name ist geteilt,
 * das Backend dahinter nicht: hier hängt die Lane an `AVAILABLE_MODELS` im
 * Chat-Stack (Verdigado-Overflow, Fallback-Ketten, Reasoning), dort direkt an
 * einem Scaleway-Upstream. Genau dafür ist ein Lane-Name da — er lässt sich je
 * Oberfläche umhängen, ein Vendormodell im Bundle nicht.
 */
export type TextModelId =
  'gruenerator-small' | 'gruenerator-medium' | 'gruenerator-ultra' | 'greenpt';

/**
 * Die Vendor-IDs, unter denen dieselben Lanes vorher liefen.
 *
 * F0: sie stehen in gespeicherten Modell-Einstellungen
 * (`profiles.user_defaults.models`) und in bereits ausgelieferten
 * Mobile-Bundles. Sie werden deshalb tolerant weitergelesen
 * (`resolveTextModelId`), aber nicht mehr angeboten.
 */
export type LegacyTextModelId = 'mistral-medium-3.5' | 'litellm' | 'gemma-litellm';

export type ImageModelId = 'flux-klein' | 'flux-pro' | 'flux-max' | 'regolo-image';

export type ModelId = TextModelId | ImageModelId;

export type ModelRegion = 'eu' | 'us' | 'self-hosted';

export type ModelIcon = 'sparkles' | 'server' | 'zap' | 'brain';

interface BaseModelOption {
  name: string;
  /** Compact label for narrow screens (no emoji, no version suffix). */
  shortName?: string;
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

export type ImageFamilyId = 'flux' | 'regolo';

export interface ImageModelOption extends BaseModelOption {
  modality: 'image';
  id: ImageModelId;
  family: ImageFamilyId;
  backend: ImageBackend;
  modelPath?: string;
  costMultiplier: number;
  /** Max reference images per edit (FLUX.2 multi-reference). Absent = 1. */
  maxReferenceImages?: number;
  /**
   * Whether generation honors free width/height (format presets, custom px).
   * Absent = false: the backend snaps to the sizes the provider supports
   * (e.g. Regolo/Qwen-Image only renders 256/512/1024 squares).
   */
  supportsCustomDimensions?: boolean;
}

export interface ImageFamilyOption {
  id: ImageFamilyId;
  name: string;
  description: string;
  region: ModelRegion;
}

export type ModelOption = TextModelOption | ImageModelOption;

export const MODEL_OPTIONS: ModelOption[] = [
  {
    modality: 'text',
    id: 'gruenerator-small',
    name: 'Klein',
    description: 'Schnell, für kurze Aufgaben',
    model: 'verdigado-pro',
    provider: 'litellm',
    icon: 'zap',
    region: 'self-hosted',
  },
  {
    modality: 'text',
    id: 'gruenerator-medium',
    name: 'Mittel',
    description: 'Ausgewogen, für den Alltag',
    model: 'gemma4-31b',
    provider: 'regolo',
    icon: 'server',
    region: 'self-hosted',
  },
  {
    modality: 'text',
    id: 'gruenerator-ultra',
    name: 'Ultra',
    description: 'Für anspruchsvolle Aufgaben',
    model: 'mistral-medium-2604',
    provider: 'mistral',
    icon: 'sparkles',
    region: 'eu',
  },
  {
    modality: 'text',
    id: 'greenpt',
    name: 'GreenPT',
    description: 'Klimaneutral, EU-gehostet',
    model: 'mistral-medium-3.5-128b',
    provider: 'greenpt',
    icon: 'server',
    region: 'eu',
    // Lane is wired up end-to-end but not switched on for users yet.
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
    maxReferenceImages: 8,
    supportsCustomDimensions: true,
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
    maxReferenceImages: 4,
    supportsCustomDimensions: true,
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
    maxReferenceImages: 8,
    supportsCustomDimensions: true,
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
];

export const IMAGE_FAMILIES: ImageFamilyOption[] = [
  { id: 'flux', name: '⭐ Flux', description: 'Black Forest Labs (EU)', region: 'eu' },
  {
    id: 'regolo',
    name: '🌳 Qwen-Image',
    description: 'Selbst gehostet, klimaneutral',
    region: 'self-hosted',
  },
];

export const DEFAULT_FLUX_MODEL_ID: ImageModelId = 'flux-pro';
export const FLUX_VARIANT_ORDER: ImageModelId[] = ['flux-klein', 'flux-pro', 'flux-max'];

export function getImageFamily(id: ImageModelId): ImageFamilyId {
  return IMAGE_MODEL_BY_ID[id].family;
}

export function getDefaultModelForFamily(family: ImageFamilyId): ImageModelId {
  if (family === 'regolo') return 'regolo-image';
  return DEFAULT_FLUX_MODEL_ID;
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

/**
 * Wohin eine abgelegte Vendor-ID heute zeigt. Die Zuordnung ist die Lane, die
 * dasselbe Modell fährt — `AVAILABLE_MODELS` im Chat-Stack löst die alten IDs
 * auf dieselben Konfigurationen auf.
 */
export const LEGACY_TEXT_MODEL_ALIASES: Readonly<Record<LegacyTextModelId, TextModelId>> = {
  litellm: 'gruenerator-small',
  'gemma-litellm': 'gruenerator-medium',
  'mistral-medium-3.5': 'gruenerator-ultra',
};

/**
 * Eine beliebige gespeicherte Modell-Kennung auf eine aktuelle Lane bringen.
 * `null` für alles Unbekannte, damit ein Aufrufer den Unterschied zwischen
 * „veraltet" und „gibt es nicht" sieht.
 */
export function resolveTextModelId(raw: string): TextModelId | null {
  if (Object.prototype.hasOwnProperty.call(TEXT_MODEL_BY_ID, raw)) return raw as TextModelId;
  return LEGACY_TEXT_MODEL_ALIASES[raw as LegacyTextModelId] ?? null;
}

export const REGION_LABELS: Record<ModelRegion, string> = {
  'self-hosted': 'Klimaneutral',
  eu: 'EU',
  us: 'USA',
};

export const REGION_ORDER: ModelRegion[] = ['self-hosted', 'eu', 'us'];
